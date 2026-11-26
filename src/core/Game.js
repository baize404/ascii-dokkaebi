import { PerspectiveCamera, Vector3 } from 'three';
import { AudioManager } from '../audio/AudioManager.js';
import { CODEX } from '../data/codex.js';
import { heightAt, LEVEL } from '../data/level.js';
import { CHAPTERS, LANTERN_ORDER } from '../data/story.js';
import { Achievements } from '../game/Achievements.js';
import { CameraRig } from '../game/CameraRig.js';
import { GameState } from '../game/GameState.js';
import { SaveSystem } from '../game/SaveSystem.js';
import { Session } from '../game/Session.js';
import { Renderer } from '../render/Renderer.js';
import { Cutscene } from '../ui/Cutscene.js';
import { Dialogue } from '../ui/Dialogue.js';
import { Hud } from '../ui/Hud.js';
import { Joystick } from '../ui/Joystick.js';
import { Minimap } from '../ui/Minimap.js';
import { Panels } from '../ui/Panels.js';
import { Screens } from '../ui/Screens.js';
import { updatePointScale } from '../world/Particles.js';
import { World } from '../world/World.js';
import { EventBus } from './EventBus.js';
import { Input } from './Input.js';
import { Settings } from './Settings.js';

const CODEX_KEY = 'ascii-dokkaebi.codex';

/**
 * 應用程式主控：主選單、設定、自動畫質、暫停、存讀檔、成就與圖鑑；
 * 一次遊玩的內容交給 Session。
 * mode：title → cutscene／playing → ending
 */
export class Game {
  constructor({ canvas, maxDt = 0.05 }) {
    this.maxDt = maxDt;
    this.bus = new EventBus();
    this.touch = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
    document.documentElement.dataset.touch = String(this.touch);

    this.settings = new Settings(this.bus);
    this.saves = new SaveSystem();
    this.achievements = new Achievements();
    this.codex = this.#loadCodex();

    this.renderer = new Renderer(canvas);
    this.camera = new PerspectiveCamera(38, 1, 0.1, 400);
    this.rig = new CameraRig(this.camera);
    this.input = new Input({ canvas, bus: this.bus });
    this.audio = new AudioManager(this.settings, this.bus);
    this.hud = new Hud(this.bus, { touch: this.touch });
    this.dialogue = new Dialogue(this.bus);
    this.cutscene = new Cutscene(this.bus);
    this.panels = new Panels(this.bus, { settings: this.settings });
    this.screens = new Screens(this.bus);
    this.minimap = new Minimap();
    this.minimapCanvas = document.getElementById('minimap');
    this.joystick = new Joystick((v) => this.input.setJoystick(v));

    this.mode = 'title';
    this.session = null;
    this.preview = new World(LEVEL, LANTERN_ORDER);
    this.autoQuality = this.touch ? 'medium' : 'high';
    this.fps = 60;
    this.perfTimer = 0;
    this.lastTime = 0;

    this.renderer.onResize = (w, h) => this.rig.setAspect(w / h);
    this.renderer.resize();
    this.#applyAllSettings();
    this.#bindEvents();
    this.#showTitle();
  }

  get scene() {
    return this.session?.scene ?? this.preview.scene;
  }

  get world() {
    return this.session?.world ?? this.preview;
  }

  // ---------- 設定 ----------

  get effectiveQuality() {
    const q = this.settings.get('quality');
    return q === 'auto' ? this.autoQuality : q;
  }

