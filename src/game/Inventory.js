/** 背包：只記錄持有的物品 id，依取得順序排列。 */
export class Inventory {
  #items = [];

  add(id) {
    if (!this.has(id)) this.#items.push(id);
  }

  remove(id) {
    this.#items = this.#items.filter((item) => item !== id);
  }

  has(id) {
    return this.#items.includes(id);
  }

  list() {
    return [...this.#items];
  }
}
