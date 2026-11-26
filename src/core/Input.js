const MOVE_KEYS = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const KEY_EVENTS = {
  KeyE: 'input:action',
  Space: 'input:action',
  Enter: 'input:action',
  KeyT: 'input:toggleAscii',
  KeyH: 'input:help',
  KeyJ: 'input:journal',
  KeyI: 'input:inventory',
  KeyM: 'input:map',
  Escape: 'input:escape',
  KeyP: 'input:escape',
};
const TAP_SLOP_PX = 12;

/**
 * 輸入：鍵盤、滑鼠／觸控點擊、虛擬搖桿、滾輪與雙指縮放。
 * 只負責「讀取輸入」並透過 EventBus 發出事件，不知道遊戲規則。
 */
export class Input {
  constructor({ canvas, bus }) {
    this.bus = bus;
    this.pressed = new Set();
    this.joy = { x: 0, y: 0 };

    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
    window.addEventListener('blur', () => this.clear());

    // 點擊／輕觸（只有畫布上的點擊才算，介面上的不算）
    const pointers = new Map();
    let pinchStart = null;
    canvas.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        bus.emit('input:zoom', (pinchStart - d) * 0.004);
        pinchStart = d;
      }
    });
    const up = (e) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (!p || pointers.size > 0) return;
      const dx = e.clientX - p.sx;
      const dy = e.clientY - p.sy;
      if (dx * dx + dy * dy <= TAP_SLOP_PX * TAP_SLOP_PX) bus.emit('input:tap', { x: e.clientX, y: e.clientY });
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        bus.emit('input:zoom', Math.sign(e.deltaY) * 0.08);
      },
      { passive: false },
    );
  }

  #onKeyDown(e) {
    const inField = e.target instanceof HTMLElement && e.target.closest('input, textarea, select');
    if (inField) return;
    const onButton = e.target instanceof HTMLElement && e.target.closest('button');
    if (MOVE_KEYS[e.code]) {
      if (onButton && e.code.startsWith('Arrow')) return;
      e.preventDefault();
      this.pressed.add(e.code);
      return;
    }
    if (e.repeat) return;
    // 焦點在按鈕上時，讓瀏覽器自己處理 Enter／Space（觸發按鈕）
    if (onButton && (e.code === 'Enter' || e.code === 'Space')) return;
    const event = KEY_EVENTS[e.code];
    if (event) {
      if (e.code === 'Space') e.preventDefault();
      this.bus.emit(event);
    }
  }

  setJoystick(v) {
    this.joy = v;
  }

  /** 移動意圖（鍵盤＋搖桿），x 左右、y 前後，長度 0–1 */
  moveVector() {
    let x = this.joy.x;
    let y = this.joy.y;
    for (const code of this.pressed) {
      x += MOVE_KEYS[code][0];
      y += MOVE_KEYS[code][1];
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  clear() {
    this.pressed.clear();
  }
}
