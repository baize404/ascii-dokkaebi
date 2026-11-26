import { ITEMS, OBJECTIVES } from '../data/script.js';

/**
 * 遊戲中的抬頭顯示：任務清單、背包、互動提示、短暫通知。
 */
export class Hud {
  constructor({ quest, bus }) {
    this.quest = quest;
    this.root = document.getElementById('hud');
    this.objectiveList = document.getElementById('objective-list');
    this.inventoryList = document.getElementById('inventory-list');
    this.promptBtn = document.getElementById('prompt');
    this.toastEl = document.getElementById('toast');
    this.asciiBtn = document.getElementById('btn-ascii');
    this.soundBtn = document.getElementById('btn-sound');
    this.toastTimer = 0;
    this.promptLabel = '';
    // 觸控裝置沒有 E 鍵，提示改成「點這裡」
    this.keyHint = window.matchMedia?.('(pointer: coarse)').matches ? '點這裡：' : '[E]';

    this.promptBtn.addEventListener('click', () => bus.emit('ui:interact'));
    this.asciiBtn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      bus.emit('input:toggleAscii');
    });
    this.soundBtn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      bus.emit('input:toggleSound');
    });
    document.getElementById('btn-help').addEventListener('click', (e) => {
      e.currentTarget.blur();
      bus.emit('input:help');
    });
  }

  setQuest(quest) {
    this.quest = quest;
    this.refresh();
  }

  show(visible) {
    this.root.hidden = !visible;
  }

  refresh() {
    const items = this.quest.objectives().map(({ id, done, progress }) => {
      const li = document.createElement('li');
      li.className = done ? 'done' : '';
      li.textContent = `${done ? '[x]' : '[ ]'} ${OBJECTIVES[id]}${progress && !done ? `（${progress}）` : ''}`;
      return li;
    });
    this.objectiveList.replaceChildren(...items);

    const inv = this.quest.inventory.list();
    if (inv.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '（空的）';
      this.inventoryList.replaceChildren(li);
    } else {
      this.inventoryList.replaceChildren(
        ...inv.map((id) => {
          const li = document.createElement('li');
          li.textContent = `• ${ITEMS[id].name}`;
          li.title = ITEMS[id].note;
          return li;
        }),
      );
    }
  }

  setPrompt(label) {
    if (label === this.promptLabel) return;
    this.promptLabel = label;
    this.promptBtn.hidden = !label;
    if (label) this.promptBtn.textContent = `${this.keyHint} ${label}`;
  }

  setSoundState(muted) {
    this.soundBtn.textContent = muted ? '♪̸' : '♪';
    this.soundBtn.classList.toggle('off', muted);
    this.soundBtn.title = muted ? '音效已關閉（M）' : '音效開關（M）';
  }

  setAsciiState(on) {
    this.asciiBtn.textContent = on ? 'ASCII' : '3D';
    this.asciiBtn.classList.toggle('off', !on);
  }

  toast(message) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }
}
