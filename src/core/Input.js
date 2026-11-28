import { GestureTracker } from './Gesture.js';

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
  KeyH: 'input:help',
  KeyJ: 'input:journal',
  KeyI: 'input:inventory',
  KeyM: 'input:map',
  KeyV: 'input:cameraView',
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

    this.onReset = null;
    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      this.pressed.delete(e.code);
      if (e.key === 'Shift') this.walkHeld = false;
    });
    this.walkHeld = false;
    // 視窗失去焦點或切到背景：清掉所有按住的鍵、手勢與搖桿，避免角色自己一直走
    window.addEventListener('blur', () => this.clear(true));
    document.addEventListener('visibilitychange', () => document.hidden && this.clear(true));

    // 畫布上的點擊／拖曳／雙指縮放交給手勢狀態機判斷（介面與搖桿不經過畫布）
    this.gesture = new GestureTracker({ slop: TAP_SLOP_PX });
    const emit = (events) => {
      for (const ev of events) {
        if (ev.type === 'tap') bus.emit('input:tap', { x: ev.x, y: ev.y });
        else if (ev.type === 'zoom') bus.emit('input:zoom', ev.delta);
      }
    };
    canvas.addEventListener('pointerdown', (e) => emit(this.gesture.down(e.pointerId, e.clientX, e.clientY, e.timeStamp)));
    canvas.addEventListener('pointermove', (e) => emit(this.gesture.move(e.pointerId, e.clientX, e.clientY)));
    canvas.addEventListener('pointerup', (e) => emit(this.gesture.up(e.pointerId, e.clientX, e.clientY, e.timeStamp)));
    canvas.addEventListener('pointercancel', (e) => this.gesture.cancel(e.pointerId));
    canvas.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && this.gesture.cancel(e.pointerId));
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
    if (e.key === 'Shift') this.walkHeld = true;
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

  /** 清除按住的鍵；all=true 時連手勢與搖桿一起清除 */
  clear(all = false) {
    this.pressed.clear();
    this.walkHeld = false;
    if (all) {
      this.gesture.reset();
      this.joy = { x: 0, y: 0 };
      this.onReset?.();
    }
  }
}
