import { textToAscii } from './asciiTitle.js';

const BEST_KEY = 'ascii-dokkaebi.best-seconds';
const formatTime = (s) => `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, '0')} 秒`;

/** 讀取並更新最佳紀錄（秒），回傳 { best, isNew }。 */
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
 * 全螢幕畫面：標題、操作說明、結局。
 * 事件：ui:start、ui:restart
 */
export class Screens {
  constructor(bus) {
    this.bus = bus;
    this.title = document.getElementById('screen-title');
    this.help = document.getElementById('screen-help');
    this.end = document.getElementById('screen-end');

    const titleArt = document.getElementById('ascii-title');
    const renderTitle = () => {
      titleArt.textContent = textToAscii('도깨비', window.innerWidth < 600 ? 40 : 64);
    };
    renderTitle();
    window.addEventListener('resize', renderTitle);

    const click = (id, fn) =>
      document.getElementById(id).addEventListener('click', (e) => {
        e.currentTarget.blur();
        fn();
      });
    click('btn-start', () => bus.emit('ui:start'));
    click('btn-title-help', () => this.showHelp(true));
    click('btn-help-close', () => this.showHelp(false));
    click('btn-restart', () => bus.emit('ui:restart'));
  }

  get helpOpen() {
    return !this.help.hidden;
  }

  showTitle(visible) {
    this.title.hidden = !visible;
  }

  showHelp(visible) {
    this.help.hidden = !visible;
  }

  showEnd(stats) {
    const seconds = Math.max(1, Math.round((stats.finishedAt - stats.startedAt) / 1000));
    const { best, isNew } = recordBest(seconds);
    const rows = [
      ['花費時間', formatTime(seconds)],
      ['最佳紀錄', isNew ? `${formatTime(best)}（新紀錄！）` : formatTime(best)],
      ['互動次數', `${stats.interactions} 次`],
      ['失誤次數', `${stats.mistakes} 次`],
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
    this.end.hidden = false;
  }

  hideEnd() {
    this.end.hidden = true;
  }
}
