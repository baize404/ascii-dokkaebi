/**
 * 互動控制器：所有「走過去 → 對齊 → 動手 → 接觸 → 生效 → 收手」的互動都走同一套狀態機。
 *
 *   idle → approach → align → engage → contact → commit → recover → complete
 *   例外：cancel（玩家取消）、failed（走不到、條件不符）、interrupted（掉落、選單、重新整理等外力中斷）
 *
 * 遊戲狀態只在 commit 階段、由互動本身回報的進度改變（例如絞盤真的轉了幾圈），
 * 不靠固定的 setTimeout；同一個互動的生效（onCommit）只會呼叫一次。
 *
 * 互動定義 def：
 *   id、stand {x,z}（站位）、face {x,z}（面向）、approachDist（離站位多近算到了）
 *   engage(ctx)            開始動作與鏡頭
 *   contact(ctx, dt) → bool 手碰到物件了嗎（動畫事件或 IK 誤差）
 *   commit(ctx, dt) → 0..1  機關／動作的實際進度；到 1 呼叫 onCommit
 *   onCommit(ctx)           遊戲狀態改變（只呼叫一次）
 *   recover(ctx, dt) → bool 收手完成了嗎
 *   cleanup(ctx, reason)    任何結束方式都會呼叫：停動畫、還鏡頭
 *   cancelOnMove            玩家推方向鍵時取消（預設：接觸前可以取消，生效中由 def 決定）
 */
export const STATES = Object.freeze(['idle', 'approach', 'align', 'engage', 'contact', 'commit', 'recover', 'complete', 'cancel', 'failed', 'interrupted']);
const ALIGN_TIMEOUT = 0.6;
const CONTACT_TIMEOUT = 3;

export class InteractionController {
  /**
   * @param o.walkTo (point, onArrive, onFail) => {ok}
   * @param o.stopWalking ()
   * @param o.face (point)
   * @param o.yawError (point) => 弧度
   * @param o.position () => {x,z}
   */
  constructor(o) {
    this.o = o;
    this.state = 'idle';
    this.def = null;
    this.t = 0;
    this.progress = 0;
    this.log = [];
    this.committed = new Set();
    this.lastResult = null;
  }

  get busy() {
    return this.state !== 'idle';
  }

  /** 進入正式互動之前（走路中）玩家還能自由移動嗎：approach 階段可以用方向鍵取消 */
  get controlsLocked() {
    return this.busy && this.state !== 'approach';
  }

  start(def, ctx = {}) {
    if (this.busy) return false; // 快速連點：同一時間只有一個互動
    this.def = def;
    this.ctx = ctx;
    this.progress = 0;
    this.nonce = (this.nonce ?? 0) + 1;
    const p = this.o.position();
    const d = def.stand ? Math.hypot(p.x - def.stand.x, p.z - def.stand.z) : 0;
    if (def.stand && d > (def.approachDist ?? 0.35)) {
      this.#go('approach');
      const nonce = this.nonce;
      const res = this.o.walkTo(
        def.stand,
        () => nonce === this.nonce && this.state === 'approach' && this.#go('align'),
        () => nonce === this.nonce && this.state === 'approach' && this.#finish('failed', 'unreachable'),
      );
      if (!res?.ok) this.#finish('failed', 'unreachable');
    } else this.#go('align');
    return true;
  }

  /** 玩家取消（按方向鍵、按返回）；生效後不能取消的互動回傳 false */
  cancel(reason = 'player') {
    if (!this.busy) return false;
    const st = this.state;
    const lateCancelable = this.def.cancelDuringCommit;
    if ((st === 'commit' && !lateCancelable) || st === 'recover') return false;
    this.#finish('cancel', reason);
    return true;
  }

  /** 外力中斷（掉落、開選單、頁面隱藏）：一定會收拾乾淨 */
  interrupt(reason) {
    if (!this.busy) return false;
    this.#finish('interrupted', reason);
    return true;
  }

  update(dt, { moving = false } = {}) {
    if (!this.busy) return;
    const def = this.def;
    const ctx = this.ctx;
    this.t += dt;
    if (moving && (this.state === 'approach' || this.state === 'align' || (this.state === 'commit' && def.cancelDuringCommit))) {
      this.cancel('move');
      return;
    }
    switch (this.state) {
      case 'approach':
        break; // 等 walkTo 的 onArrive／onFail
      case 'align': {
        if (def.face) this.o.face(def.face);
        const err = def.face ? Math.abs(this.o.yawError(def.face)) : 0;
        if (err < 0.12 || this.t > ALIGN_TIMEOUT) {
          this.#go('engage');
          def.engage?.(ctx);
          this.#go('contact');
        }
        break;
      }
      case 'contact':
        if (!def.contact || def.contact(ctx, dt)) this.#go('commit');
        else if (this.t > CONTACT_TIMEOUT) this.#finish('failed', 'no-contact');
        break;
      case 'commit': {
        this.progress = def.commit ? Math.max(0, Math.min(1, def.commit(ctx, dt))) : 1;
        if (this.progress >= 1) {
          const key = `${def.id}#${this.nonce}`;
          if (!this.committed.has(key)) {
            this.committed.add(key);
            def.onCommit?.(ctx);
          }
          this.#go('recover');
        }
        break;
      }
      case 'recover':
        if (!def.recover || def.recover(ctx, dt)) this.#finish('complete');
        break;
      default:
        break;
    }
  }

  #go(state) {
    this.state = state;
    this.t = 0;
    this.log.push({ id: this.def?.id, state });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }

  #finish(result, reason = null) {
    const def = this.def;
    this.log.push({ id: def?.id, state: result, reason });
    if (result !== 'complete') this.o.stopWalking?.();
    try {
      def?.cleanup?.(this.ctx, result, reason);
    } finally {
      this.lastResult = { id: def?.id, result, reason };
      this.state = 'idle';
      this.def = null;
      this.ctx = null;
      this.t = 0;
      this.nonce++;
      this.o.onFinish?.(this.lastResult);
    }
  }
}
