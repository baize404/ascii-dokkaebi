export const ease = {
  linear: (k) => k,
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outBack: (k) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
};

/**
 * 以遊戲時間驅動的補間動畫。add() 回傳 Promise，動畫結束時 resolve，
 * 方便用 async/await 寫過場。
 */
export class Tweens {
  #items = [];

  add(duration, onUpdate, easing = ease.inOutCubic) {
    return new Promise((resolve) => {
      this.#items.push({ elapsed: 0, duration, onUpdate, easing, resolve });
      onUpdate(0);
    });
  }

  update(dt) {
    for (let i = this.#items.length - 1; i >= 0; i--) {
      const item = this.#items[i];
      item.elapsed += dt;
      const k = Math.min(1, item.elapsed / item.duration);
      item.onUpdate(item.easing(k));
      if (k >= 1) {
        this.#items.splice(i, 1);
        item.resolve();
      }
    }
  }

  clear() {
    this.#items.length = 0;
  }
}
