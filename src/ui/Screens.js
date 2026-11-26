import { textToAscii } from './asciiTitle.js';

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
    const seconds = Math.round((stats.finishedAt - stats.startedAt) / 1000);
    const time = `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
    const rows = [
      ['花費時間', time],
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
