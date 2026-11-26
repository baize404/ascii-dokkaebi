/**
 * 過場：上下黑邊＋字幕。caption() 回傳 Promise，時間到或按「跳過」就 resolve；
 * 跳過之後，同一段過場剩下的字幕都會立即結束。
 */
export class Cutscene {
  constructor(bus) {
    this.el = document.getElementById('letterbox');
    this.captionEl = document.getElementById('caption');
    this.active = false;
    this.skipped = false;
    this.wake = null;
    document.getElementById('btn-skip').addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
    });
    bus.on('input:escape', () => {
      if (this.active) this.skip();
    });
  }

  start() {
    this.active = true;
    this.skipped = false;
    this.el.hidden = false;
  }

  skip() {
    this.skipped = true;
    this.wake?.();
  }

  caption(text, ms = 3200) {
    if (this.skipped) return Promise.resolve();
    this.captionEl.textContent = text;
    this.captionEl.classList.remove('show');
    void this.captionEl.offsetWidth;
    this.captionEl.classList.add('show');
    return this.wait(ms);
  }

  wait(ms) {
    if (this.skipped) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    });
  }

  end() {
    this.active = false;
    this.el.hidden = true;
    this.captionEl.classList.remove('show');
    this.wake = null;
  }
}
