import { describe, expect, it } from 'vitest';
import { LANTERN_ORDER, RIDDLES } from '../../src/data/story.js';
import { GameState } from '../../src/game/GameState.js';

/** 依照正確流程走完第一到第三章 */
function playToAltar(s) {
  s.readStele();
  s.visitKitchen();
  s.openJar(2);
  s.crankWell();
  s.crankWell();
  s.crankWell();
  s.useStorehouse();
  s.inspect('screen');
  for (const carving of LANTERN_ORDER) s.lightLantern(s.lanternLayout.indexOf(carving));
  s.inspectRope();
}

describe('GameState：村落的因果鏈', () => {
  it('廚房給葫蘆瓶和字條線索，只給一次', () => {
    const s = new GameState({ seed: 1 });
    expect(s.visitKitchen()).toBe('first');
    expect(s.inventory.has('gourd')).toBe(true);
    expect(s.clues.has('note')).toBe(true);
    expect(s.visitKitchen()).toBe('again');
  });

  it('장독대只有最大的甕有메밀묵', () => {
    const s = new GameState({ seed: 1 });
    expect(s.openJar(0)).toBe('small');
    expect(s.openJar(1)).toBe('middle');
    expect(s.openJar(2)).toBe('got');
    expect(s.openJar(2)).toBe('empty');
    expect(s.inventory.has('muk')).toBe(true);
  });

  it('水井要轉三次轆轤才拿到鑰匙', () => {
    const s = new GameState({ seed: 1 });
    expect(s.crankWell().result).toBe('crank');
    expect(s.crankWell().result).toBe('crank');
    expect(s.crankWell().result).toBe('got');
    expect(s.inventory.has('key')).toBe(true);
    expect(s.crankWell().result).toBe('empty');
  });

  it('倉庫：沒鑰匙鎖著；有鑰匙但沒容器要回來再裝', () => {
    const s = new GameState({ seed: 1 });
    expect(s.useStorehouse()).toBe('locked');
    s.crankWell(); s.crankWell(); s.crankWell();
    expect(s.useStorehouse()).toBe('opened-no-container');
    expect(s.clues.has('emptyJar')).toBe(true);
    expect(s.useStorehouse()).toBe('no-container');
    s.visitKitchen();
    expect(s.useStorehouse()).toBe('filled');
    expect(s.inventory.has('makgeolli')).toBe(true);
    expect(s.inventory.has('gourd')).toBe(false);
    expect(s.useStorehouse()).toBe('empty');
  });

  it('帶著葫蘆瓶第一次開倉庫就直接裝酒', () => {
    const s = new GameState({ seed: 1 });
    s.visitKitchen();
    s.crankWell(); s.crankWell(); s.crankWell();
    expect(s.useStorehouse()).toBe('opened-filled');
  });

  it('章節依進度推進', () => {
    const s = new GameState({ seed: 2 });
    expect(s.chapter).toBe(1);
    s.readStele();
    expect(s.chapter).toBe(2);
    s.visitKitchen(); s.openJar(2); s.crankWell(); s.crankWell(); s.crankWell(); s.useStorehouse();
    expect(s.chapter).toBe(3);
  });
});

describe('GameState：石燈', () => {
  it('刻紋位置每局隨機，但同一個 seed 結果相同', () => {
    expect(new GameState({ seed: 7 }).lanternLayout).toEqual(new GameState({ seed: 7 }).lanternLayout);
    const layouts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => new GameState({ seed }).lanternLayout.join()));
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('點錯只會那一盞點不起來，已點亮的保留', () => {
    const s = new GameState({ seed: 3 });
    const spot = (c) => s.lanternLayout.indexOf(c);
    expect(s.lightLantern(spot('plum'))).toBe('lit');
    expect(s.lightLantern(spot('bamboo'))).toBe('wrong');
    expect(s.lanterns.lit).toEqual(['plum']);
    expect(s.stats.lanternMistakes).toBe(1);
    s.lightLantern(spot('orchid'));
    s.lightLantern(spot('chrysanthemum'));
    expect(s.lightLantern(spot('bamboo'))).toBe('complete');
    expect(s.flags.ropeOpen).toBe(true);
  });
});

