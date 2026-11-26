import { describe, expect, it } from 'vitest';
import { LEVEL } from '../../src/data/level.js';
import { clampToBounds, makeBox, resolveCircle } from '../../src/world/Collision.js';

describe('Collision', () => {
  const wall = makeBox(0, 0, 2, 2); // x,z ∈ [-1, 1]

  it('沒有重疊時位置不變', () => {
    expect(resolveCircle({ x: 3, z: 0 }, 0.5, [wall])).toEqual({ x: 3, z: 0 });
  });

  it('從側面撞到時被推回邊界外', () => {
    const p = resolveCircle({ x: 1.2, z: 0 }, 0.5, [wall]);
    expect(p.x).toBeCloseTo(1.5);
    expect(p.z).toBeCloseTo(0);
  });

  it('圓心跑進矩形裡會往最近的邊推出去', () => {
    const p = resolveCircle({ x: 0.9, z: 0.1 }, 0.5, [wall]);
    expect(p.x).toBeCloseTo(1.5);
  });

  it('不會走出地圖邊界', () => {
    const p = clampToBounds({ x: 100, z: -100 }, 0.5, LEVEL.bounds);
    expect(p.x).toBe(LEVEL.bounds.maxX - 0.5);
    expect(p.z).toBe(LEVEL.bounds.minZ + 0.5);
  });
});

describe('關卡資料', () => {
  it('每個互動點都在地圖範圍內，而且 id 不重複', () => {
    const ids = new Set();
    for (const it of LEVEL.interactables) {
      expect(ids.has(it.id)).toBe(false);
      ids.add(it.id);
      expect(it.x).toBeGreaterThan(LEVEL.bounds.minX);
      expect(it.x).toBeLessThan(LEVEL.bounds.maxX);
      expect(it.z).toBeGreaterThan(LEVEL.bounds.minZ);
      expect(it.z).toBeLessThan(LEVEL.bounds.maxZ);
    }
  });

  it('每座石燈都有對應的互動點', () => {
    for (const l of LEVEL.lanterns) {
      expect(LEVEL.interactables.some((i) => i.id === `lantern-${l.season}`)).toBe(true);
    }
  });
});
