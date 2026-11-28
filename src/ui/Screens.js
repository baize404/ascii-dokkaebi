const BEST_KEY = 'ascii-dokkaebi.best-seconds';
const formatTime = (s) => `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, '0')} 秒`;

function recordBest(seconds) {
  try {
    const prev = Number(localStorage.getItem(BEST_KEY));
    const isNew = !(prev > 0) || seconds < prev;
    if (isNew) localStorage.setItem(BEST_KEY, String(seconds));
    return { best: isNew ? seconds : prev, isNew };
  } catch {
    return { best: seconds, isNew: false };
  }
}

/**
 * 全螢幕畫面：標題（主選單）與結局。
 * 事件：ui:new、ui:continue、ui:settings、ui:help、ui:codex、ui:achievements、ui:restart、ui:title
 */
export class Screens {
  constructor(bus) {
    this.bus = bus;
    this.title = document.getElementById('screen-title');
    this.end = document.getElementById('screen-end');

    const click = (id, event) =>
      document.getElementById(id).addEventListener('click', (e) => {
        e.currentTarget.blur();
        bus.emit('sfx', 'ui');
        bus.emit(event);
      });
    click('btn-new', 'ui:new');
    click('btn-continue', 'ui:continue');
    click('btn-settings-title', 'ui:settings');
    click('btn-help-title', 'ui:help');
    click('btn-codex-title', 'ui:codex');
    click('btn-achievements-title', 'ui:achievements');
    click('btn-restart', 'ui:restart');
    click('btn-to-title', 'ui:title');
  }

  /** continueInfo：有存檔時顯示「繼續旅程」與存檔資訊 */
  showTitle(visible, continueInfo = null) {
    this.title.hidden = !visible;
    const btn = document.getElementById('btn-continue');
    btn.hidden = !continueInfo;
    document.getElementById('continue-info').textContent = continueInfo ?? '';
    document.getElementById('btn-new').textContent = continueInfo ? '重新開始' : '新的旅程';
  }

  showEnd({ ending, summary, achievements }) {
    const { best, isNew } = recordBest(Math.max(1, summary.seconds));
    document.getElementById('end-label').textContent = ending.id === 'true' ? '真結局' : '結局';
    document.getElementById('end-title').textContent = ending.title;
    document.getElementById('end-text').textContent = ending.text;
    const rows = [
      ['遊玩時間', formatTime(summary.seconds)],
      ['最佳紀錄', isNew ? `${formatTime(best)}（新紀錄！）` : formatTime(best)],
      ['探索度', `${Math.round(summary.exploration * 100)}%`],
      ['使用提示', `${summary.hintsUsed} 次`],
      ['謎題失誤', `${summary.mistakes} 次`],
      ['民俗圖鑑', `${summary.codexUnlocked}/${summary.codexTotal}`],
    ];
    document.getElementById('end-stats').replaceChildren(
      ...rows.flatMap(([k, v]) => {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        return [dt, dd];
      }),
    );
    document.getElementById('end-achievements').replaceChildren(
      ...achievements.map((a) => {
        const li = document.createElement('li');
        li.textContent = `◆ 解鎖成就：${a.title}`;
        return li;
      }),
    );
    this.end.hidden = false;
  }

  hideEnd() {
    this.end.hidden = true;
  }
}
