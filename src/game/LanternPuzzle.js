/**
 * 石燈順序謎題：依照指定順序點亮，點錯就全部熄滅重來。
 *
 * light() 的回傳值：
 *  - 'lit'         點對了，但還沒全部點完
 *  - 'complete'    最後一盞點對，謎題完成
 *  - 'reset'       點錯順序，全部熄滅
 *  - 'already-lit' 這盞已經亮著
 *  - 'done'        謎題早已完成
 */
export class LanternPuzzle {
  constructor(order) {
    if (!Array.isArray(order) || order.length === 0) throw new Error('order 不可為空');
    this.order = [...order];
    this.lit = [];
  }

  get complete() {
    return this.lit.length === this.order.length;
  }

  isLit(id) {
    return this.lit.includes(id);
  }

  light(id) {
    if (!this.order.includes(id)) throw new Error(`未知的石燈：${id}`);
    if (this.complete) return 'done';
    if (this.isLit(id)) return 'already-lit';
    if (this.order[this.lit.length] === id) {
      this.lit.push(id);
      return this.complete ? 'complete' : 'lit';
    }
    this.lit = [];
    return 'reset';
  }
}
