import { CODEX } from '../data/codex.js';
import { LEVEL } from '../data/level.js';
import { CARVING_CLUE, CARVINGS, CLUES, HINTS, LANTERN_ORDER, OBJECTIVES, RIDDLES, RIDDLES_PER_GAME } from '../data/story.js';
import { Inventory } from './Inventory.js';
import { LanternPuzzle } from './LanternPuzzle.js';
import { ShellGame } from './ShellGame.js';

export const SAVE_VERSION = 2;
const WELL_CRANKS = 3;

/** 可重現的亂數（mulberry32），讓存檔還原後的隨機內容一致 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const defaultFlags = () => ({
  readStele: false,
  kitchenVisited: false,
  mukTaken: false,
  wellCranks: 0,
  keyTaken: false,
  storehouseOpen: false,
  makgeolliTaken: false,
  grandmaAwake: false,
  ropeOpen: false,
  offered: false,
  riddleIds: [],
  riddleIndex: 0,
  riddlesDone: false,
  shellWon: false,
  catStage: 0,
  hatGiven: false,
  ending: null,
  finished: false,
});

/**
 * 整個遊戲的規則與進度（純邏輯，不碰畫面）。
 * 每個動作方法回傳結果代碼，由 game/scenes/ 決定要演什麼。
 * toJSON() / GameState.fromJSON() 用於存檔。
 */
export class GameState {
  constructor({ seed = (Math.random() * 2 ** 31) | 0 } = {}) {
    this.seed = seed;
    const rng = makeRng(seed);
    /** 四個石燈位置各自的刻紋（每局隨機） */
    this.lanternLayout = shuffle(LANTERN_ORDER, rng);
    this.riddlePool = shuffle(RIDDLES.map((r) => r.id), rng);
    this.shellRng = makeRng(seed ^ 0x5bd1e995);
    this.shell = new ShellGame(this.shellRng);
    this.inventory = new Inventory();
    this.lanterns = new LanternPuzzle(LANTERN_ORDER);
    this.clues = new Set();
    this.landmarks = new Set();
    this.events = new Set();
    this.flags = defaultFlags();
    this.hintLevels = {};
    this.stats = { interactions: 0, hintsUsed: 0, lanternMistakes: 0, riddleMistakes: 0, shellMistakes: 0, playSeconds: 0 };
  }

  // ---------- 小工具 ----------

  addClue(id) {
    if (!CLUES[id]) throw new Error(`未知的線索：${id}`);
    const isNew = !this.clues.has(id);
    this.clues.add(id);
    return isNew;
  }

  addEvent(id) {
    const isNew = !this.events.has(id);
    this.events.add(id);
    return isNew;
  }

  discoverLandmark(id) {
    const isNew = !this.landmarks.has(id);
    this.landmarks.add(id);
    return isNew;
  }

  get hasBothOfferings() {
    return this.inventory.has('muk') && this.inventory.has('makgeolli');
  }

  /** 目前章節（1–5），依進度推算 */
  get chapter() {
    const f = this.flags;
    if (f.finished || f.shellWon) return 5;
    if (f.offered) return 4;
    if (!f.readStele) return 1;
    if (!this.hasBothOfferings && !f.offered) return 2;
    return 3;
  }

  // ---------- 第一、二章：村落 ----------

  readStele() {
    const first = !this.flags.readStele;
    this.flags.readStele = true;
    this.addClue('stele');
    return first ? 'first' : 'again';
  }

  visitKitchen() {
    if (this.flags.kitchenVisited) return 'again';
    this.flags.kitchenVisited = true;
    this.inventory.add('gourd');
    this.addClue('note');
    return 'first';
  }

  /** 打開장독대的甕：0 小、1 中、2 最大 */
  openJar(index) {
    this.addEvent('jars');
    if (index === 0) return 'small';
    if (index === 1) return 'middle';
    if (this.flags.mukTaken) return 'empty';
    this.flags.mukTaken = true;
    this.inventory.add('muk');
    return 'got';
  }

  /** 轉動水井轆轤；轉滿三次拉上水桶拿到鑰匙 */
  crankWell() {
    if (this.flags.keyTaken) return { result: 'empty', cranks: WELL_CRANKS };
    this.flags.wellCranks = Math.min(WELL_CRANKS, this.flags.wellCranks + 1);
    if (this.flags.wellCranks < WELL_CRANKS) return { result: 'crank', cranks: this.flags.wellCranks };
    this.flags.keyTaken = true;
    this.inventory.add('key');
    return { result: 'got', cranks: WELL_CRANKS };
  }

