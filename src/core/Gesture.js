/**
 * 畫布上的手勢狀態機（純邏輯，可單元測試）。
 *
 * 狀態：
 * - idle   沒有手指／滑鼠按著
 * - press  一根手指按下、還沒移動超過容許範圍 → 放開時算「輕觸」
 * - drag   移動超過容許範圍 → 放開時不算輕觸
 * - pinch  出現第二根手指 → 雙指縮放；直到「所有」手指都放開才回到 idle，
 *          所以縮放結束時剩下的那根手指放開也不會被誤判成點擊地面
 *
 * 搖桿與介面按鈕是獨立的 DOM 元素，事件不會進到畫布，所以不經過這裡。
 */
export const GESTURE = Object.freeze({ IDLE: 'idle', PRESS: 'press', DRAG: 'drag', PINCH: 'pinch' });

export class GestureTracker {
  constructor({ slop = 12, tapMaxMs = 700, zoomPerPx = 0.004 } = {}) {
    this.slop = slop;
    this.tapMaxMs = tapMaxMs;
    this.zoomPerPx = zoomPerPx;
    this.reset();
  }

  reset() {
    this.state = GESTURE.IDLE;
    this.pointers = new Map();
    this.pinchDist = 0;
  }

  #spread() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** @returns {Array<{type:string}>} 產生的事件 */
  down(id, x, y, t = 0) {
    this.pointers.set(id, { x, y, sx: x, sy: y, t });
    if (this.pointers.size === 1 && this.state === GESTURE.IDLE) this.state = GESTURE.PRESS;
    else if (this.pointers.size >= 2) {
      this.state = GESTURE.PINCH;
      this.pinchDist = this.#spread();
    }
    return [];
  }

  move(id, x, y) {
    const p = this.pointers.get(id);
    if (!p) return [];
    p.x = x;
    p.y = y;
    if (this.state === GESTURE.PRESS && (x - p.sx) ** 2 + (y - p.sy) ** 2 > this.slop ** 2) {
      this.state = GESTURE.DRAG;
    }
    if (this.state === GESTURE.PINCH && this.pointers.size >= 2) {
      const d = this.#spread();
      const delta = (this.pinchDist - d) * this.zoomPerPx;
      this.pinchDist = d;
      if (delta !== 0) return [{ type: 'zoom', delta }];
    }
    return [];
  }

  up(id, x, y, t = 0) {
    const p = this.pointers.get(id);
    if (!p) return [];
    this.pointers.delete(id);
    const events = [];
    if (this.state === GESTURE.PRESS && this.pointers.size === 0) {
      const moved = (x - p.sx) ** 2 + (y - p.sy) ** 2 > this.slop ** 2;
      if (!moved && t - p.t <= this.tapMaxMs) events.push({ type: 'tap', x, y });
    }
    if (this.pointers.size === 0) this.state = GESTURE.IDLE;
    else if (this.pointers.size === 1 && this.state === GESTURE.PINCH) this.pinchDist = 0; // 保持 pinch，直到全部放開
    return events;
  }

  cancel(id) {
    this.pointers.delete(id);
    if (this.pointers.size === 0) this.state = GESTURE.IDLE;
    return [];
  }
}
