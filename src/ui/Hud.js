/**
 * 遊戲中的抬頭顯示：目前目標（一行）、功能按鈕、互動按鈕、教學提示、通知、FPS。
 * 按鈕只發出事件（ui:journal、ui:inventory、ui:map、ui:pause、ui:hint、ui:interact），不直接操作遊戲。
 */
export class Hud {
  constructor(bus, { touch }) {
    this.bus = bus;
    this.touch = touch;
    this.root = document.getElementById('hud');
    this.objectiveBtn = document.getElementById('objective');
    this.chapterEl = document.getElementById('objective-chapter');
    this.objectiveText = document.getElementById('objective-text');
    this.promptBtn = document.getElementById('prompt');
    this.tipEl = document.getElementById('tip');
    this.toastEl = document.getElementById('toast');
    this.badge = document.getElementById('inventory-badge');
    this.fpsEl = document.getElementById('fps');
    this.promptLabel = '';
    this.lastObjective = '';

    const wire = (id, event) =>
      document.getElementById(id).addEventListener('click', (e) => {
        e.currentTarget.blur();
        bus.emit('sfx', 'ui');
        bus.emit(event);
      });
    wire('objective', 'ui:journal');
    wire('btn-inventory', 'ui:inventory');
    wire('btn-map', 'ui:map');
    wire('btn-menu', 'ui:pause');
    wire('btn-hint', 'ui:hint');
    wire('minimap', 'ui:map');
    this.promptBtn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      bus.emit('ui:interact');
    });
  }

  show(visible) {
    this.root.hidden = !visible;
  }

  setObjective(chapter, text) {
    this.chapterEl.textContent = chapter;
    this.objectiveText.textContent = text;
    if (text !== this.lastObjective && this.lastObjective) {
      this.objectiveBtn.classList.remove('flash');
      void this.objectiveBtn.offsetWidth;
      this.objectiveBtn.classList.add('flash');
    }
    this.lastObjective = text;
  }

  setPrompt(label) {
    if (label === this.promptLabel) return;
    this.promptLabel = label;
    this.promptBtn.hidden = !label;
    if (!label) return;
    this.promptBtn.textContent = this.touch ? `互動\n${label}` : `[E] ${label}`;
    this.promptBtn.style.whiteSpace = this.touch ? 'pre-line' : '';
  }

  /** 教學／提示橫幅；duration 毫秒後自動消失（0 = 不自動消失） */
  tip(text, duration = 0) {
    clearTimeout(this.tipTimer);
    this.tipEl.textContent = text ?? '';
    this.tipEl.hidden = !text;
    if (text && duration) this.tipTimer = setTimeout(() => (this.tipEl.hidden = true), duration);
  }

  /** 短暫通知（依序排隊顯示）；icon 是道具的 ASCII 圖示 */
  toast(message, icon = null) {
    this.queue ??= [];
    if (this.queue.some((q) => q.message === message)) return;
    this.queue.push({ message, icon });
    if (!this.showing) this.#nextToast();
  }

  #nextToast() {
    const next = this.queue.shift();
    if (!next) {
      this.showing = false;
      return;
    }
    this.showing = true;
    this.#showToast(next.message, next.icon);
    setTimeout(() => this.#nextToast(), 2200);
  }

  #showToast(message, icon) {
    this.toastEl.replaceChildren();
    if (icon) {
      const pre = document.createElement('pre');
      pre.textContent = icon;
      this.toastEl.append(pre);
    }
    const span = document.createElement('span');
    span.textContent = message;
    this.toastEl.append(span);
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2100);
  }

  setInventoryBadge(on) {
    this.badge.hidden = !on;
  }

  setFps(fps) {
    this.fpsEl.hidden = fps === null;
    if (fps !== null) this.fpsEl.textContent = `${fps.toFixed(0)} FPS`;
  }
}
