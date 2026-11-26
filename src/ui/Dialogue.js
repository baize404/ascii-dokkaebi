/**
 * 對話框。say() 逐句顯示、choose() 顯示選項，都回傳 Promise。
 * 文字用打字機效果出現；點一下會先顯示完整句子，再點一下才換下一句。
 */
export class Dialogue {
  constructor(bus) {
    this.layer = document.getElementById('dialogue');
    this.speakerEl = document.getElementById('dialogue-speaker');
    this.textEl = document.getElementById('dialogue-text');
    this.choicesEl = document.getElementById('dialogue-choices');
    this.hintEl = document.getElementById('dialogue-hint');
    this.isOpen = false;
    this.#advance = null;
    this.#typing = null;

    this.layer.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      this.next();
    });
    bus.on('input:action', () => {
      if (this.isOpen) this.next();
    });
  }

  #advance;
  #typing;

  /** 推進對話：打字中就直接顯示全文，否則換下一句。 */
  next() {
    if (this.#typing) {
      this.#typing.finish();
      return;
    }
    const advance = this.#advance;
    this.#advance = null;
    advance?.();
  }

  async say(lines) {
    const list = Array.isArray(lines) ? lines : [lines];
    this.#open();
    for (const line of list) {
      this.#renderLine(line);
      this.hintEl.hidden = false;
      await new Promise((resolve) => {
        this.#advance = resolve;
      });
    }
    this.#close();
  }

  async choose(line, choices) {
    this.#open();
    this.#renderLine(line);
    this.hintEl.hidden = true;
    const index = await new Promise((resolve) => {
      choices.forEach((label, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice';
        btn.textContent = `${i + 1}. ${label}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          resolve(i);
        });
        this.choicesEl.append(btn);
      });
    });
    this.choicesEl.replaceChildren();
    this.#close();
    return index;
  }

  #renderLine({ speaker, text }) {
    this.speakerEl.textContent = speaker ?? '';
    this.speakerEl.hidden = !speaker;
    this.choicesEl.replaceChildren();
    this.#typeText(text);
  }

  #typeText(text) {
    this.#typing?.finish();
    const chars = [...text];
    let shown = 0;
    this.textEl.textContent = '';
    const timer = setInterval(() => {
      shown = Math.min(chars.length, shown + 2);
      this.textEl.textContent = chars.slice(0, shown).join('');
      if (shown >= chars.length) finish();
    }, 28);
    const finish = () => {
      clearInterval(timer);
      this.textEl.textContent = text;
      this.#typing = null;
    };
    this.#typing = { finish };
  }

  #open() {
    this.isOpen = true;
    this.layer.hidden = false;
  }

  #close() {
    this.#typing?.finish();
    this.isOpen = false;
    this.layer.hidden = true;
  }
}
