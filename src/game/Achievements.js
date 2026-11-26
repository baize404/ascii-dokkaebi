import { ACHIEVEMENTS } from '../data/achievements.js';

const KEY = 'ascii-dokkaebi.achievements';

/**
 * 成就系統：跨存檔保存（重新開始不會清掉）。
 * evaluate(summary) 回傳這次新解鎖的成就。
 */
export class Achievements {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.unlocked = {};
    try {
      const saved = JSON.parse(this.storage?.getItem(KEY) ?? '{}');
      for (const a of ACHIEVEMENTS) if (typeof saved?.[a.id] === 'string') this.unlocked[a.id] = saved[a.id];
    } catch {
      this.unlocked = {};
    }
  }

  isUnlocked(id) {
    return Boolean(this.unlocked[id]);
  }

  evaluate(summary) {
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (!this.unlocked[a.id] && a.check(summary)) {
        this.unlocked[a.id] = new Date().toISOString();
        fresh.push(a);
      }
    }
    if (fresh.length) {
      try {
        this.storage?.setItem(KEY, JSON.stringify(this.unlocked));
      } catch {
        // 忽略
      }
    }
    return fresh;
  }

  list() {
    return ACHIEVEMENTS.map((a) => ({ ...a, unlockedAt: this.unlocked[a.id] ?? null }));
  }
}
