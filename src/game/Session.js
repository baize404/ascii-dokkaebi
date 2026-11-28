import { Raycaster, Vector2, Vector3 } from 'three';
import { CODEX } from '../data/codex.js';
import { heightAt, LEVEL } from '../data/level.js';
import { CHAPTERS, CLUES, ENDINGS, ITEMS, TUTORIAL } from '../data/story.js';
import { ExploredGrid } from '../ui/Minimap.js';
import { World } from '../world/World.js';
import { NavGrid } from './Pathfinding.js';
import { Player } from './Player.js';
import { playMoonReturn, playOpening } from './scenes/cinematics.js';
import { lanternScene, ropeScene } from './scenes/lanterns.js';
import { altarScene } from './scenes/shrine.js';
import { villageScenes } from './scenes/village.js';

const AUTOSAVE_SECONDS = 15;
const STELE_MARKER = { x: 0, y: 4.3, z: 19.5 };

/**
 * 一次遊玩（從開始到結局）：持有 GameState、World、Player 與尋路網格，
 * 負責互動分派、區域觸發、新手教學、存檔與地圖迷霧。
 * 重新開始時整個 Session 會被丟掉並 dispose，不會殘留狀態。
 */
/** 地圖清單上的地點名稱（石燈依從村子走過去的方向命名） */
export const PLACE_NAMES = {
  stele: '장승（村口）',
  pond: '池塘',
  kitchen: '廚房',
  jars: '장독대',
  well: '水井',
  storehouse: '倉庫',
  footprints: '發光的腳印',
  grandma: '할머니',
  screen: '할머니家的屏風',
  'house-se': '貼符的門板',
  'lantern-0': '石燈（左前）',
  'lantern-1': '石燈（右前）',
  'lantern-2': '石燈（左後）',
  'lantern-3': '石燈（右後）',
  rope: '금줄',
  altar: '祭壇',
  cat: '黑貓',
};
const SEEN_RADIUS = 10;

export class Session {
  constructor(game, { state, player = null, extra = {} }) {
    this.game = game;
    this.state = state;
    this.world = new World(LEVEL, state.lanternLayout);
    this.nav = new NavGrid(LEVEL.bounds, this.world.colliders);
    const start = player ?? LEVEL.playerStart;
    this.player = new Player(this.world, start, this.nav);
    if (player) this.player.setPosition(player.x, player.z, player.yaw);
    this.player.onStep = (surface) => game.audio.sfx.step(surface);
    this.explored = new ExploredGrid(extra.explored);
    this.tutorial = new Set(Array.isArray(extra.tutorial) ? extra.tutorial : []);
    /** 玩家看過（曾經在附近）的互動地點：地圖上可以點選後自動走過去 */
    this.seen = new Set(Array.isArray(extra.seen) ? extra.seen.filter((id) => PLACE_NAMES[id]) : []);
    this.busy = false;
    this.nearest = null;
    this.shellPickable = false;
    this.autosaveTimer = 0;
    this.mapTimer = 0;
    this.movedDistance = 0;
    this.lastPos = this.player.position.clone();
    this.knownClues = new Set(state.clues);
    this.knownCodex = new Set(state.codexUnlocked());
    this.raycaster = new Raycaster();
    this.disposed = false;
    this.#applyState();
    // 門打開或關上時，碰撞改變 → 重建尋路網格；鏡頭遮擋清單由 World 依玩家是否在屋裡維護
    this.world.onCollidersChanged = () => this.rebuildNav();
    this.world.occluders.push(...this.world.houseGroups.values(), this.world.storehouse.group, ...this.world.swayers, this.world.shrineTree);
    game.rig.occluders = this.world.occluders;
  }