  /**
   * 倉庫：'locked' | 'opened-filled' | 'opened-no-container' | 'filled' | 'no-container' | 'empty'
   * 第一次打開時若身上有葫蘆瓶就直接裝酒，否則要回來再裝。
   */
  useStorehouse() {
    const f = this.flags;
    if (!f.storehouseOpen) {
      if (!this.inventory.has('key')) return 'locked';
      f.storehouseOpen = true;
      this.inventory.remove('key');
      return this.#takeMakgeolli() ? 'opened-filled' : 'opened-no-container';
    }
    if (f.makgeolliTaken) return 'empty';
    return this.#takeMakgeolli() ? 'filled' : 'no-container';
  }

  #takeMakgeolli() {
    if (!this.inventory.has('gourd')) {
      this.addClue('emptyJar');
      return false;
    }
    this.inventory.remove('gourd');
    this.inventory.add('makgeolli');
    this.flags.makgeolliTaken = true;
    this.addEvent('makgeolli');
    return true;
  }

  inspect(clueId) {
    return this.addClue(clueId);
  }

  /** 和할머니互動：第一次她在睡覺（要玩家選擇叫醒），之後給提示 */
  grandmaState() {
    return this.flags.grandmaAwake ? 'awake' : 'asleep';
  }

  wakeGrandma() {
    if (this.flags.grandmaAwake) return false;
    this.flags.grandmaAwake = true;
    this.inventory.add('needle');
    this.addClue('grandma');
    return true;
  }

  // ---------- 隱藏事件：黑貓 ----------

  /** 追黑貓：第三次牠會把破帽子留給玩家 */
  meetCat() {
    if (this.flags.catStage >= 3) return 'gone';
    this.flags.catStage++;
    this.addClue('cat');
    if (this.flags.catStage === 3) {
      this.inventory.add('tornHat');
      this.addEvent('hat');
      return 'third';
    }
    return this.flags.catStage === 1 ? 'first' : 'second';
  }

  combine(a, b) {
    const recipe = this.inventory.combine(a, b);
    if (recipe) this.addEvent(`combined-${recipe.output}`);
    return recipe;
  }

  // ---------- 第三章：石燈 ----------

  carvingAt(spot) {
    return this.lanternLayout[spot];
  }

  inspectLantern(spot) {
    const carving = this.carvingAt(spot);
    this.addClue(CARVING_CLUE[carving]);
    this.addEvent('lantern');
    return carving;
  }

  lightLantern(spot) {
    const result = this.lanterns.light(this.carvingAt(spot));
    if (result === 'wrong') this.stats.lanternMistakes++;
    if (result === 'complete') this.flags.ropeOpen = true;
    return result;
  }

  litSpots() {
    return this.lanternLayout.map((c, i) => (this.lanterns.isLit(c) ? i : -1)).filter((i) => i >= 0);
  }

  inspectRope() {
    this.addClue('rope');
    return this.flags.ropeOpen ? 'open' : 'blocked';
  }

  enterShrine() {
    return this.addClue('tree');
  }

  // ---------- 第四章：도깨비的遊戲 ----------

  missingOfferings() {
    const missing = [];
    if (!this.inventory.has('muk')) missing.push('muk');
    if (!this.inventory.has('makgeolli')) missing.push('makgeolli');
    return missing;
  }

  useAltar() {
    const f = this.flags;
    this.enterShrine();
    if (f.shellWon) return { status: 'done' };
    if (f.riddlesDone) return { status: 'shell' };
    if (f.offered) return { status: 'riddles' };
    const missing = this.missingOfferings();
    if (missing.length) return { status: 'not-ready', missing };
    this.inventory.remove('muk');
    this.inventory.remove('makgeolli');
    f.offered = true;
    this.addEvent('dokkaebi');
    this.#pickRiddles();
    return { status: 'offered' };
  }

  /** 只從玩家已經發現線索的題目中抽題 */
  #pickRiddles() {
    const eligible = this.riddlePool.filter((id) => this.clues.has(RIDDLES.find((r) => r.id === id).clue));
    this.flags.riddleIds = eligible.slice(0, RIDDLES_PER_GAME);
    this.flags.riddleIndex = 0;
  }

  currentRiddle() {
    const id = this.flags.riddleIds[this.flags.riddleIndex];
    return RIDDLES.find((r) => r.id === id) ?? null;
  }

  /** 回傳 'wrong' | 'next' | 'done' */
  answerRiddle(choiceIndex) {
    const riddle = this.currentRiddle();
    if (!riddle || !this.flags.offered) throw new Error('現在沒有題目可以回答');
    if (choiceIndex !== riddle.answer) {
      this.stats.riddleMistakes++;
      return 'wrong';
    }
    this.flags.riddleIndex++;
    delete this.hintLevels.riddles;
    if (this.flags.riddleIndex >= this.flags.riddleIds.length) {
      this.flags.riddlesDone = true;
      return 'done';
    }
    return 'next';
  }

  newShellRound() {
    return this.shell.newRound({ slow: (this.hintLevels.shell ?? 0) >= 2 || this.stats.shellMistakes >= 2 });
  }

  answerShell(slot) {
    if (!this.flags.riddlesDone) throw new Error('還沒輪到甕遊戲');
    if (this.shell.check(slot)) {
      this.flags.shellWon = true;
      return 'right';
    }
    this.stats.shellMistakes++;
    return 'wrong';
  }

  /** 把감투還給도깨비（補好的才算真結局） */
  giveHat() {
    const repaired = this.inventory.has('hat');
    const torn = this.inventory.has('tornHat');
    if (!repaired && !torn) return null;
    this.inventory.remove(repaired ? 'hat' : 'tornHat');
    this.flags.hatGiven = true;
    return repaired ? 'repaired' : 'torn';
  }

  finish() {
    this.flags.finished = true;
    this.flags.ending = this.flags.hatGiven && this.events.has('combined-hat') ? 'true' : 'normal';
    return this.flags.ending;
  }

  // ---------- 提示 ----------

  /** 目前適用哪一組提示 */
  currentPuzzle() {
    const f = this.flags;
    if (f.finished) return null;
    if (!f.readStele) return 'start';
    if (f.offered && !f.riddlesDone) return 'riddles';
    if (f.riddlesDone && !f.shellWon) return 'shell';
    if (!this.hasBothOfferings && !f.offered) return 'offerings';
    if (!f.ropeOpen) return 'lanterns';
    return null;
  }

  /** 取得下一段提示文字（最多三段），並記錄使用次數 */
  useHint(puzzle = this.currentPuzzle()) {
    if (!puzzle) return null;
    const list = HINTS[puzzle];
    const level = Math.min(list.length, (this.hintLevels[puzzle] ?? 0) + 1);
    this.hintLevels[puzzle] = level;
    this.stats.hintsUsed++;
    return { puzzle, level, total: list.length, text: this.hintText(puzzle, level) };
  }

  /** 第 level 段提示的文字（觀察題的第二、三段依目前題目而定） */
  hintText(puzzle, level) {
    if (puzzle === 'riddles') {
      const r = this.currentRiddle();
      if (r && level === 2) return r.hint;
      if (r && level === 3) return `不是「${r.choices[this.eliminatedChoice()]}」。`;
    }
    return HINTS[puzzle]?.[level - 1] ?? '';
  }

  /** 第三段觀察題提示會劃掉的錯誤選項 */
  eliminatedChoice() {
    const r = this.currentRiddle();
    return r ? r.choices.findIndex((_, i) => i !== r.answer) : -1;
  }

  hintLevel(puzzle) {
    return this.hintLevels[puzzle] ?? 0;
  }

  // ---------- 任務日誌 ----------

  /** 主要目標（含子目標）；只顯示玩家已經接觸到的內容，不提前劇透 */
  objectives() {
    const f = this.flags;
    const inv = this.inventory;
    const has = (id) => inv.has(id);
    const list = [];
    list.push({ id: 'start', text: OBJECTIVES.start, done: f.readStele });
    if (!f.readStele) return list;

    const offerDone = f.offered || this.hasBothOfferings;
    const offerSubs = [];
    if (this.clues.has('note') || f.mukTaken) offerSubs.push({ id: 'muk', text: OBJECTIVES.muk, done: f.mukTaken });
    if (this.clues.has('note') || f.keyTaken) offerSubs.push({ id: 'key', text: OBJECTIVES.key, done: f.keyTaken || f.storehouseOpen });
    if (this.clues.has('note') || f.storehouseOpen) offerSubs.push({ id: 'makgeolli', text: OBJECTIVES.makgeolli, done: f.makgeolliTaken });
    if (this.clues.has('emptyJar') && !f.makgeolliTaken) offerSubs.push({ id: 'container', text: OBJECTIVES.container, done: has('gourd') });
    const count = f.offered ? 2 : Number(has('muk')) + Number(has('makgeolli'));
    list.push({ id: 'offerings', text: OBJECTIVES.offerings, done: offerDone, progress: `${count}/2`, subs: offerSubs });

    const lanternSubs = [];
    const seenCarving = Object.values(CARVING_CLUE).some((c) => this.clues.has(c));
    if (seenCarving) lanternSubs.push({ id: 'lanternsClue', text: OBJECTIVES.lanternsClue, done: this.clues.has('screen') });
    list.push({ id: 'lanterns', text: OBJECTIVES.lanterns, done: f.ropeOpen, progress: `${this.lanterns.lit.length}/4`, subs: lanternSubs });

    if (f.ropeOpen || f.offered) list.push({ id: 'altar', text: OBJECTIVES.altar, done: f.offered });
    if (f.offered) {
      list.push({
        id: 'game',
        text: OBJECTIVES.game,
        done: f.shellWon,
        subs: [
          { id: 'riddles', text: OBJECTIVES.riddles, done: f.riddlesDone, progress: `${f.riddleIndex}/${f.riddleIds.length}` },
          ...(f.riddlesDone ? [{ id: 'shell', text: OBJECTIVES.shell, done: f.shellWon }] : []),
        ],
      });
    }
    if (has('tornHat') || has('hat') || f.hatGiven) {
      list.push({ id: 'hat', text: OBJECTIVES.hat, done: f.hatGiven, optional: true, subs: [{ id: 'hatRepair', text: OBJECTIVES.hatRepair, done: has('hat') || (f.hatGiven && this.events.has('combined-hat')) }] });
    }
    return list;
  }

  /** 目前最重要、還沒完成的目標（HUD 只顯示這一行） */
  currentObjective() {
    const all = this.objectives().filter((o) => !o.optional);
    const open = all.find((o) => !o.done);
    if (!open) return null;
    const sub = open.subs?.find((s) => !s.done);
    return { ...open, current: sub ?? null };
  }

  // ---------- 探索度、圖鑑、成就 ----------

  codexUnlocked() {
    return CODEX.filter((entry) => this.isUnlocked(entry.unlock)).map((e) => e.id);
  }

  isUnlocked(rule) {
    const [kind, id] = rule.split(':');
    return kind === 'clue' ? this.clues.has(id) : this.events.has(id);
  }

  exploration() {
    const totalClues = Object.keys(CLUES).length;
    const totalLandmarks = LEVEL.landmarks.length;
    return (this.clues.size + this.landmarks.size) / (totalClues + totalLandmarks);
  }

  summary() {
    return {
      finished: this.flags.finished,
      ending: this.flags.ending,
      hintsUsed: this.stats.hintsUsed,
      lanternsDone: this.flags.ropeOpen,
      lanternMistakes: this.stats.lanternMistakes,
      riddleMistakes: this.stats.riddleMistakes,
      shellMistakes: this.stats.shellMistakes,
      exploration: this.exploration(),
      codexUnlocked: this.codexUnlocked().length,
      codexTotal: CODEX.length,
      catStage: this.flags.catStage,
      seconds: Math.round(this.stats.playSeconds),
      mistakes: this.stats.lanternMistakes + this.stats.riddleMistakes + this.stats.shellMistakes,
    };
  }

  // ---------- 存檔 ----------

  toJSON() {
    return {
      version: SAVE_VERSION,
      seed: this.seed,
      inventory: this.inventory.list(),
      lit: [...this.lanterns.lit],
      clues: [...this.clues],
      landmarks: [...this.landmarks],
      events: [...this.events],
      flags: { ...this.flags, riddleIds: [...this.flags.riddleIds] },
      hintLevels: { ...this.hintLevels },
      stats: { ...this.stats },
    };
  }

  /** 從存檔還原；資料不合法時丟出錯誤（由 SaveSystem 處理） */
  static fromJSON(data) {
    if (!data || typeof data !== 'object') throw new Error('存檔格式錯誤');
    if (data.version !== SAVE_VERSION) throw new Error(`不支援的存檔版本：${data.version}`);
    if (!Number.isInteger(data.seed)) throw new Error('存檔缺少 seed');
    const s = new GameState({ seed: data.seed });
    const arr = (v) => (Array.isArray(v) ? v : []);
    for (const id of arr(data.inventory)) if (typeof id === 'string') s.inventory.add(id);
    s.lanterns = new LanternPuzzle(LANTERN_ORDER, arr(data.lit));
    for (const id of arr(data.clues)) if (CLUES[id]) s.clues.add(id);
    for (const id of arr(data.landmarks)) if (LEVEL.landmarks.some((l) => l.id === id)) s.landmarks.add(id);
    for (const id of arr(data.events)) if (typeof id === 'string') s.events.add(id);
    const flags = data.flags ?? {};
    for (const key of Object.keys(s.flags)) {
      if (key in flags && typeof flags[key] === typeof s.flags[key] && !Array.isArray(s.flags[key])) s.flags[key] = flags[key];
    }
    s.flags.riddleIds = arr(flags.riddleIds).filter((id) => RIDDLES.some((r) => r.id === id));
    s.flags.ending = typeof flags.ending === 'string' ? flags.ending : null;
    s.flags.riddleIndex = Math.min(s.flags.riddleIndex, s.flags.riddleIds.length);
    s.flags.ropeOpen = s.lanterns.complete;
    for (const [k, v] of Object.entries(data.hintLevels ?? {})) if (HINTS[k] && Number.isInteger(v)) s.hintLevels[k] = Math.min(v, HINTS[k].length);
    for (const key of Object.keys(s.stats)) if (Number.isFinite(data.stats?.[key])) s.stats[key] = data.stats[key];
    return s;
  }
}

export { CARVINGS };
