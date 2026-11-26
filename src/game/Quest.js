import { Inventory } from './Inventory.js';
import { LanternPuzzle } from './LanternPuzzle.js';

/**
 * 整個關卡的遊戲規則與進度（純邏輯，不碰畫面），所以可以直接寫單元測試。
 * 每個 use*() 方法回傳一個結果代碼，由 Interactions 決定要演什麼。
 */
export class Quest {
  constructor({ lanternOrder, riddles }) {
    this.inventory = new Inventory();
    this.lanterns = new LanternPuzzle(lanternOrder);
    this.riddles = riddles;
    this.flags = {
      readStele: false,
      mukTaken: false,
      keyTaken: false,
      storehouseOpen: false,
      offered: false,
      riddleIndex: 0,
      moonReturned: false,
    };
    this.stats = { interactions: 0, mistakes: 0, startedAt: 0, finishedAt: 0 };
  }

  readStele() {
    const first = !this.flags.readStele;
    this.flags.readStele = true;
    return first ? 'first' : 'again';
  }

  useKitchen() {
    if (this.flags.mukTaken) return 'empty';
    this.flags.mukTaken = true;
    this.inventory.add('muk');
    return 'got';
  }

  useWell() {
    if (this.flags.keyTaken) return 'empty';
    this.flags.keyTaken = true;
    this.inventory.add('key');
    return 'got';
  }

  useStorehouse() {
    if (this.flags.storehouseOpen) return 'empty';
    if (!this.inventory.has('key')) return 'locked';
    this.inventory.remove('key');
    this.inventory.add('makgeolli');
    this.flags.storehouseOpen = true;
    return 'opened';
  }

  lightLantern(season) {
    const result = this.lanterns.light(season);
    if (result === 'reset') this.stats.mistakes++;
    return result;
  }

  /** 祭壇還缺哪些條件（依提示順序）。 */
  missingForAltar() {
    const missing = [];
    if (!this.flags.readStele) missing.push('stele');
    if (!this.inventory.has('muk')) missing.push('muk');
    if (!this.inventory.has('makgeolli')) missing.push('makgeolli');
    if (!this.lanterns.complete) missing.push('lanterns');
    return missing;
  }

  useAltar() {
    if (this.flags.offered) return { status: 'riddles' };
    const missing = this.missingForAltar();
    if (missing.length > 0) return { status: 'not-ready', missing };
    this.inventory.remove('muk');
    this.inventory.remove('makgeolli');
    this.flags.offered = true;
    return { status: 'offered' };
  }

  currentRiddle() {
    return this.riddles[this.flags.riddleIndex] ?? null;
  }

  /** 回傳 'wrong' | 'next' | 'solved' */
  answerRiddle(choiceIndex) {
    const riddle = this.currentRiddle();
    if (!riddle || !this.flags.offered) throw new Error('現在沒有謎題可以回答');
    if (choiceIndex !== riddle.answer) {
      this.stats.mistakes++;
      return 'wrong';
    }
    this.flags.riddleIndex++;
    if (this.flags.riddleIndex >= this.riddles.length) {
      this.flags.moonReturned = true;
      return 'solved';
    }
    return 'next';
  }

  /** HUD 要顯示的任務清單；讀過장승之前只顯示第一項。 */
  objectives() {
    const has = (id) => this.inventory.has(id);
    const offeringsCount = this.flags.offered ? 2 : Number(has('muk')) + Number(has('makgeolli'));
    const list = [{ id: 'stele', done: this.flags.readStele }];
    if (!this.flags.readStele) return list;
    list.push(
      { id: 'offerings', done: offeringsCount === 2, progress: `${offeringsCount}/2` },
      { id: 'lanterns', done: this.lanterns.complete, progress: `${this.lanterns.lit.length}/${this.lanterns.order.length}` },
      { id: 'altar', done: this.flags.offered },
    );
    if (this.flags.offered) list.push({ id: 'riddles', done: this.flags.moonReturned, progress: `${this.flags.riddleIndex}/${this.riddles.length}` });
    return list;
  }
}
