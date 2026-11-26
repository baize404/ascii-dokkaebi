import { ACHIEVEMENTS } from '../data/achievements.js';
import { CODEX } from '../data/codex.js';
import { CHAPTERS, CLUES, ITEMS } from '../data/story.js';
import { Inventory } from '../game/Inventory.js';

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
  return node;
};

/**
 * 通用面板：同一個框架顯示日誌、背包、地圖、設定、說明、圖鑑、成就、暫停選單與對話歷史。
 * 面板開著時遊戲會暫停（由 Game 判斷 isOpen）。
 */
export class Panels {
  constructor(bus, { settings }) {
    this.bus = bus;
    this.settings = settings;
    this.layer = document.getElementById('panel');
    this.titleEl = document.getElementById('panel-title');
    this.tabsEl = document.getElementById('panel-tabs');
    this.body = document.getElementById('panel-body');
    this.onClose = null;
    document.getElementById('panel-close').addEventListener('click', () => this.close());
    this.layer.addEventListener('click', (e) => {
      if (e.target === this.layer) this.close();
    });
  }

  get isOpen() {
    return !this.layer.hidden;
  }

  /** tabs: [{ id, label, render(body) }] */
  open(title, tabs, initial = tabs[0]?.id, onClose = null) {
    this.onClose?.();
    this.onClose = onClose;
    this.titleEl.textContent = title;
    this.tabsEl.replaceChildren();
    const show = (id) => {
      for (const b of this.tabsEl.children) b.setAttribute('aria-selected', String(b.dataset.id === id));
      this.body.replaceChildren();
      tabs.find((t) => t.id === id)?.render(this.body);
      this.body.scrollTop = 0;
    };
    if (tabs.length > 1) {
      for (const t of tabs) {
        this.tabsEl.append(
          el('button', { type: 'button', 'data-id': t.id, role: 'tab', onclick: () => {
            this.bus.emit('sfx', 'page');
            show(t.id);
          } }, t.label),
        );
      }
    }
    this.layer.hidden = false;
    show(initial);
    this.bus.emit('sfx', 'page');
    document.getElementById('panel-close').focus({ preventScroll: true });
  }

  close() {
    if (this.layer.hidden) return;
    this.layer.hidden = true;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
    this.bus.emit('ui:panelClosed');
  }

  // ---------- 任務日誌 ----------

  openJournal(state, { onHint }) {
    const objectives = (body) => {
      body.append(el('h3', { text: CHAPTERS[state.chapter] }));
      const ul = el('ul', { class: 'quest-list' });
      for (const o of state.objectives()) {
        ul.append(
          el('li', { class: [o.done ? 'done' : '', o.optional ? 'optional' : ''].join(' ') }, el('span', { class: 'mark', text: o.done ? '✓' : '◇' }), `${o.text}${o.progress && !o.done ? `（${o.progress}）` : ''}${o.optional ? '　（支線）' : ''}`),
        );
        for (const s of o.subs ?? []) {
          ul.append(el('li', { class: `sub ${s.done ? 'done' : ''}` }, el('span', { class: 'mark', text: s.done ? '✓' : '·' }), `${s.text}${s.progress && !s.done ? `（${s.progress}）` : ''}`));
        }
      }
      body.append(ul);
      body.append(el('p', { class: 'muted', text: `探索度 ${Math.round(state.exploration() * 100)}%　·　已發現線索 ${state.clues.size} 條` }));
    };
    const clues = (body) => {
      if (!state.clues.size) body.append(el('p', { class: 'muted', text: '還沒有發現任何線索。四處走走，調查發光或可疑的東西。' }));
      for (const id of state.clues) {
        const c = CLUES[id];
        body.append(el('div', { class: 'clue' }, el('b', { text: c.title }), el('p', { text: c.text })));
      }
    };
    const hints = (body) => {
      const puzzle = state.currentPuzzle();
      body.append(el('p', { text: '卡關了嗎？提示分三段，越後面越具體，但不會直接說出答案。使用提示會記錄在結算畫面。' }));
      const box = el('div');
      const render = () => {
        box.replaceChildren();
        const level = puzzle ? state.hintLevel(puzzle) : 0;
        for (let i = 1; i <= level; i++) box.append(el('div', { class: 'hint-box', text: `提示 ${i}：${state.hintText(puzzle, i)}` }));
        if (!puzzle) box.append(el('p', { class: 'muted', text: '目前沒有需要提示的謎題。' }));
        else if (level < 3) {
          box.append(el('button', { type: 'button', class: 'primary', onclick: () => {
            onHint();
            render();
          } }, level === 0 ? '給我一點提示' : '再具體一點'));
        } else box.append(el('p', { class: 'muted', text: '這是最後一段提示了。' }));
      };
      render();
      body.append(box);
    };
    this.open('任務日誌', [
      { id: 'objectives', label: '目標', render: objectives },
      { id: 'clues', label: `線索（${state.clues.size}）`, render: clues },
      { id: 'hints', label: '提示', render: hints },
    ]);
  }

  // ---------- 背包 ----------

