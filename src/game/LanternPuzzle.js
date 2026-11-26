/**
 * 石燈順序謎題：依照指定順序點亮。
 * 點錯時只有「那一盞」點不起來，已經點亮的不會熄滅，避免無意義的重複操作。
 *
 * light() 的回傳值：'lit' | 'complete' | 'wrong' | 'already-lit' | 'done'
 */
export class LanternPuzzle {
  constructor(order, lit = []) {
    if (!Array.isArray(order) || order.length === 0) throw new Error('order 不可為空');
    this.order = [...order];
    this.lit = lit.filter((id, i) => order[i] === id);
  }

  get complete() {
    return this.lit.length === this.order.length;
  }

  get next() {
    return this.order[this.lit.length] ?? null;
  }

  isLit(id) {
    return this.lit.includes(id);
  }

  light(id) {
    if (!this.order.includes(id)) throw new Error(`未知的石燈：${id}`);
    if (this.complete) return 'done';
    if (this.isLit(id)) return 'already-lit';
    if (this.next !== id) return 'wrong';
    this.lit.push(id);
    return this.complete ? 'complete' : 'lit';
  }
}
