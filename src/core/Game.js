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
import { AdaptiveQuality } from './AdaptiveQuality.js';
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
    this.input.onReset = () => this.joystick.reset();

    this.mode = 'title';
    this.session = null;
    this.preview = new World(LEVEL, LANTERN_ORDER);
    // 自適應畫質：手機從中間的階梯開始
    this.adaptive = new AdaptiveQuality({ start: this.touch ? 2 : 0 });
    this.fps = 60;
    this.perfTimer = 0;
    this.lastTime = 0;

    this.renderer.onResize = (w, h, layout) => {
      this.rig.setAspect(w / h);
      // ASCII 模式下鏡頭對齊字元格，靜止的景物不會因鏡頭微動而閃爍
      this.rig.cellRows = this.renderer.asciiEnabled ? layout.rows : 0;
    };
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
    return q === 'auto' ? this.adaptive.step.quality : q;
  }

  /** 把設定（含自適應的部分）套用到渲染器與場景 */
  #applyRender() {
    const s = this.settings;
    const step = this.adaptive.step;
    const density = s.get('density');
    const sampling = s.get('sampling');
    const quality = this.effectiveQuality;
    // 對話、調查特寫時（鏡頭拉近）自適應模式提高取樣，看清楚手部與表情
    const closeUp = this.rig.focusAmount > 0.5 && density === 'adaptive' && sampling === 'auto' && quality !== 'low';
    this.renderer.set({
      mode: s.get('renderMode'),
      density: density === 'adaptive' ? step.density : density,
      samples: sampling === 'auto' ? (density === 'adaptive' ? (closeUp ? Math.min(8, step.samples * 2) : step.samples) : 'auto') : sampling,
      pixelRatio: s.get('pixelRatio'),
      quality,
      shape: s.get('glyphShape'),
      weight: s.get('glyphWeight'),
    });
    this.world.setQuality(quality, s.get('shadows'));
    this.rig.cellRows = this.renderer.asciiEnabled ? this.renderer.layout.rows : 0;
  }

  #applyAllSettings() {
    for (const key of Object.keys(this.settings.values)) this.#applySetting(key);
  }

  #applySetting(key) {
    const v = this.settings.get(key);
    const root = document.documentElement;
    switch (key) {
      case 'renderMode':
      case 'density':
      case 'sampling':
      case 'quality':
      case 'pixelRatio':
      case 'shadows':
      case 'glyphShape':
      case 'glyphWeight':
        this.#applyRender();
        break;
      case 'uiScale':
        root.dataset.uiScale = v;
        break;
      case 'cameraShake':
        this.rig.shakeEnabled = v && !this.settings.get('reduceMotion');
        break;
      case 'cameraView': {
        this.rig.setView(v);
        const btn = document.getElementById('btn-view');
        if (btn) {
          btn.textContent = v === 'close' ? '遠景' : '近景';
          btn.setAttribute('aria-pressed', String(v === 'close'));
        }
        break;
      }
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
    this.#applyRender();
  }

  /** 自適應畫質：交給 AdaptiveQuality 判斷（遲滯＋冷卻），只有設成自動的項目會跟著變 */
  #monitorPerformance(dt) {
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    this.frameMs = (this.frameMs ?? 16) * 0.95 + dt * 1000 * 0.05;
    this.perfTimer += dt;
    if (this.perfTimer >= 1) {
      this.perfTimer = 0;
      if (this.settings.get('showFps')) this.hud.setFps(this.fps, this.renderer.layout);
    }
    const s = this.settings;
    const adaptive = s.get('quality') === 'auto' || s.get('density') === 'adaptive';
    if (!adaptive || this.mode !== 'playing' || this.frozen) return;
    if (this.adaptive.update(dt) !== null) this.#applyRender();
    // 鏡頭拉近／拉遠時更新特寫取樣
    const close = this.rig.focusAmount > 0.5;
    if (close !== this.wasClose) {
      this.wasClose = close;
      this.#applyRender();
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
      ['設定', () => this.panels.openSettings({ onHelp: () => this.panels.openHelp(this.touch), preview: () => ({ layout: this.renderer.layout, atlas: this.renderer.atlas }) })],
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
    bus.on('ui:settings', () => this.panels.openSettings({ onHelp: () => this.panels.openHelp(this.touch), preview: () => ({ layout: this.renderer.layout, atlas: this.renderer.atlas }) }));
    bus.on('ui:help', () => this.panels.openHelp(this.touch));
    bus.on('ui:codex', () => this.panels.openCodex(this.codex));
    bus.on('ui:achievements', () => this.panels.openAchievements(this.achievements));
    bus.on('ui:history', () => this.panels.openHistory(this.dialogue.history));

    const journal = () => playing() && !this.dialogue.isOpen && this.#openJournal();
    const inventory = () => playing() && !this.dialogue.isOpen && this.#openInventory();
    const travel = (id) => {
      this.panels.close();
      this.session?.travelTo(id);
    };
    const map = () => playing() && !this.dialogue.isOpen && this.panels.openMap(this.minimap, this.session.mapData(), travel);
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
      if (playing() && !this.dialogue.isOpen) this.session.tryInteract();
    });
    bus.on('input:tap', (p) => {
      if (this.panels.isOpen || !this.session) return;
      this.audio.unlock();
      this.session.onTap(p);
    });
    bus.on('input:toggleAscii', () => {
      const mode = this.settings.get('renderMode');
      if (mode === '3d') this.settings.set('renderMode', this.lastAsciiMode ?? 'hd');
      else {
        this.lastAsciiMode = mode;
        this.settings.set('renderMode', '3d');
      }
    });
    bus.on('input:zoom', (d) => this.rig.zoomBy(d));
    const toggleView = () => {
      if (this.mode !== 'playing') return;
      const next = this.settings.get('cameraView') === 'close' ? 'explore' : 'close';
      this.settings.set('cameraView', next);
      this.hud.toast(next === 'close' ? '近景：看得清楚角色的動作' : '遠景：看得清楚道路與地標');
    };
    bus.on('input:cameraView', toggleView);
    bus.on('ui:cameraView', toggleView);
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
    const paused = this.panels.isOpen || this.frozen;
    if (!paused) {
      if (this.session) this.session.update(dt, this.#moveVector(), this.mode === 'playing');
      else this.preview?.update(dt);
      this.rig.update(dt);
    }
    // 凍結（測試工具逐格推進）時由測試工具自己渲染，主迴圈不重複渲染同一格
    if (this.frozen) return;
    updatePointScale(this.world.pointMaterials, this.renderer.sceneHeight, this.camera.fov);
    this.renderer.render(this.scene, this.camera);
    this.#monitorPerformance(dt);
  }

  /** 測試工具：用目前的鏡頭重畫一格 */
  #renderNow() {
    updatePointScale(this.world.pointMaterials, this.renderer.sceneHeight, this.camera.fov);
    this.renderer.render(this.scene, this.camera);
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
          phase: ss?.phase ?? null,
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
          renderMode: this.renderer.mode,
          adaptiveLevel: this.adaptive.level,
          codex: [...this.codex],
          achievements: Object.keys(this.achievements.unlocked),
          hasSave: this.saves.hasSave(),
          fps: this.fps,
          ropeOpen: ss?.world.ropeOpen ?? false,
          zoom: this.rig.userZoom,
          toasts: this.hud.log ?? [],
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
      /** 固定鏡頭（比較截圖用）：凍結時間並把鏡頭放到指定位置 */
      photo: (pos, look) => {
        this.frozen = true;
        this.rig.snapShot(new Vector3(...pos), new Vector3(...look));
        this.rig.update(0);
        this.#renderNow();
      },
      /** 切換渲染模式與字元密度（等同在設定裡切換） */
      setRender: (render, density, sampling) => {
        this.settings.set('renderMode', render === 'ascii' ? 'hd' : render);
        if (density && density !== '-') this.settings.set('density', density);
        if (sampling) this.settings.set('sampling', String(sampling));
      },
      /** 直接改一個設定（等同在設定面板操作） */
      setSetting: (key, value) => this.settings.set(key, value),
      layout: () => ({ ...this.renderer.layout, mode: this.renderer.mode, atlas: { pure: this.renderer.atlas.pure, hd: this.renderer.atlas.hd } }),
      /** 逐格推進遊戲（凍結狀態下使用；錄影與姿勢截圖用，dt 固定） */
      step: (frames = 1, dt = 1 / 30, move = null, skipRender = false) => {
        const ss = s();
        for (let i = 0; i < frames; i++) {
          if (ss) ss.update(dt, move, this.mode === 'playing');
          else this.preview?.update(dt);
          if (!this.rig.lockedShot) this.rig.update(dt);
          if (!skipRender) this.#renderNow();
        }
        if (frames === 0) this.#renderNow();
      },
      /** 讓主角播放某個動作片段 */
      act: (clip) => {
        s()?.player.act(clip, { cancelable: false });
      },
      /** NPC 動作（錄影用）：npc = grandma | cat | dokkaebi */
      npcAct: (npc, clip) => {
        const w = s()?.world;
        if (!w) return;
        if (npc === 'grandma' && clip === 'wake') return void w.setGrandmaAwake(true);
        if (npc === 'dokkaebi') w.setDokkaebiVisible(true);
        w[npc]?.animator.play(clip);
      },
      /**
       * 錄影用的演出（真的呼叫遊戲裡的同一套動畫與場景函式，只是不經過對話）：
       * door：走到廚房門口開門、再關門；crank：轉三次轆轤；light：點亮一盞石燈；
       * dokkaebi：도깨비登場、大笑、歡呼；moon：月亮回歸、池塘倒影變化
       */
      demo: (name, arg = 0) => {
        const ss = s();
        if (!ss) return;
        const { world: w, player: pl } = ss;
        const run = async () => {
          if (name === 'door') {
            await pl.act('OpenDoor', { events: { swing: () => w.setKitchenDoor(true) } });
            await new Promise((r) => setTimeout(r, 400));
            await pl.act('CloseDoor', { events: { swing: () => w.setKitchenDoor(false) } });
          } else if (name === 'crank') {
            for (let i = 1; i <= 3; i++) await w.crankWell(i, 3, pl);
          } else if (name === 'light') {
            const fire = w.lanternFirePoint(arg);
            const reach = fire.clone().lerp(pl.position.clone().setY(fire.y), 0.28);
            pl.faceTowards(fire);
            await pl.act('LightLantern', { hand: { R: { target: reach, weight: 1, envelope: [0.1, 0.36, 0.62, 0.92] } }, look: fire, events: { ignite: () => w.igniteLantern(arg, true, pl.model.lantern?.getWorldPosition(new Vector3())) } });
          } else if (name === 'dokkaebi') {
            await w.spawnDokkaebi();
            w.dokkaebiReact('laugh');
            await new Promise((r) => setTimeout(r, 1800));
            w.dokkaebiReact('cheer');
          } else if (name === 'moon') {
            await w.returnMoon();
            await w.lightUpVillage();
          }
        };
        run().catch((e) => console.error(e));
      },
      npcPosition: (npc) => {
        const p = s()?.world[npc]?.root.position;
        return p ? { x: p.x, y: p.y, z: p.z } : null;
      },
      animState: () => {
        const a = s()?.player.animator;
        return a ? { state: a.state, history: [...a.history], speed: a.speed, phase: a.phase } : null;
      },
      setYaw: (yaw) => {
        const p = s()?.player;
        if (p) p.yaw = p.targetYaw = yaw;
      },
      /** 鏡頭跟著主角，但用指定的相對位置（錄影用） */
      followShot: (offset, lookHeight = 0.9) => {
        const p = s()?.player.position;
        if (!p) return;
        this.rig.lockedShot = true;
        this.rig.snapShot(new Vector3(p.x + offset[0], p.y + offset[1], p.z + offset[2]), new Vector3(p.x, p.y + lookHeight, p.z));
        this.rig.update(0);
        this.#renderNow();
      },
      releaseShot: () => {
        this.rig.lockedShot = false;
      },
      unfreeze: () => {
        this.frozen = false;
        if (s()) this.rig.follow(s().player.position, true);
      },
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
