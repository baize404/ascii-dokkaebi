import { describe, expect, it } from 'vitest';
import { LanternPuzzle } from '../../src/game/LanternPuzzle.js';

const ORDER = ['spring', 'summer', 'autumn', 'winter'];

describe('LanternPuzzle', () => {
  it('依正確順序點亮後完成', () => {
    const p = new LanternPuzzle(ORDER);
    expect(p.light('spring')).toBe('lit');
    expect(p.light('summer')).toBe('lit');
    expect(p.light('autumn')).toBe('lit');
    expect(p.light('winter')).toBe('complete');
    expect(p.complete).toBe(true);
    expect(p.light('spring')).toBe('done');
  });

  it('點錯順序就全部重來', () => {
    const p = new LanternPuzzle(ORDER);
    p.light('spring');
    expect(p.light('autumn')).toBe('reset');
    expect(p.lit).toEqual([]);
    expect(p.light('spring')).toBe('lit');
  });

  it('重複點同一盞不算錯', () => {
    const p = new LanternPuzzle(ORDER);
    p.light('spring');
    expect(p.light('spring')).toBe('already-lit');
    expect(p.lit).toEqual(['spring']);
  });

  it('未知的石燈會丟出錯誤', () => {
    expect(() => new LanternPuzzle(ORDER).light('rainy')).toThrow();
    expect(() => new LanternPuzzle([])).toThrow();
  });
});
