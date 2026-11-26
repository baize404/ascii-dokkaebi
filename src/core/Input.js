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
const ACTION_KEYS = new Set(['KeyE', 'Space', 'Enter']);
const TAP_SLOP_PX = 12;

/**
 * 鍵盤與指標輸入。只負責「讀取輸入」並透過 EventBus 發出事件，
 * 不知道遊戲規則。
 *
 * 事件：input:action、input:tap {x, y}、input:toggleAscii、input:help
 */
export class Input {
  constructor({ canvas, bus }) {
    this.bus = bus;
    this.pressed = new Set();

    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
    window.addEventListener('blur', () => this.pressed.clear());

    let down = null;
    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (dx * dx + dy * dy <= TAP_SLOP_PX * TAP_SLOP_PX) {
        bus.emit('input:tap', { x: e.clientX, y: e.clientY });
      }
      down = null;
    });
  }

  #onKeyDown(e) {
    if (e.target instanceof HTMLElement && e.target.closest('button') && e.code !== 'KeyT') {
      // 焦點在按鈕上時，讓瀏覽器自己處理 Enter／Space（觸發按鈕）
      if (e.code === 'Enter' || e.code === 'Space') return;
    }
    if (MOVE_KEYS[e.code]) {
      e.preventDefault();
      this.pressed.add(e.code);
      return;
    }
    if (e.repeat) return;
    if (ACTION_KEYS.has(e.code)) {
      e.preventDefault();
      this.bus.emit('input:action');
    } else if (e.code === 'KeyT') {
      this.bus.emit('input:toggleAscii');
    } else if (e.code === 'KeyH') {
      this.bus.emit('input:help');
    }
  }

  /** 鍵盤移動意圖，x 為左右、y 為前後，已正規化。 */
  moveVector() {
    let x = 0;
    let y = 0;
    for (const code of this.pressed) {
      x += MOVE_KEYS[code][0];
      y += MOVE_KEYS[code][1];
    }
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  clear() {
    this.pressed.clear();
  }
}
