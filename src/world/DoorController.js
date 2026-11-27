/**
 * 門窗控制器（純邏輯，可單元測試；畫面由 onAngle 回呼套用到模型）。
 *
 * 狀態：Locked → Unlocking → Closed ⇄ Opening ⇄ Open ⇄ Closing（被擋住時 Blocked → 自動退回 Opening）
 * - 角度用 dt 推進（與幀率無關），open 是 0（關）到 1（全開）
 * - 開關途中反向操作會平順地反轉，不會跳動；重複呼叫回傳同一個 Promise
 * - 關門時如果有人站在門扇掃過的範圍（isBlocked 回傳 true），門會停下、變成 Blocked，再自動打開，
 *   絕不會把角色推進牆裡
 * - 狀態改變時呼叫 onStateChange（World 用來更新碰撞與尋路網格、播放聲音）
 */
export const DOOR = Object.freeze({
  LOCKED: 'Locked',
  CLOSED: 'Closed',
  UNLOCKING: 'Unlocking',
  OPENING: 'Opening',
  OPEN: 'Open',
  CLOSING: 'Closing',
  BLOCKED: 'Blocked',
});

export class DoorController {
  constructor({ id, locked = false, openSeconds = 0.9, unlockSeconds = 0.45, onAngle = null, onStateChange = null, isBlocked = null } = {}) {
    this.id = id;
    this.state = locked ? DOOR.LOCKED : DOOR.CLOSED;
    this.open01 = 0;
    this.openSeconds = openSeconds;
    this.unlockSeconds = unlockSeconds;
    this.onAngle = onAngle;
    this.onStateChange = onStateChange;
    this.isBlocked = isBlocked;
    this.timer = 0;
    this.waiters = [];
  }

  get isOpen() {
    return this.state === DOOR.OPEN;
  }

  /** 門扇是否擋住門口（關著、鎖著、或還沒開到一半） */
  get blocksPassage() {
    return this.open01 < 0.6;
  }

  #set(state) {
    if (state === this.state) return;
    const prev = this.state;
    this.state = state;
    this.onStateChange?.(state, prev);
    if (state === DOOR.OPEN || state === DOOR.CLOSED || state === DOOR.LOCKED) {
      const w = this.waiters;
      this.waiters = [];
      w.forEach((r) => r(state));
    }
  }

  #wait() {
    return new Promise((r) => this.waiters.push(r));
  }

  /** 用鑰匙開鎖（只在 Locked 時有效） */
  unlock() {
    if (this.state !== DOOR.LOCKED) return Promise.resolve(this.state);
    this.timer = 0;
    this.#set(DOOR.UNLOCKING);
    return this.#wait();
  }

  open() {
    if (this.state === DOOR.LOCKED || this.state === DOOR.UNLOCKING) return Promise.resolve(this.state);
    if (this.state === DOOR.OPEN) return Promise.resolve(DOOR.OPEN);
    this.#set(DOOR.OPENING);
    return this.#wait();
  }

  close() {
    if (this.state === DOOR.LOCKED || this.state === DOOR.CLOSED || this.state === DOOR.UNLOCKING) return Promise.resolve(this.state);
    this.#set(DOOR.CLOSING);
    return this.#wait();
  }

  toggle() {
    return this.state === DOOR.OPEN || this.state === DOOR.OPENING ? this.close() : this.open();
  }

  update(dt) {
    if (!(dt > 0)) return;
    const speed = dt / this.openSeconds;
    switch (this.state) {
      case DOOR.UNLOCKING:
        this.timer += dt;
        if (this.timer >= this.unlockSeconds) this.#set(DOOR.CLOSED);
        break;
      case DOOR.OPENING:
        this.open01 = Math.min(1, this.open01 + speed);
        if (this.open01 >= 1) this.#set(DOOR.OPEN);
        break;
      case DOOR.CLOSING:
        if (this.isBlocked?.(Math.max(0, this.open01 - speed))) {
          this.#set(DOOR.BLOCKED);
          this.timer = 0;
          break;
        }
        this.open01 = Math.max(0, this.open01 - speed);
        if (this.open01 <= 0) this.#set(DOOR.CLOSED);
        break;
      case DOOR.BLOCKED:
        // 停一下讓玩家看到門被擋住，再打開
        this.timer += dt;
        if (this.timer > 0.35) this.#set(DOOR.OPENING);
        break;
      default:
        break;
    }
    this.onAngle?.(this.open01);
  }

  /** 讀檔：直接設成某個狀態（不播動畫） */
  restore(state) {
    this.state = Object.values(DOOR).includes(state) ? state : DOOR.CLOSED;
    if (this.state === DOOR.OPENING || this.state === DOOR.BLOCKED) this.state = DOOR.OPEN;
    if (this.state === DOOR.CLOSING || this.state === DOOR.UNLOCKING) this.state = DOOR.CLOSED;
    this.open01 = this.state === DOOR.OPEN ? 1 : 0;
    this.onAngle?.(this.open01);
    this.onStateChange?.(this.state, null);
  }

  toJSON() {
    return this.state === DOOR.OPENING || this.state === DOOR.OPEN || this.state === DOOR.BLOCKED ? DOOR.OPEN : this.state === DOOR.LOCKED ? DOOR.LOCKED : DOOR.CLOSED;
  }
}
