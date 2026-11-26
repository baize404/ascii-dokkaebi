import { Vector3 } from 'three';
import { ITEMS, SCRIPT } from '../data/script.js';

/**
 * 互動劇本：把 Quest 的結果代碼轉成對話、HUD 提示與場景效果。
 * 規則在 Quest，畫面在 World／UI，這裡只負責「串起來」。
 */
export class Interactions {
  constructor({ quest, world, dialogue, hud, rig, player, bus }) {
    Object.assign(this, { quest, world, dialogue, hud, rig, player, bus });
  }

  async run(id) {
    this.quest.stats.interactions++;
    if (id.startsWith('lantern-')) return this.#lantern(id.slice('lantern-'.length));
    switch (id) {
      case 'stele':
        return this.dialogue.say(SCRIPT.stele[this.quest.readStele()]);
      case 'kitchen':
        return this.#pickup(this.quest.useKitchen(), SCRIPT.kitchen, 'muk');
      case 'well':
        return this.#pickup(this.quest.useWell(), SCRIPT.well, 'key');
      case 'storehouse':
        return this.#storehouse();
      case 'house-nw':
        return this.dialogue.say(SCRIPT.houseNw);
      case 'house-se':
        return this.dialogue.say(SCRIPT.houseSe);
      case 'altar':
        return this.#altar();
      default:
        console.warn('未知的互動：', id);
    }
  }

  async #pickup(result, lines, itemId) {
    await this.dialogue.say(lines[result]);
    if (result === 'got') this.#gotItem(itemId);
  }

  #gotItem(itemId) {
    const item = ITEMS[itemId];
    this.bus.emit('sfx', 'item');
    this.hud.toast(`取得：${item.name}（${item.note}）`);
  }

  async #storehouse() {
    const result = this.quest.useStorehouse();
    if (result === 'opened') {
      this.bus.emit('sfx', 'door');
      await this.world.openStorehouse();
      await this.dialogue.say(SCRIPT.storehouse.opened);
      this.#gotItem('makgeolli');
      return;
    }
    await this.dialogue.say(SCRIPT.storehouse[result]);
  }

  async #lantern(season) {
    const L = SCRIPT.lantern;
    if (this.quest.lanterns.isLit(season)) {
      await this.dialogue.say(L.alreadyLit(season));
      return;
    }
    const choice = await this.dialogue.choose({ speaker: '旁白', text: L.inspect(season) }, L.choices);
    if (choice !== 0) return;

    const result = this.quest.lightLantern(season);
    if (result === 'reset') {
      // 先讓這盞亮一下，再全部熄滅
      this.world.syncLanterns([...this.world.litSeasons(), season]);
      this.bus.emit('sfx', 'reset');
      await this.dialogue.say(L.reset);
    }
    this.world.syncLanterns(this.quest.lanterns.lit);
    if (result === 'lit' || result === 'complete') this.bus.emit('sfx', 'lantern');
    if (result === 'lit') await this.dialogue.say(L.lit);
    if (result === 'complete') await this.dialogue.say(L.complete);
  }

  async #altar() {
    const res = this.quest.useAltar();
    if (res.status === 'not-ready') {
      const missing = res.missing.map((m) => SCRIPT.altar.missing[m]).join('');
      await this.dialogue.say([SCRIPT.altar.intro, { speaker: '旁白', text: missing }]);
      return;
    }

    const altarPos = this.world.shrinePosition;
    const dokkaebiLook = new Vector3(altarPos.x, 2.4, altarPos.z - 2.2);
    this.rig.shot(new Vector3(altarPos.x + 4, 5, altarPos.z + 8), dokkaebiLook);

    if (res.status === 'offered') {
      this.world.showOfferings();
      await this.dialogue.say(SCRIPT.altar.offer);
      this.bus.emit('sfx', 'dokkaebi');
      await this.world.spawnDokkaebi();
      await this.dialogue.say(SCRIPT.dokkaebi.appear);
    }

    // 猜謎直到全部答對
    while (!this.quest.flags.moonReturned) {
      const riddle = this.quest.currentRiddle();
      const n = this.quest.flags.riddleIndex + 1;
      const choice = await this.dialogue.choose(
        { speaker: '도깨비', text: `第 ${n} 題：${riddle.question}` },
        riddle.choices,
      );
      const result = this.quest.answerRiddle(choice);
      this.hud.refresh();
      this.bus.emit('sfx', result === 'wrong' ? 'wrong' : 'correct');
      if (result === 'wrong') await this.dialogue.say(SCRIPT.dokkaebi.wrong);
      if (result === 'next') await this.dialogue.say(SCRIPT.dokkaebi.correct);
    }

    await this.dialogue.say(SCRIPT.dokkaebi.solved);
    // 鏡頭拉到廣場，看月亮從老樹後面升起
    this.rig.shot(new Vector3(3, 5, 1), new Vector3(0, 16, -60));
    this.bus.emit('sfx', 'moon');
    await this.world.returnMoon();
    await this.dialogue.say(SCRIPT.dokkaebi.farewell);
    await this.world.hideDokkaebi();
    this.bus.emit('game:complete');
  }
}
