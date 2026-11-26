import { describe, expect, it } from 'vitest';
import { LEVEL } from '../../src/data/level.js';
import { RIDDLES } from '../../src/data/script.js';
import { Quest } from '../../src/game/Quest.js';

const newQuest = () => new Quest({ lanternOrder: LEVEL.lanternOrder, riddles: RIDDLES });

function prepare(q) {
  q.readStele();
  q.useKitchen();
  q.useWell();
  q.useStorehouse();
  for (const s of LEVEL.lanternOrder) q.lightLantern(s);
}

describe('Quest', () => {
  it('倉庫要先從井裡拿到鑰匙才打得開', () => {
    const q = newQuest();
    expect(q.useStorehouse()).toBe('locked');
    expect(q.useWell()).toBe('got');
    expect(q.useWell()).toBe('empty');
    expect(q.useStorehouse()).toBe('opened');
    expect(q.inventory.list()).toEqual(['makgeolli']);
    expect(q.useStorehouse()).toBe('empty');
  });

  it('廚房的메밀묵只能拿一次', () => {
    const q = newQuest();
    expect(q.useKitchen()).toBe('got');
    expect(q.useKitchen()).toBe('empty');
    expect(q.inventory.has('muk')).toBe(true);
  });

  it('祭壇會列出還缺的條件', () => {
    const q = newQuest();
    expect(q.useAltar()).toEqual({ status: 'not-ready', missing: ['stele', 'muk', 'makgeolli', 'lanterns'] });
    q.readStele();
    q.useKitchen();
    expect(q.useAltar().missing).toEqual(['makgeolli', 'lanterns']);
  });

  it('條件齊全時獻上供品，供品會從背包移除', () => {
    const q = newQuest();
    prepare(q);
    expect(q.useAltar()).toEqual({ status: 'offered' });
    expect(q.inventory.list()).toEqual([]);
    expect(q.useAltar()).toEqual({ status: 'riddles' });
  });

  it('答對全部謎題後月亮回來，答錯會計入失誤', () => {
    const q = newQuest();
    prepare(q);
    q.useAltar();
    expect(() => newQuest().answerRiddle(0)).toThrow();

    const wrong = (RIDDLES[0].answer + 1) % RIDDLES[0].choices.length;
    expect(q.answerRiddle(wrong)).toBe('wrong');
    expect(q.stats.mistakes).toBe(1);

    RIDDLES.forEach((r, i) => {
      expect(q.answerRiddle(r.answer)).toBe(i === RIDDLES.length - 1 ? 'solved' : 'next');
    });
    expect(q.flags.moonReturned).toBe(true);
  });

  it('任務清單在讀過장승後才展開', () => {
    const q = newQuest();
    expect(q.objectives().map((o) => o.id)).toEqual(['stele']);
    q.readStele();
    expect(q.objectives().map((o) => o.id)).toEqual(['stele', 'offerings', 'lanterns', 'altar']);
    expect(q.objectives()[1].progress).toBe('0/2');
  });

  it('每個謎題的答案都在選項範圍內', () => {
    for (const r of RIDDLES) {
      expect(r.answer).toBeGreaterThanOrEqual(0);
      expect(r.answer).toBeLessThan(r.choices.length);
    }
  });
});