  openInventory(state, { onInspect, onUse, onCombine }) {
    let selected = null;
    let combining = false;
    const render = (body) => {
      body.replaceChildren();
      const items = state.inventory.list();
      if (!items.length) {
        body.append(el('p', { class: 'muted', text: '包袱裡還是空的。' }));
        return;
      }
      if (combining) body.append(el('p', { class: 'hint-box', text: `要把「${ITEMS[selected].name}」和哪一樣東西組合？` }));
      const grid = el('div', { class: 'inv-grid', role: 'list' });
      for (const id of items) {
        const item = ITEMS[id];
        grid.append(
          el(
            'button',
            {
              type: 'button',
              class: `inv-slot ${combining && id !== selected ? 'combine-target' : ''}`,
              'aria-pressed': String(selected === id),
              'data-item': id,
              onclick: () => {
                if (combining && id !== selected) {
                  const result = onCombine(selected, id);
                  combining = false;
                  selected = result ? result.output : selected;
                } else {
                  selected = id;
                  combining = false;
                }
                this.bus.emit('sfx', 'ui');
                render(body);
              },
            },
            el('pre', { text: item.icon }),
            el('span', { text: item.name }),
          ),
        );
      }
      body.append(grid);
      if (selected && state.inventory.has(selected)) {
        const item = ITEMS[selected];
        const canCombine = items.some((other) => other !== selected && Inventory.recipeFor(selected, other));
        body.append(
          el(
            'div',
            { class: 'inv-detail' },
            el('h4', { text: `${item.name}（${item.note}）` }),
            el('p', { text: item.desc }),
            el(
              'div',
              { class: 'inv-actions' },
              el('button', { type: 'button', onclick: () => onInspect(selected) }, '調查'),
              el('button', { type: 'button', onclick: () => onUse(selected) }, '使用'),
              el('button', { type: 'button', disabled: items.length < 2, onclick: () => {
                combining = !combining;
                render(body);
              } }, combining ? '取消組合' : canCombine ? '組合 ✦' : '組合'),
            ),
          ),
        );
      } else {
        body.append(el('p', { class: 'muted', text: '點選道具查看說明、調查、使用或組合。' }));
      }
    };
    this.open('背包', [{ id: 'inv', label: '背包', render }]);
  }

  // ---------- 地圖 ----------

  openMap(minimap, data) {
    this.open('探索地圖', [
      {
        id: 'map',
        label: '地圖',
        render: (body) => {
          const canvas = el('canvas', { class: 'map-big', 'aria-label': '探索地圖' });
          body.append(canvas);
          body.append(el('p', { class: 'muted', text: '▲ 你的位置　◆ 已知的任務地點　文字為已發現的地標。走過的地方才會從迷霧中出現。' }));
          requestAnimationFrame(() => minimap.render(canvas, data));
        },
      },
    ]);
  }

  // ---------- 設定 ----------