  #applyAllSettings() {
    for (const key of Object.keys(this.settings.values)) this.#applySetting(key);
  }

  #applySetting(key) {
    const v = this.settings.get(key);
    const root = document.documentElement;
    switch (key) {
      case 'ascii':
        this.renderer.asciiEnabled = v;
        break;
      case 'density':
        this.renderer.setDensity(v);
        break;
      case 'quality':
        this.#applyQuality();
        break;
      case 'uiScale':
        root.dataset.uiScale = v;
        break;
      case 'cameraShake':
        this.rig.shakeEnabled = v && !this.settings.get('reduceMotion');
        break;
      case 'reduceMotion':
        root.dataset.reduceMotion = String(v);
        this.dialogue.instantText = v;
        this.rig.shakeEnabled = this.settings.get('cameraShake') && !v;
        this.world.setReduceMotion(v);
        break;
      case 'showFps':
        this.hud.setFps(v ? this.fps : null);
        break;
      default:
        break;
    }
  }

  #applyQuality() {
    const q = this.effectiveQuality;
    this.renderer.setQuality(q);
    this.world.setQuality(q);
  }

  /** 自動畫質：幀率持續偏低就降一級（不會自動升級，避免來回跳動） */
  #monitorPerformance(dt) {
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    this.perfTimer += dt;
    if (this.perfTimer < 3) return;
    this.perfTimer = 0;
    if (this.settings.get('showFps')) this.hud.setFps(this.fps);
    if (this.settings.get('quality') !== 'auto' || this.mode !== 'playing') return;
    const next = this.autoQuality === 'high' && this.fps < 40 ? 'medium' : this.autoQuality === 'medium' && this.fps < 26 ? 'low' : null;
    if (next) {
      this.autoQuality = next;
      this.#applyQuality();
    }
  }

  // ---------- 圖鑑與成就（跨存檔保存） ----------

  #loadCodex() {
    try {
      const ids = JSON.parse(localStorage.getItem(CODEX_KEY) ?? '[]');
      return new Set(Array.isArray(ids) ? ids.filter((id) => CODEX.some((c) => c.id === id)) : []);
    } catch {
      return new Set();
    }
  }

  unlockCodex(id, title) {
    if (!this.codex.has(id)) {
      this.codex.add(id);
      try {
        localStorage.setItem(CODEX_KEY, JSON.stringify([...this.codex]));
      } catch {
        // 忽略
      }
    }
    this.hud.toast(`民俗圖鑑：${title}`);
  }

  checkAchievements(summary) {
    const fresh = this.achievements.evaluate(summary);
    for (const a of fresh) {
      this.hud.toast(`解鎖成就：${a.title}`);
      this.audio.sfx.play('achievement');
    }
    return fresh;
  }

  // ---------- 流程 ----------

  setMode(mode) {
    this.mode = mode;
    const playing = mode === 'playing';
    this.hud.show(playing);
    this.joystick.show(playing && this.touch);
    if (!playing) this.hud.setPrompt('');
  }

  #continueInfo() {
    const data = this.saves.peek();
    if (!this.saves.hasSave() || !data) return null;
    const chapter = CHAPTERS[GameState.fromJSON(data.state).chapter] ?? '';
    const when = data.savedAt ? new Date(data.savedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return `${chapter}　${when}`;
  }

  #showTitle() {
    let info = null;
    try {
      info = this.#continueInfo();
    } catch {
      info = null;
    }
    this.setMode('title');
    this.rig.title();
    this.screens.showTitle(true, info);
  }

  #startSession(session, fromSave) {
    this.session?.dispose();
    this.session = session;
    this.preview?.dispose();
    this.preview = null;
    this.dialogue.reset();
    this.screens.showTitle(false);
    this.screens.hideEnd();
    this.#applyAllSettings();
    this.audio.music.setMood('night');
    this.audio.ambience.setMood('night');
    session.begin({ fromSave });
  }

  newGame() {
    this.audio.unlock();
    this.saves.clear();
    this.#startSession(new Session(this, { state: new GameState() }), false);
  }

  continueGame() {
    this.audio.unlock();
    const loaded = this.saves.load();
    if (!loaded) {
      this.hud.toast(this.saves.lastError ? '存檔損壞，已改為開始新遊戲' : '沒有可以繼續的存檔');
      this.newGame();
      return;
    }
    this.#startSession(new Session(this, loaded), true);
  }

  returnToTitle() {
    this.session?.save();
    this.session?.dispose();
    this.session = null;
    this.dialogue.reset();
    this.cutscene.end();
    this.panels.close();
    this.screens.hideEnd();
    this.preview = new World(LEVEL, LANTERN_ORDER);
    this.#applyAllSettings();
    this.#showTitle();
  }

  finishGame(session, ending) {
    const summary = session.state.summary();
    const fresh = this.checkAchievements(summary);
    this.setMode('ending');
    this.screens.showEnd({ ending, summary, achievements: fresh });
  }

  #confirmNewGame() {
    if (!this.saves.hasSave()) {
      this.newGame();
      return;
    }
    this.panels.openPause([
      ['確定重新開始（會覆蓋目前的存檔）', () => {
        this.panels.close();
        this.newGame();
      }, true],
      ['取消', () => this.panels.close()],
    ]);
  }

  #openPause() {
    this.panels.openPause([
      ['繼續遊戲', () => this.panels.close(), true],
      ['任務日誌', () => this.#openJournal()],
      ['設定', () => this.panels.openSettings({ onHelp: () => this.panels.openHelp(this.touch) })],
      ['操作說明', () => this.panels.openHelp(this.touch)],
      ['民俗圖鑑', () => this.panels.openCodex(this.codex)],
      ['存檔並回到標題', () => this.returnToTitle()],
    ]);
  }

  #openJournal(tab) {
    const s = this.session;
    if (!s) return;
    this.panels.openJournal(s.state, { onHint: () => s.useHint() });
    if (tab) this.panels.tabsEl.querySelector(`[data-id="${tab}"]`)?.click();
  }

  #openInventory() {
    const s = this.session;
    if (!s) return;
    this.hud.setInventoryBadge(false);
    this.panels.openInventory(s.state, {
      onInspect: (id) => {
        this.panels.close();
        s.inspectItem(id);
      },
      onUse: (id) => {
        this.panels.close();
        s.useItem(id);
      },
      onCombine: (a, b) => s.combine(a, b),
    });
  }

  #bindEvents() {
    const bus = this.bus;
    const playing = () => this.mode === 'playing' && this.session && !this.panels.isOpen;
    bus.on('ui:new', () => this.#confirmNewGame());
    bus.on('ui:continue', () => this.continueGame());
    bus.on('ui:restart', () => this.newGame());
    bus.on('ui:title', () => this.returnToTitle());
    bus.on('ui:settings', () => this.panels.openSettings({ onHelp: () => this.panels.openHelp(this.touch) }));
    bus.on('ui:help', () => this.panels.openHelp(this.touch));
    bus.on('ui:codex', () => this.panels.openCodex(this.codex));
    bus.on('ui:achievements', () => this.panels.openAchievements(this.achievements));
    bus.on('ui:history', () => this.panels.openHistory(this.dialogue.history));

    const journal = () => playing() && !this.dialogue.isOpen && this.#openJournal();
    const inventory = () => playing() && !this.dialogue.isOpen && this.#openInventory();
    const map = () => playing() && this.panels.openMap(this.minimap, this.session.mapData());
    bus.on('ui:journal', journal);
    bus.on('input:journal', journal);
    bus.on('ui:inventory', inventory);
    bus.on('input:inventory', inventory);
    bus.on('ui:map', map);
    bus.on('input:map', map);
    bus.on('ui:hint', () => playing() && !this.dialogue.isOpen && this.#openJournal('hints'));
    bus.on('ui:pause', () => playing() && this.#openPause());
    bus.on('input:escape', () => {
      if (this.panels.isOpen) this.panels.close();
      else if (this.mode === 'playing' && !this.dialogue.isOpen) this.#openPause();
    });
    bus.on('input:help', () => (this.panels.isOpen ? this.panels.close() : this.panels.openHelp(this.touch)));
    bus.on('ui:interact', () => playing() && this.session.tryInteract());
    bus.on('input:action', () => {
      if (playing() && !this.dialogue.isOpen && !this.session.busy) this.session.tryInteract();
    });
    bus.on('input:tap', (p) => {
      if (this.panels.isOpen || !this.session) return;
      this.audio.unlock();
      this.session.onTap(p);
    });
    bus.on('input:toggleAscii', () => this.settings.set('ascii', !this.settings.get('ascii')));
    bus.on('input:zoom', (d) => this.rig.zoomBy(d));
    bus.on('settings:change', ({ key }) => this.#applySetting(key));
    document.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.session?.save();
    });
    window.addEventListener('pagehide', () => this.session?.save());
  }

  // ---------- 主迴圈 ----------

  start() {
    this.renderer.setAnimationLoop((now) => this.#frame(now));
  }

  #moveVector() {
    const v = this.input.moveVector();
    if (!v.x && !v.y) return null;
    const { forward, right } = this.rig.groundAxes();
    const mx = forward.x * v.y + right.x * v.x;
    const mz = forward.z * v.y + right.z * v.x;
    const len = Math.hypot(mx, mz);
    const speed = Math.min(1, Math.hypot(v.x, v.y));
    return { x: (mx / len) * speed, z: (mz / len) * speed };
  }

  #frame(now) {
    const dt = Math.min(this.maxDt, (now - (this.lastTime || now)) / 1000);
    this.lastTime = now;
    const paused = this.panels.isOpen;
    if (!paused) {
      if (this.session) this.session.update(dt, this.#moveVector(), this.mode === 'playing');
      else this.preview?.update(dt);
      this.rig.update(dt);
    }
    updatePointScale(this.world.pointMaterials, this.renderer.sceneHeight, this.camera.fov);
    this.renderer.render(this.scene, this.camera);
    this.#monitorPerformance(dt);
  }

  // ---------- 自動化測試介面（網址加上 ?test 才會掛到 window） ----------

  testApi() {
    const s = () => this.session;
    return {
      state: () => {
        const ss = s();
        const st = ss?.state;
        return {
          mode: this.mode,
          busy: ss?.busy ?? false,
          dialogueOpen: this.dialogue.isOpen,
          panelOpen: this.panels.isOpen,
          chapter: st?.chapter ?? 0,
          player: ss ? { x: ss.player.position.x, z: ss.player.position.z } : null,
          path: ss?.player.path ?? [],
          nearest: ss?.nearest?.id ?? null,
          inventory: st?.inventory.list() ?? [],
          clues: st ? [...st.clues] : [],
          landmarks: st ? [...st.landmarks] : [],
          flags: st ? { ...st.flags } : null,
          stats: st ? { ...st.stats } : null,
          litSpots: st?.litSpots() ?? [],
          layout: st?.lanternLayout ?? [],
          objective: document.getElementById('objective-text').textContent,
          ascii: this.renderer.asciiEnabled,
          quality: this.effectiveQuality,
          density: this.renderer.density,
          codex: [...this.codex],
          achievements: Object.keys(this.achievements.unlocked),
          hasSave: this.saves.hasSave(),
          fps: this.fps,
          ropeOpen: ss?.world.ropeOpen ?? false,
        };
      },
      interactables: () => (s() ? s().world.activeInteractables().map(({ id, x, z }) => ({ id, x, z })) : []),
      teleport: (x, z) => s()?.player.setPosition(x, z),
      projectToScreen: (x, y, z) => {
        const v = new Vector3(x, y ?? heightAt(x, z), z).project(this.camera);
        return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
      },
      riddleAnswer: () => s()?.state.currentRiddle()?.answer ?? null,
      shellAnswer: () => s()?.state.shell.round?.answer ?? null,
      carvingAt: (spot) => s()?.state.carvingAt(spot),
      save: () => s()?.save(),
      /** 查詢「如果在這個螢幕位置點一下」會點到什麼（唯讀，不會移動角色） */
      pickAt: (sx, sy) => {
        const ss = s();
        if (!ss) return { kind: 'none' };
        const ndc = { x: (sx / window.innerWidth) * 2 - 1, y: -(sy / window.innerHeight) * 2 + 1 };
        ss.raycaster.setFromCamera(ndc, this.camera);
        const hit = ss.raycaster.intersectObjects(ss.world.pickables, true)[0];
        if (!hit) return { kind: 'none' };
        let o = hit.object;
        while (o && !o.userData.interactId) o = o.parent;
        return o ? { kind: 'object', id: o.userData.interactId } : { kind: 'ground', x: hit.point.x, z: hit.point.z };
      },
    };
  }
}
