/**
 * 自適應畫質（純邏輯，可單元測試）。
 *
 * 依實際幀率在「畫質階梯」上移動：太慢先降解析度縮放，再降 3D 細節（陰影、Bloom、草量）。
 * 為了避免畫質反覆跳動：
 * - 遲滯：低於 downFps 持續 downAfter 秒才降級；高於 upFps 持續 upAfter 秒才升級（兩個門檻有間距）
 * - 冷卻：每次調整後 cooldown 秒內不再調整
 * - 封鎖：升級後很快又被迫降級，代表那一級撐不住 → 那一級封鎖 banSeconds 秒
 */
export const QUALITY_LADDER = [
  { quality: 'high', scale: 1 },
  { quality: 'high', scale: 0.85 },
  { quality: 'medium', scale: 0.85 },
  { quality: 'medium', scale: 0.7 },
  { quality: 'low', scale: 0.7 },
  { quality: 'low', scale: 0.55 },
];

export class AdaptiveQuality {
  constructor({ start = 0, downFps = 42, upFps = 57, downAfter = 2.5, upAfter = 6, cooldown = 8, banSeconds = 60, ladder = QUALITY_LADDER } = {}) {
    Object.assign(this, { downFps, upFps, downAfter, upAfter, cooldown, banSeconds, ladder });
    this.level = Math.max(0, Math.min(ladder.length - 1, start));
    this.fps = 60;
    this.below = 0;
    this.above = 0;
    this.cooldownLeft = 2; // 剛開始的幾秒（載入、編譯 shader）不判斷
    this.lastUpAt = -Infinity;
    this.time = 0;
    this.bans = new Map(); // level → 解除封鎖的時間
  }

  get step() {
    return this.ladder[this.level];
  }

  /**
   * 每幀呼叫。@returns 新的階梯等級（有變化時），否則 null
   */
  update(dt) {
    if (!(dt > 0)) return null;
    this.time += dt;
    const instant = 1 / Math.min(dt, 0.5);
    this.fps += (instant - this.fps) * Math.min(1, dt * 2);
    if (this.cooldownLeft > 0) {
      this.cooldownLeft -= dt;
      this.below = this.above = 0;
      return null;
    }
    this.below = this.fps < this.downFps ? this.below + dt : 0;
    this.above = this.fps > this.upFps ? this.above + dt : 0;

    if (this.below >= this.downAfter && this.level < this.ladder.length - 1) {
      // 剛升級就撐不住：封鎖剛剛那一級
      if (this.time - this.lastUpAt < 15) this.bans.set(this.level, this.time + this.banSeconds);
      return this.#go(this.level + 1);
    }
    if (this.above >= this.upAfter && this.level > 0) {
      const target = this.level - 1;
      if ((this.bans.get(target) ?? 0) > this.time) return null;
      this.lastUpAt = this.time;
      return this.#go(target);
    }
    return null;
  }

  #go(level) {
    this.level = level;
    this.below = this.above = 0;
    this.cooldownLeft = this.cooldown;
    return level;
  }
}
