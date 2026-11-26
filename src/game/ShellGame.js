/**
 * 도깨비的甕遊戲（純邏輯）：三個甕排成左、中、右，月亮放進其中一個，
 * 接著交換位置數次，玩家要選出月亮最後在哪個位置。
 */
export class ShellGame {
  /** @param rng 回傳 [0,1) 的亂數函式 */
  constructor(rng = Math.random) {
    this.rng = rng;
    this.round = null;
  }

  /**
   * 產生一回合：swaps 是一連串「交換兩個位置」的動作。
   * slow 為 true 時交換次數較少、速度較慢（提示用）。
   */
  newRound({ slow = false } = {}) {
    const moonJar = Math.floor(this.rng() * 3);
    const count = slow ? 4 : 6;
    const swaps = [];
    for (let i = 0; i < count; i++) {
      const a = Math.floor(this.rng() * 3);
      const b = (a + 1 + Math.floor(this.rng() * 2)) % 3;
      swaps.push([a, b]);
    }
    // jarAt[slot] = 在該位置的甕
    const jarAt = [0, 1, 2];
    for (const [a, b] of swaps) [jarAt[a], jarAt[b]] = [jarAt[b], jarAt[a]];
    const answer = jarAt.indexOf(moonJar);
    this.round = { moonJar, swaps, answer, swapDuration: slow ? 0.75 : 0.45 };
    return this.round;
  }

  check(slot) {
    if (!this.round) throw new Error('還沒開始');
    return slot === this.round.answer;
  }
}
