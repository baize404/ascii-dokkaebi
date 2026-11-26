import { RECIPES } from '../data/story.js';

/** 背包：記錄持有的道具 id（依取得順序），並支援道具組合。 */
export class Inventory {
  #items = [];

  constructor(items = []) {
    for (const id of items) this.add(id);
  }

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

  /** 找出 a + b 的配方（順序無關），沒有就回傳 null */
  static recipeFor(a, b) {
    return RECIPES.find((r) => r.inputs.includes(a) && r.inputs.includes(b) && a !== b) ?? null;
  }

  /** 組合兩個道具，成功回傳配方，失敗回傳 null */
  combine(a, b) {
    const recipe = Inventory.recipeFor(a, b);
    if (!recipe || !this.has(a) || !this.has(b)) return null;
    this.remove(a);
    this.remove(b);
    this.add(recipe.output);
    return recipe;
  }
}