describe('GameState：도깨비的遊戲', () => {
  it('供品不齊時祭壇會列出缺少的東西', () => {
    const s = new GameState({ seed: 4 });
    s.readStele();
    expect(s.useAltar()).toEqual({ status: 'not-ready', missing: ['muk', 'makgeolli'] });
  });

  it('題目只會從玩家看過的線索裡抽，而且一定抽得到三題', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = new GameState({ seed });
      playToAltar(s);
      expect(s.useAltar().status).toBe('offered');
      expect(s.flags.riddleIds).toHaveLength(3);
      for (const id of s.flags.riddleIds) {
        const r = RIDDLES.find((q) => q.id === id);
        expect(s.clues.has(r.clue)).toBe(true);
      }
    }
  });

  it('答完三題後玩甕遊戲，答錯會記錄失誤', () => {
    const s = new GameState({ seed: 5 });
    playToAltar(s);
    s.useAltar();
    const r = s.currentRiddle();
    expect(s.answerRiddle((r.answer + 1) % 3)).toBe('wrong');
    for (let i = 0; i < 3; i++) s.answerRiddle(s.currentRiddle().answer);
    expect(s.flags.riddlesDone).toBe(true);
    expect(s.useAltar().status).toBe('shell');
    const round = s.newShellRound();
    expect(s.answerShell((round.answer + 1) % 3)).toBe('wrong');
    s.newShellRound();
    expect(s.answerShell(s.shell.round.answer)).toBe('right');
    expect(s.stats.riddleMistakes).toBe(1);
    expect(s.stats.shellMistakes).toBe(1);
    expect(s.finish()).toBe('normal');
  });

  it('真結局：追到黑貓、補好감투並交給도깨비', () => {
    const s = new GameState({ seed: 6 });
    playToAltar(s);
    expect(s.meetCat()).toBe('first');
    expect(s.meetCat()).toBe('second');
    expect(s.meetCat()).toBe('third');
    expect(s.inventory.has('tornHat')).toBe(true);
    s.wakeGrandma();
    expect(s.combine('needle', 'tornHat').output).toBe('hat');
    s.useAltar();
    for (let i = 0; i < 3; i++) s.answerRiddle(s.currentRiddle().answer);
    s.newShellRound();
    s.answerShell(s.shell.round.answer);
    expect(s.giveHat()).toBe('repaired');
    expect(s.finish()).toBe('true');
  });

  it('把沒補好的帽子還給도깨비只會是一般結局', () => {
    const s = new GameState({ seed: 6 });
    s.meetCat(); s.meetCat(); s.meetCat();
    expect(s.giveHat()).toBe('torn');
    expect(s.finish()).toBe('normal');
  });
});

describe('GameState：提示、日誌與存檔', () => {
  it('提示分三段，用完停在最後一段並計數', () => {
    const s = new GameState({ seed: 8 });
    s.readStele();
    expect(s.useHint().level).toBe(1);
    expect(s.useHint().level).toBe(2);
    expect(s.useHint().level).toBe(3);
    expect(s.useHint().level).toBe(3);
    expect(s.stats.hintsUsed).toBe(4);
  });

  it('任務日誌不會提前顯示還沒接觸的內容', () => {
    const s = new GameState({ seed: 9 });
    expect(s.objectives().map((o) => o.id)).toEqual(['start']);
    s.readStele();
    const offerings = s.objectives().find((o) => o.id === 'offerings');
    expect(offerings.subs).toHaveLength(0);
    s.visitKitchen();
    expect(s.objectives().find((o) => o.id === 'offerings').subs.map((x) => x.id)).toEqual(['muk', 'key', 'makgeolli']);
  });

  it('toJSON / fromJSON 可以完整還原進度', () => {
    const s = new GameState({ seed: 10 });
    playToAltar(s);
    s.useHint('riddles');
    s.discoverLandmark('well');
    const restored = GameState.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    expect(restored.lanternLayout).toEqual(s.lanternLayout);
    expect(restored.inventory.list()).toEqual(s.inventory.list());
    expect([...restored.clues]).toEqual([...s.clues]);
    expect(restored.flags.ropeOpen).toBe(true);
    expect(restored.lanterns.complete).toBe(true);
    expect(restored.landmarks.has('well')).toBe(true);
    expect(restored.chapter).toBe(s.chapter);
  });

  it('fromJSON 會擋掉不合法的資料', () => {
    expect(() => GameState.fromJSON(null)).toThrow();
    expect(() => GameState.fromJSON({ version: 1, seed: 1 })).toThrow();
    const s = GameState.fromJSON({ version: 2, seed: 3, clues: ['stele', 'hacked'], flags: { readStele: 'yes', catStage: 2 } });
    expect([...s.clues]).toEqual(['stele']);
    expect(s.flags.readStele).toBe(false);
    expect(s.flags.catStage).toBe(2);
  });
});
