const RADIUS = 46;

/**
 * 觸控虛擬搖桿（左下角）。輸出 {x, y}，x 向右、y 向前，長度 0–1。
 * 在搖桿上的觸控不會被當成「點擊地面」。
 */
export class Joystick {
  constructor(onChange) {
    this.el = document.getElementById('joystick');
    this.knob = this.el.querySelector('.knob');
    this.onChange = onChange;
    this.pointer = null;

    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.pointer = e.pointerId;
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        // 有些瀏覽器或模擬事件沒有可捕捉的指標，搖桿仍可運作
      }
      this.#update(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointer) this.#update(e);
    });
    const end = (e) => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      this.knob.style.transform = '';
      this.onChange({ x: 0, y: 0 });
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  #update(e) {
    const r = this.el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.min(1, len / RADIUS);
    // 中間小範圍不動，避免手指輕觸就亂跑
    if (mag < 0.18) return this.onChange({ x: 0, y: 0 });
    this.onChange({ x: dx / RADIUS, y: -dy / RADIUS });
  }

  /** 放開搖桿（視窗失焦、切到背景時） */
  reset() {
    this.pointer = null;
    this.knob.style.transform = '';
    this.onChange({ x: 0, y: 0 });
  }

  show(visible) {
    this.el.hidden = !visible;
    if (!visible) this.onChange({ x: 0, y: 0 });
  }
}
