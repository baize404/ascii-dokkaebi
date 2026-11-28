import { describe, expect, it } from 'vitest';
import { AdaptiveQuality, QUALITY_LADDER } from '../../src/core/AdaptiveQuality.js';
import { migrate, OBSOLETE_KEYS } from '../../src/core/Settings.js';
import { QUALITY_PRESETS, resolvePixelRatio } from '../../src/render/Renderer.js';

describe('純 3D 解析度與畫質等級', () => {
  it('像素密度取裝置、手動上限、等級上限的最小值', () => {
    expect(resolvePixelRatio({ deviceRatio: 3, quality: 'high' })).toBe(2);
    expect(resolvePixelRatio({ deviceRatio: 3, quality: 'low' })).toBe(1);
    expect(resolvePixelRatio({ deviceRatio: 2, pixelRatio: '1.5', quality: 'ultra' })).toBe(1.5);
    expect(resolvePixelRatio({ deviceRatio: 1, quality: 'ultra' })).toBe(1);
  });

  it('動態解析度縮放有下限，不會縮到看不清楚', () => {
    expect(resolvePixelRatio({ deviceRatio: 2, quality: 'high', scale: 0.7 })).toBeCloseTo(1.4);
    expect(resolvePixelRatio({ deviceRatio: 1, quality: 'low', scale: 0.1 })).toBe(0.5);
  });

  it('越高等級的陰影越精細，只有高、超高預設開光暈', () => {
    const order = ['low', 'medium', 'high', 'ultra'];
    const shadows = order.map((q) => QUALITY_PRESETS[q].shadow);
    expect(shadows).toEqual([...shadows].sort((a, b) => a - b));
    expect(order.filter((q) => QUALITY_PRESETS[q].bloom)).toEqual(['high', 'ultra']);
  });
});

describe('自適應畫質：遲滯與冷卻', () => {
  const run = (q, fps, seconds) => {
    let changed = null;
    for (let i = 0; i < seconds * fps; i++) {
      const r = q.update(1 / fps);
      if (r !== null) changed = r;
    }
    return changed;
  };

  it('持續低幀率才降級，短暫掉幀不降級', () => {
    const q = new AdaptiveQuality();
    expect(run(q, 60, 3)).toBe(null);
    expect(run(q, 30, 1)).toBe(null);
    expect(run(q, 30, 4)).toBe(1);
  });

  it('降級後有冷卻時間，不會立刻連降', () => {
    const q = new AdaptiveQuality();
    run(q, 60, 3);
    expect(run(q, 20, 4)).toBe(1);
    expect(q.level).toBe(1);
    run(q, 20, 3); // 冷卻中
    expect(q.level).toBe(1);
  });

  it('幀率在兩個門檻之間時維持不變（遲滯區間）', () => {
    const q = new AdaptiveQuality({ start: 2 });
    run(q, 50, 30);
    expect(q.level).toBe(2);
  });

  it('升級後馬上撐不住，那一級會被封鎖，不會來回跳', () => {
    const q = new AdaptiveQuality({ start: 2, cooldown: 1 });
    run(q, 60, 10); // 升到 1
    expect(q.level).toBe(1);
    run(q, 30, 5); // 降回 2，並封鎖 1
    expect(q.level).toBe(2);
    run(q, 60, 20);
    expect(q.level).toBe(2);
  });

  it('階梯從好到差，最差一級仍可運作', () => {
    expect(QUALITY_LADDER[0].quality).toBe('high');
    expect(QUALITY_LADDER.at(-1).quality).toBe('low');
  });
});

describe('設定遷移', () => {
  it('2.x、3.x 的 ASCII 設定全部移除，其他設定保留', () => {
    const old = { ascii: true, renderMode: 'hd', density: 'fine', sampling: '4', glyphShape: 'tall', glyphWeight: 'bold', musicVolume: 0.3, quality: 'medium' };
    expect(migrate(old)).toEqual({ musicVolume: 0.3, quality: 'medium' });
    expect(OBSOLETE_KEYS).toContain('renderMode');
  });

  it('動態解析度階梯：先降縮放再降細節', () => {
    expect(QUALITY_LADDER.every((s) => s.scale > 0 && s.scale <= 1)).toBe(true);
    expect(QUALITY_LADDER[1].quality).toBe(QUALITY_LADDER[0].quality);
    expect(QUALITY_LADDER[1].scale).toBeLessThan(QUALITY_LADDER[0].scale);
  });
});