  /** 讀檔後把場景同步成存檔的樣子 */
  #applyState() {
    const { state: s, world: w } = this;
    w.syncLanterns(s.litSpots(), { quiet: true });
    if (s.flags.ropeOpen) {
      w.setRopeOpen(true, true);
      this.rebuildNav();
    }
    if (s.flags.storehouseOpen) w.openStorehouse(true);
    if (s.flags.kitchenDoorOpen) w.setKitchenDoor(true, true);
    if (s.flags.kitchenVisited) w.kitchen.gourd.visible = false;
    w.setWellLevel(s.flags.keyTaken ? 3 : s.flags.wellCranks, 3);
    if (s.flags.grandmaAwake) w.setGrandmaAwake(true, true);
    w.setCatStage(s.flags.catStage, true);
    if (s.flags.offered && !s.flags.finished) {
      w.showOfferings(true, { quiet: true });
      w.setDokkaebiVisible(true);
    }
  }

  rebuildNav() {
    this.nav.rebuild(this.world.colliders);
  }

  get scene() {
    return this.world.scene;
  }

  /** 給劇情腳本使用的工具 */
  #context() {
    const g = this.game;
    return {
      state: this.state,
      world: this.world,
      player: this.player,
      level: LEVEL,
      rig: g.rig,
      hud: g.hud,
      audio: g.audio,
      cutscene: g.cutscene,
      session: this,
      say: (lines) => g.dialogue.say(lines),
      choose: (line, choices, opts) => g.dialogue.choose(line, choices, opts),
      sfx: (name, opts) => g.audio.sfx.play(name, opts),
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      gotItem: (id, opts) => this.gotItem(id, opts),
      /** 讓主角走到某處（劇情演出用），走到或放棄時 resolve */
      walkTo: (point, timeout = 6000) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), timeout);
          const res = this.player.walkTo(point, () => (clearTimeout(timer), resolve(true)), 0.25, () => (clearTimeout(timer), resolve(false)));
          if (!res.ok) {
            clearTimeout(timer);
            resolve(false);
          }
        }),
    };
  }

  // ---------- 開始與結局 ----------

  async begin({ fromSave }) {
    const g = this.game;
    if (!fromSave) {
      g.setMode('cutscene');
      await playOpening(this.#context());
      if (this.disposed) return;
    }
    g.rig.follow(this.player.position, true);
    g.setMode('playing');
    this.refreshHud();
    if (fromSave) g.hud.toast(`繼續旅程：${CHAPTERS[this.state.chapter]}`);
    this.#updateTutorial();
    this.save();
  }

  async playEnding(ending) {
    const g = this.game;
    g.setMode('cutscene');
    await playMoonReturn(this.#context(), ending);
    this.save();
    g.finishGame(this, ENDINGS[ending]);
  }

  // ---------- 每幀 ----------

  update(dt, move, playing) {
    const p = this.player.position;
    this.world.update(dt, p);
    this.player.update(dt, playing && !this.busy ? move : null, this.game.input.walkHeld);
    if (!playing) return;
    this.state.stats.playSeconds += dt;

    // 走動距離（教學用）與迷霧
    this.movedDistance += Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
    this.lastPos.copy(p);
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.25;
      this.explored.reveal(p.x, p.z);
      this.#markSeen(p);
      this.game.minimap.render(this.game.minimapCanvas, this.mapData());
      this.#checkTriggers();
      this.#updateTutorial();
    }
    this.game.audio.ambience.setListener(p.x, p.z);

    if (!this.busy) {
      this.nearest = this.#nearestInteractable();
      this.game.hud.setPrompt(this.nearest && !this.game.dialogue.isOpen ? this.nearest.label : '');
      this.world.setHighlight(this.nearest?.id ?? null);
    }

    this.autosaveTimer += dt;
    if (this.autosaveTimer > AUTOSAVE_SECONDS) this.save();
  }

  #nearestInteractable() {
    const p = this.player.position;
    let best = null;
    let bestDist = Infinity;
    for (const it of this.world.activeInteractables()) {
      if (it.id === 'cat' && this.state.flags.catStage >= 3) continue;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d <= it.radius && d < bestDist) {
        best = it;
        bestDist = d;
      }
    }
    return best;
  }

  #markSeen(p) {
    for (const it of this.world.activeInteractables()) {
      if (!PLACE_NAMES[it.id] || this.seen.has(it.id)) continue;
      if (Math.hypot(it.x - p.x, it.z - p.z) < SEEN_RADIUS) this.seen.add(it.id);
    }
  }

  /**
   * 地圖上點選看過的地點：用尋路走過去（真的走，不是傳送），到了之後由玩家自己決定要不要互動。
   * 走不到時說明原因（例如山丘被금줄攔住）。
   */
  travelTo(id) {
    if (!this.canInteract || !this.mapData().places.some((p) => p.id === id)) return false;
    const it = this.world.interactable(id);
    if (!it) return false;
    const gate = this.world.blockedReason?.(id);
    if (gate) {
      this.#blocked(it.position, gate);
      return false;
    }
    const res = this.player.walkTo(it.position, null, Math.min(0.9, it.radius * 0.6), () => this.#blocked(it.position, 'blocked'));
    if (!res.ok) {
      this.#blocked(it.position, this.#unreachableReason(it.position));
      return false;
    }
    if (!res.reached) {
      this.#blocked(it.position, this.#unreachableReason(it.position, 'near'));
      return true;
    }
    this.world.showTap(it.position);
    this.game.hud.toast(`走向：${PLACE_NAMES[id]}`);
    return true;
  }

  /** 區域觸發：發現地標、走上山丘、靠近금줄 */
  #checkTriggers() {
    const p = this.player.position;
    const { state, game } = this;
    for (const l of LEVEL.landmarks) {
      if (Math.hypot(l.x - p.x, l.z - p.z) < l.r && state.discoverLandmark(l.id)) {
        game.hud.toast(`發現地點：${l.name}`);
        game.audio.sfx.play('page');
      }
    }
    const m = LEVEL.mound;
    if (Math.hypot(p.x - m.x, p.z - m.z) < m.top + 1 && state.enterShrine()) this.#afterChange();
    const rope = LEVEL.rope;
    if (!state.flags.ropeOpen && Math.hypot(p.x - rope.x, p.z - rope.z) < 2.6 && !state.clues.has('rope')) {
      state.inspectRope();
      game.hud.tip('山丘入口被一條금줄攔住了', 4000);
      this.#afterChange();
    }
  }

  // ---------- 新手教學 ----------

  #updateTutorial() {
    const { hud, touch } = this.game;
    const key = touch ? 'touch' : 'desktop';
    const done = (id) => this.tutorial.has(id);
    if (this.game.mode !== 'playing') return;
    if (!done('move')) {
      if (this.movedDistance > 3) {
        this.tutorial.add('move');
        hud.tip('');
      } else if (hud.tipEl.hidden) hud.tip(TUTORIAL.move[key]);
      return;
    }
    if (!done('interact')) {
      this.world.setMarker(this.state.flags.readStele ? null : STELE_MARKER);
      if (this.state.flags.readStele) {
        this.tutorial.add('interact');
        hud.tip(TUTORIAL.journal[key], 7000);
        this.world.setMarker(null);
      } else if (hud.tipEl.hidden) hud.tip(TUTORIAL.interact[key]);
    }
  }

  // ---------- 互動 ----------

  /**
   * 目前的互動狀態：Exploring、Navigating、Interacting、Animating、Dialogue、Puzzle、Paused、Cutscene、Ending。
   * 互動只會從 Exploring／Navigating 開始，其他狀態下的輸入一律忽略，避免重複觸發。
   */
  get phase() {
    const g = this.game;
    if (g.mode === 'ending') return 'Ending';
    if (g.mode === 'cutscene') return 'Cutscene';
    if (g.panels.isOpen) return 'Paused';
    if (this.shellPickable) return 'Puzzle';
    if (g.dialogue.isOpen) return 'Dialogue';
    if (this.busy) return this.player.acting ? 'Animating' : 'Interacting';
    if (this.player.target) return 'Navigating';
    return 'Exploring';
  }

  get canInteract() {
    return this.phase === 'Exploring' || this.phase === 'Navigating';
  }

  tryInteract(id = this.nearest?.id) {
    if (!this.canInteract) return false;
    if (!id) {
      // 按了互動鍵但旁邊沒有東西：附近有可互動物件就提醒靠近一點
      const p = this.player.position;
      const close = this.world.activeInteractables().some((it) => Math.hypot(it.x - p.x, it.z - p.z) < it.radius + 2.5);
      if (close) this.game.hud.toast('請靠近物件再互動。');
      return false;
    }
    this.#run(id);
    return true;
  }

  async #run(id) {
    const g = this.game;
    this.busy = true;
    this.player.stop();
    this.player.faceTowards(this.world.facePoint(id));
    g.input.clear();
    g.hud.setPrompt('');
    g.hud.tip('');
    this.world.setHighlight(null);
    g.rig.setFocus(true);
    this.#frameInteraction(id);
    this.state.stats.interactions++;
    try {
      await this.#dispatch(id);
    } catch (err) {
      // 開發者看 Console；玩家看到恢復訊息，狀態已提交的部分保留、畫面回到可操作
      console.error('互動發生錯誤：', err);
      this.#recover();
    } finally {
      this.busy = false;
      g.rig.setFocus(false);
      if (g.mode === 'playing' && !this.disposed) {
        g.rig.follow(this.player.position);
        g.audio.music.setMood('night');
        this.#afterChange();
      }
    }
  }

  /**
   * 互動鏡頭：和 NPC 說話用雙人鏡頭、調查物件用肩後特寫、操作機關用低角度近景。
   * 劇情腳本自己下的過場鏡頭（rig.shot）會蓋過這裡的設定。
   */
  #frameInteraction(id) {
    const rig = this.game.rig;
    const w = this.world;
    const p = this.player.position;
    const at = w.facePoint(id);
    if (!at) return;
    const target = new Vector3(at.x, heightAt(at.x, at.z), at.z);
    if (id === 'grandma' || id === 'stele') rig.frame(p, target, 'dialogue');
    else if (id === 'cat') rig.frame(p, target, 'dialogue', 0.4);
    else if (id.startsWith('lantern-')) rig.frame(p, target, 'inspect', 1.6);
    else if (['screen', 'footprints', 'house-se', 'rope', 'pond', 'jars'].includes(id)) rig.frame(p, target, 'inspect', id === 'footprints' || id === 'pond' ? 0.2 : 1);
    else if (['kitchen', 'well', 'storehouse'].includes(id)) rig.frame(p, target, 'action');
  }

  /** 互動中途出錯時把畫面恢復到可以繼續玩的狀態 */
  #recover() {
    const g = this.game;
    g.dialogue.reset?.();
    this.player.stop();
    this.shellPickable = false;
    if (g.mode === 'cutscene' && !this.state.flags.finished) {
      g.cutscene.end();
      g.setMode('playing');
    }
    g.hud.toast('剛才的動作沒有完成，已經恢復，可以再試一次。');
  }

  #dispatch(id) {
    const ctx = this.#context();
    if (id.startsWith('lantern-')) return lanternScene(ctx, Number(id.slice('lantern-'.length)));
    if (id === 'rope') return ropeScene(ctx);
    if (id === 'altar') return altarScene(ctx);
    return villageScenes[id]?.(ctx);
  }

  /** 狀態改變後：通知新線索與圖鑑、更新 HUD、檢查成就、存檔 */
  #afterChange() {
    const { state, game } = this;
    const newClues = [...state.clues].filter((id) => !this.knownClues.has(id));
    newClues.forEach((id) => this.knownClues.add(id));
    if (newClues.length) game.hud.toast(`新線索：${CLUES[newClues[0]].title}${newClues.length > 1 ? ` 等 ${newClues.length} 條` : ''}（記在任務日誌）`);
    for (const id of state.codexUnlocked()) {
      if (this.knownCodex.has(id)) continue;
      this.knownCodex.add(id);
      game.unlockCodex(id, CODEX.find((c) => c.id === id).title);
    }
    game.checkAchievements(state.summary());
    this.refreshHud();
    this.save();
  }

  /**
   * 取得道具：規則已經在 GameState 提交；畫面上撿拾動畫在「手碰到」（contact 事件）時才讓道具消失、播放特效。
   * @param o.onContact 手碰到道具時（例如讓桌上的葫蘆瓶消失）
   */
  gotItem(id, { onContact = null } = {}) {
    const g = this.game;
    const item = ITEMS[id];
    this.player.play('pickup', {
      events: {
        contact: () => {
          onContact?.();
          this.world.burst('item', this.player.position.clone().setY(this.player.position.y + 0.6));
        },
      },
    });
    g.audio.sfx.play('item');
    g.hud.toast(`取得：${item.name}（${item.note}）`, item.icon);
    g.hud.setInventoryBadge(true);
    if (!this.tutorial.has('inventory')) {
      this.tutorial.add('inventory');
      g.hud.tip(TUTORIAL.inventory[g.touch ? 'touch' : 'desktop'], 6000);
    }
  }

  /** 從背包「調查」道具 */
  async inspectItem(id) {
    if (this.busy) return;
    this.busy = true;
    const item = ITEMS[id];
    try {
      await this.game.dialogue.say([{ speaker: 'narrator', text: `${item.name}（${item.note}）：${item.desc}` }]);
    } finally {
      this.busy = false;
    }
  }

  /** 從背包「使用」道具：對著附近的互動對象使用，沒有適合的對象就提示 */
  useItem(id) {
    const near = this.#nearestInteractable();
    const uses = {
      gourd: ['storehouse'],
      key: ['storehouse'],
      tornHat: ['grandma'],
      needle: ['grandma'],
      muk: ['altar'],
      makgeolli: ['altar'],
      hat: ['altar'],
    };
    if (near && uses[id]?.includes(near.id)) {
      this.tryInteract(near.id);
      return true;
    }
    this.game.hud.toast(`這裡用不到「${ITEMS[id].name}」`);
    this.game.audio.sfx.play('blocked');
    return false;
  }

  combine(a, b) {
    const recipe = this.state.combine(a, b);
    if (recipe) {
      this.game.audio.sfx.play('combine');
      this.game.hud.toast(recipe.text, ITEMS[recipe.output].icon);
      this.#afterChange();
    } else {
      this.game.hud.toast('這兩樣東西沒辦法組合');
      this.game.audio.sfx.play('blocked');
    }
    return recipe;
  }

  useHint() {
    const h = this.state.useHint();
    this.save();
    return h;
  }

  /** 點擊畫面：點到甕（甕遊戲中）、互動物件或地面 */
  onTap({ x, y }) {
    const g = this.game;
    const ndc = new Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, g.camera);
    if (this.shellPickable && g.dialogue.externalPick) {
      const hit = this.raycaster.intersectObjects(this.world.shellJars, true)[0];
      const slot = hit ? this.world.slotFromObject(hit.object) : null;
      if (slot !== null) g.dialogue.externalPick(slot);
      return;
    }
    if (!this.canInteract) return;
    const hit = this.raycaster.intersectObjects(this.world.pickables, true)[0];
    if (!hit) return;
    let obj = hit.object;
    while (obj && !obj.userData.interactId) obj = obj.parent;
    const id = obj?.userData.interactId;
    const it = id ? this.world.interactable(id) : null;
    if (it && !(id === 'cat' && this.state.flags.catStage >= 3)) {
      const gate = this.world.blockedReason?.(id);
      if (gate) return this.#blocked(it.position, gate);
      const res = this.player.walkTo(it.position, () => this.#arrive(id, true), Math.min(0.9, it.radius * 0.6), () => this.#blocked(it.position, 'blocked'));
      if (!res.ok) this.#blocked(hit.point, this.#unreachableReason(it.position));
      else if (!res.reached) {
        // 走不進互動範圍（例如被금줄擋住）：先說明原因，走到最近的地方後不自動互動
        this.player.onArrive = () => this.#arrive(id, false);
        this.#blocked(it.position, this.#unreachableReason(it.position, 'near'));
      } else this.world.showTap(it.position);
      return;
    }
    const res = this.player.walkTo(hit.point, null, undefined, () => this.#blocked(hit.point, 'blocked'));
    if (!res.ok) this.#blocked(hit.point, this.#unreachableReason(hit.point));
    else {
      this.world.showTap(res.reached ? hit.point : this.player.target ?? hit.point, false);
      if (!res.reached) this.game.hud.toast('那裡過不去，先走到最近的地方。');
    }
  }

  /** 尋路結束：確認真的站進互動範圍才互動，只走到附近就提示 */
  #arrive(id, announce) {
    const it = this.world.interactable(id);
    if (!it) return;
    const p = this.player.position;
    if (Math.hypot(it.x - p.x, it.z - p.z) <= it.radius) this.tryInteract(id);
    else if (announce) this.#blocked(it.position, 'near');
  }

  #unreachableReason(point, fallback = 'unreachable') {
    const m = LEVEL.mound;
    if (!this.state.flags.ropeOpen && Math.hypot(point.x - m.x, point.z - m.z) < m.wallRadius + 0.5) return 'rope';
    return fallback;
  }

  #blocked(point, reason = 'unreachable') {
    const text = {
      unreachable: '這裡無法到達。',
      blocked: '道路被阻擋。',
      near: '請靠近物件再互動。',
      rope: '山丘被금줄攔住了，得先想辦法打開。',
      door: '需要先打開木門。',
    }[reason] ?? reason;
    this.world.showTap(point, true);
    this.game.audio.sfx.play('blocked');
    this.game.hud.toast(text);
  }

  // ---------- HUD、地圖、存檔 ----------

  refreshHud() {
    const cur = this.state.currentObjective();
    const text = !cur ? '' : cur.current ? `${cur.text}：${cur.current.text}` : `${cur.text}${cur.progress ? `（${cur.progress}）` : ''}`;
    this.game.hud.setObjective(CHAPTERS[this.state.chapter], text);
  }

  /** 地圖資料：玩家、迷霧、已發現地標、已知的任務地點（只標玩家已經知道的） */
  mapData() {
    const s = this.state;
    const f = s.flags;
    const markers = [];
    const add = (x, z) => markers.push({ x, z });
    if (!f.readStele) add(0, 19.5);
    if (s.clues.has('note')) {
      if (!f.mukTaken) add(LEVEL.jars.x, LEVEL.jars.z);
      if (!f.keyTaken && !f.storehouseOpen) add(LEVEL.well.x, LEVEL.well.z);
      if (!f.makgeolliTaken) add(LEVEL.storehouse.x, LEVEL.storehouse.z);
    }
    if (f.readStele && !f.ropeOpen) add(0, -6.5);
    if (f.ropeOpen && !f.shellWon) add(LEVEL.altar.x, LEVEL.altar.z);
    // 看過的地點＋已知的任務地點（地圖上有 ◆ 的地方，例如字條提到的장독대，即使還沒走近過）
    const places = LEVEL.interactables
      .map((it) => {
        const at = this.world.interactable(it.id);
        if (!at) return null;
        const task = markers.some((m) => Math.hypot(m.x - at.x, m.z - at.z) < 3.5);
        if (!this.seen.has(it.id) && !task) return null;
        return { id: it.id, name: PLACE_NAMES[it.id], task };
      })
      .filter(Boolean);
    return { player: { x: this.player.position.x, z: this.player.position.z, yaw: this.player.yaw }, explored: this.explored.cells, landmarks: s.landmarks, markers, places };
  }

  save() {
    this.autosaveTimer = 0;
    if (this.disposed) return;
    const p = this.player.position;
    this.game.saves.save(this.state, { x: p.x, z: p.z, yaw: this.player.yaw }, { explored: this.explored.save(), tutorial: [...this.tutorial], seen: [...this.seen] });
  }

  dispose() {
    this.disposed = true;
    this.world.dispose();
  }
}

export { heightAt, Vector3 };