  openSettings({ onHelp } = {}) {
    const s = this.settings;
    const range = (key, label) => {
      const input = el('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(s.get(key) * 100), id: `set-${key}`, 'aria-label': label });
      input.addEventListener('input', () => s.set(key, Number(input.value) / 100));
      return el('div', { class: 'setting' }, el('label', { for: `set-${key}`, text: label }), input);
    };
    const seg = (key, label, options) => {
      const wrap = el('div', { class: 'seg', role: 'group', 'aria-label': label });
      const draw = () => {
        wrap.replaceChildren(
          ...options.map(([value, text]) =>
            el('button', { type: 'button', 'aria-pressed': String(s.get(key) === value), 'data-value': String(value), onclick: () => {
              s.set(key, value);
              this.bus.emit('sfx', 'ui');
              draw();
            } }, text),
          ),
        );
      };
      draw();
      return el('div', { class: 'setting', 'data-setting': key }, el('span', { text: label }), wrap);
    };
    const onOff = [
      [true, '開'],
      [false, '關'],
    ];
    this.open('設定', [
      {
        id: 'audio',
        label: '聲音',
        render: (body) => body.append(range('musicVolume', '音樂音量'), range('ambienceVolume', '環境音量'), range('sfxVolume', '互動音效')),
      },
      {
        id: 'video',
        label: '畫面',
        render: (body) =>
          body.append(
            seg('ascii', 'ASCII 畫面', [
              [true, 'ASCII'],
              [false, '原始 3D'],
            ]),
            seg('density', '字元密度', [
              ['fine', '細'],
              ['normal', '中'],
              ['coarse', '粗'],
            ]),
            seg('quality', '畫質', [
              ['auto', '自動'],
              ['low', '低'],
              ['medium', '中'],
              ['high', '高'],
            ]),
            seg('showFps', '顯示 FPS', onOff),
            el('p', { class: 'muted', text: '「自動」會依實際幀率調整陰影、草叢與粒子數量。' }),
          ),
      },
      {
        id: 'access',
        label: '介面與無障礙',
        render: (body) =>
          body.append(
            seg('uiScale', '字體大小', [
              ['small', '小'],
              ['normal', '中'],
              ['large', '大'],
            ]),
            seg('cameraShake', '鏡頭震動', onOff),
            seg('reduceMotion', '減少動畫與閃爍', onOff),
            el('div', { class: 'actions' }, el('button', { type: 'button', onclick: () => onHelp?.() }, '操作說明'), el('button', { type: 'button', onclick: () => {
              s.reset();
              this.openSettings({ onHelp });
            } }, '恢復預設值')),
          ),
      },
    ]);
  }

  // ---------- 說明、圖鑑、成就、歷史、暫停 ----------

  openHelp(touch) {
    const rows = touch
      ? [
          ['移動', '拖動左下角的搖桿，或點一下地面（角色會自動繞過障礙物）'],
          ['互動', '靠近發光的地方，按右下角的「互動」，或直接點那個東西'],
          ['對話', '點一下畫面繼續；點虛線的韓文看中文解釋'],
          ['鏡頭', '雙指捏合縮放'],
        ]
      : [
          ['移動', 'WASD／方向鍵，或點一下地面（角色會自動繞過障礙物）'],
          ['互動', 'E／Space，或直接點那個東西'],
          ['對話', '點一下或按 Space 繼續；選項可按數字鍵；點虛線的韓文看中文解釋'],
          ['鏡頭', '滑鼠滾輪縮放'],
          ['快捷鍵', 'J 任務日誌　I 背包　M 地圖　T 切換 ASCII／3D　Esc 暫停'],
        ];
    this.open('操作說明', [
      {
        id: 'help',
        label: '說明',
        render: (body) => {
          const dl = el('dl', { class: 'stats' });
          for (const [k, v] of rows) dl.append(el('dt', { text: k }), el('dd', { text: v }));
          body.append(dl);
          body.append(el('h3', { text: '玩法' }));
          body.append(el('p', { text: '這是一個探索解謎遊戲：到處走走、調查可疑的東西，線索會記在任務日誌裡。謎題的答案都藏在村子裡，不需要事先知道韓國民俗。' }));
          body.append(el('p', { text: '遊戲會自動存檔，關掉網頁後可以從主選單「繼續旅程」。' }));
        },
      },
    ]);
  }

  openCodex(unlocked) {
    this.open(`民俗圖鑑（${unlocked.size}/${CODEX.length}）`, [
      {
        id: 'codex',
        label: '圖鑑',
        render: (body) => {
          body.append(el('p', { class: 'muted', text: '在遊戲中遇到相關的人事物就會解鎖。每一條都分成「真實文化」與「遊戲設定」，請不要把遊戲劇情當成民俗考據。' }));
          for (const entry of CODEX) {
            if (!unlocked.has(entry.id)) {
              body.append(el('div', { class: 'codex-entry locked' }, el('h4', { text: '？？？' }), el('p', { text: '尚未發現。' })));
              continue;
            }
            const sources = entry.sources.length
              ? el('p', {}, '來源：', ...entry.sources.flatMap((s, i) => [i ? '、' : '', el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title)]))
              : el('p', { class: 'muted', text: '來源：一般常識性介紹，未引用特定文獻。' });
            body.append(
              el(
                'div',
                { class: 'codex-entry' },
                el('h4', { text: `${entry.title}　${entry.subtitle}` }),
                el('p', {}, el('span', { class: 'tag real', text: '真實文化' }), entry.real),
                el('p', {}, el('span', { class: 'tag fiction', text: '遊戲設定' }), entry.game),
                sources,
              ),
            );
          }
        },
      },
    ]);
  }

  openAchievements(achievements) {
    const list = achievements.list();
    const done = list.filter((a) => a.unlockedAt).length;
    this.open(`成就（${done}/${ACHIEVEMENTS.length}）`, [
      {
        id: 'ach',
        label: '成就',
        render: (body) => {
          for (const a of list) {
            body.append(
              el('div', { class: `ach ${a.unlockedAt ? 'unlocked' : ''}` }, el('span', { class: 'seal', text: a.unlockedAt ? '印' : '　' }), el('div', {}, el('strong', { text: a.title }), el('p', { class: 'muted', text: a.desc }))),
            );
          }
        },
      },
    ]);
  }

  openHistory(history) {
    this.open('對話歷史', [
      {
        id: 'history',
        label: '歷史',
        render: (body) => {
          if (!history.length) body.append(el('p', { class: 'muted', text: '還沒有對話。' }));
          for (const h of history.slice(-80)) body.append(el('p', {}, h.name ? el('b', { style: 'color: var(--gold)', text: `${h.name}：` }) : null, h.text));
          requestAnimationFrame(() => (body.scrollTop = body.scrollHeight));
        },
      },
    ]);
  }

  openPause(actions) {
    this.open('暫停', [
      {
        id: 'pause',
        label: '暫停',
        render: (body) => {
          const menu = el('div', { class: 'pause-menu' });
          for (const [label, fn, primary] of actions) menu.append(el('button', { type: 'button', class: primary ? 'primary' : '', onclick: fn }, label));
          body.append(menu);
        },
      },
    ]);
  }
}
