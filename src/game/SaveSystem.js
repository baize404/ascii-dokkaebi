import { GameState, SAVE_VERSION } from './GameState.js';

const KEY = 'ascii-dokkaebi.save';
const BACKUP_KEY = 'ascii-dokkaebi.save.corrupt';

/**
 * 存檔系統：存在 localStorage。
 * - 有版本號（SAVE_VERSION），版本不符或資料不合法時不會載入。
 * - 損壞的存檔會搬到備份位置，不會讓遊戲當掉。
 * - storage 可以注入（單元測試用）。
 */
export class SaveSystem {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.lastError = null;
  }

  #get(key) {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  #set(key, value) {
    try {
      this.storage?.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  /** 是否有可以「繼續遊戲」的存檔（已破關的不算） */
  hasSave() {
    const data = this.peek();
    return Boolean(data && !data.state?.flags?.finished);
  }

  /** 讀出原始資料（不驗證內容），解析失敗回傳 null */
  peek() {
    const raw = this.#get(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * @param state GameState
   * @param player {x, z, yaw}
   */
  save(state, player, extra = {}) {
    const data = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      state: state.toJSON(),
      player: { x: round(player.x), z: round(player.z), yaw: round(player.yaw ?? 0) },
      extra,
    };
    return this.#set(KEY, JSON.stringify(data));
  }

  /**
   * 讀取並驗證存檔。成功回傳 { state, player, savedAt }；
   * 沒有存檔回傳 null；存檔損壞時備份後清除，回傳 null 並設定 lastError。
   */
  load() {
    this.lastError = null;
    const raw = this.#get(KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (data?.version !== SAVE_VERSION) throw new Error(`存檔版本不符（${data?.version}）`);
      const state = GameState.fromJSON(data.state);
      const p = data.player ?? {};
      if (![p.x, p.z].every(Number.isFinite)) throw new Error('玩家位置不合法');
      const extra = data.extra && typeof data.extra === 'object' ? data.extra : {};
      return { state, player: { x: p.x, z: p.z, yaw: Number.isFinite(p.yaw) ? p.yaw : 0 }, savedAt: data.savedAt, extra };
    } catch (err) {
      this.lastError = err.message;
      this.#set(BACKUP_KEY, raw);
      this.clear();
      return null;
    }
  }

  clear() {
    try {
      this.storage?.removeItem(KEY);
    } catch {
      // 忽略
    }
  }
}

function round(n) {
  return Math.round(n * 100) / 100;
}
