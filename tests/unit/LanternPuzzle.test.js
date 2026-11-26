import { describe, expect, it } from 'vitest';
import { LanternPuzzle } from '../../src/game/LanternPuzzle.js';

const ORDER = ['plum', 'orchid', 'chrysanthemum', 'bamboo'];

describe('LanternPuzzle', () => {
  it('依正確順序點亮後完成', () => {
    const p = new LanternPuzzle(ORDER);
    for (const id of ORDER.slice(0, 3)) expect(p.light(id)).toBe('lit');
    expect(p.light('bamboo')).toBe('complete');
    expect(p.light('plum')).toBe('done');
  });

  it('點錯不會把已點亮的熄掉', () => {
    const p = new LanternPuzzle(ORDER);
    p.light('plum');
    expect(p.light('bamboo')).toBe('wrong');
    expect(p.lit).toEqual(['plum']);
    expect(p.next).toBe('orchid');
  });

  it('從存檔還原時只接受正確的前綴', () => {
    expect(new LanternPuzzle(ORDER, ['plum', 'orchid']).lit).toEqual(['plum', 'orchid']);
    expect(new LanternPuzzle(ORDER, ['orchid']).lit).toEqual([]);
  });

  it('未知的石燈或空順序會丟出錯誤', () => {
    expect(() => new LanternPuzzle(ORDER).light('rain')).toThrow();
    expect(() => new LanternPuzzle([])).toThrow();
  });
});
