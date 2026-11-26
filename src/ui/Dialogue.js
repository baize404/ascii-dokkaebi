import { GLOSSARY } from '../data/codex.js';
import { portraitFor } from '../data/portraits.js';
import { SPEAKERS } from '../data/story.js';

const MOODS = { laugh: '大笑', surprised: '驚訝', serious: '嚴肅', smile: '微笑', pout: '嘟嘴', sad: '難過' };
const CHOICE_LOCK_MS = 350;
const TERM_PATTERN = new RegExp(`(${Object.keys(GLOSSARY).sort((a, b) => b.length - a.length).join('|')})`, 'g');

/**
 * 對話框：說話者名字、ASCII 肖像與表情、逐字顯示、韓文詞彙註解、對話歷史、選項。
 * say() 逐句顯示、choose() 顯示選項，都回傳 Promise。
 * - 點一下或按 Space：打字中就直接顯示全文，否則換下一句。
 * - 選項在文字顯示完才出現，並短暫鎖定，避免連點時誤選；也可以用數字鍵選。
 */
export class Dialogue {
  #advance = null;
  #typing = null;

  constructor(bus) {
    this.bus = bus;
    this.layer = document.getElementById('dialogue');
    this.portraitEl = document.getElementById('dialogue-portrait');
    this.speakerEl = document.getElementById('dialogue-speaker');
    this.textEl = document.getElementById('dialogue-text');
    this.choicesEl = document.getElementById('dialogue-choices');
    this.hintEl = document.getElementById('dialogue-hint');
    this.pop = document.getElementById('glossary-pop');
    this.isOpen = false;
    this.history = [];
    this.instantText = false;
    this.externalPick = null;

    this.layer.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const term = e.target.closest('.term');
      if (term) {
        this.#showTerm(term);
        return;
      }
      this.next();
    });
    document.getElementById('btn-history').addEventListener('click', (e) => {
      e.stopPropagation();
      bus.emit('ui:history');
    });
    bus.on('input:action', () => {
      if (this.isOpen) this.next();
    });
  }

  next() {
    this.pop.hidden = true;
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

  /** 顯示一句話和選項；options.eliminated 為要劃掉的選項。回傳選到的索引。 */
  async choose(line, choices, { eliminated = [] } = {}) {
    this.#open();
    this.#renderLine(line);
    this.hintEl.hidden = true;
    if (this.#typing) await this.#typing.done;
    let pick;
    const picked = new Promise((resolve) => (pick = resolve));
    const openedAt = performance.now();
    const ready = () => performance.now() - openedAt >= CHOICE_LOCK_MS;
    choices.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';
      btn.textContent = `${i + 1}. ${label}`;
      if (eliminated.includes(i)) {
        btn.classList.add('eliminated');
        btn.disabled = true;
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (ready()) pick(i);
      });
      this.choicesEl.append(btn);
    });
    const onKey = (e) => {
      const n = Number.parseInt(e.key, 10);
      if (n >= 1 && n <= choices.length && !eliminated.includes(n - 1) && ready()) {
        e.preventDefault();
        pick(n - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    this.externalPick = (i) => {
      if (i >= 0 && i < choices.length && !eliminated.includes(i) && ready()) pick(i);
    };
    const index = await picked;
    this.externalPick = null;
    window.removeEventListener('keydown', onKey);
    this.history.push({ name: '你的選擇', text: choices[index] });
    this.choicesEl.replaceChildren();
    this.#close();
    return index;
  }

  #renderLine({ speaker = 'narrator', text, mood }) {
    const def = SPEAKERS[speaker] ?? SPEAKERS.narrator;
    const narrator = speaker === 'narrator';
    this.speakerEl.textContent = narrator ? '' : def.name;
    if (!narrator && mood && MOODS[mood]) {
      const m = document.createElement('span');
      m.className = 'mood';
      m.textContent = `（${MOODS[mood]}）`;
      this.speakerEl.append(m);
    }
    this.speakerEl.hidden = narrator;
    this.speakerEl.style.color = def.color ?? '';
    this.portraitEl.textContent = def.portrait ? portraitFor(def.portrait, mood) : '';
    this.choicesEl.replaceChildren();
    this.history.push({ name: narrator ? '' : def.name, text });
    if (this.history.length > 200) this.history.splice(0, this.history.length - 200);
    this.#typeText(text);
  }

  #typeText(text) {
    this.#typing?.finish();
    const chars = [...text];
    let shown = 0;
    let resolveDone;
    const done = new Promise((r) => (resolveDone = r));
    let timer = null;
    const finish = () => {
      clearInterval(timer);
      this.textEl.innerHTML = this.#withTerms(text);
      this.#typing = null;
      resolveDone();
    };
    this.#typing = { finish, done };
    if (this.instantText) {
      finish();
      return;
    }
    this.textEl.textContent = '';
    timer = setInterval(() => {
      shown = Math.min(chars.length, shown + 2);
      this.textEl.textContent = chars.slice(0, shown).join('');
      if (shown >= chars.length) finish();
    }, 28);
  }

  /** 把韓文詞彙包成可以點的註解 */
  #withTerms(text) {
    const escaped = text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    return escaped.replace(TERM_PATTERN, (term) => `<span class="term" data-term="${term}">${term}</span>`);
  }

  #showTerm(el) {
    const term = el.dataset.term;
    this.pop.innerHTML = `<b>${term}</b>　${GLOSSARY[term]}`;
    this.pop.hidden = false;
    const r = el.getBoundingClientRect();
    this.pop.style.left = `${Math.max(10, Math.min(window.innerWidth - 250, r.left))}px`;
    this.pop.style.top = `${Math.max(10, r.top - 46)}px`;
    clearTimeout(this.popTimer);
    this.popTimer = setTimeout(() => (this.pop.hidden = true), 3000);
  }

  #open() {
    this.isOpen = true;
    this.layer.hidden = false;
  }

  #close() {
    this.#typing?.finish();
    this.isOpen = false;
    this.layer.hidden = true;
    this.pop.hidden = true;
  }

  reset() {
    this.#typing?.finish();
    this.#advance = null;
    this.externalPick = null;
    this.history = [];
    this.isOpen = false;
    this.layer.hidden = true;
    this.choicesEl.replaceChildren();
  }
}
