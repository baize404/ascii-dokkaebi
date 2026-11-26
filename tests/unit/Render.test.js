import { describe, expect, it } from 'vitest';
import { AdaptiveQuality, QUALITY_LADDER } from '../../src/core/AdaptiveQuality.js';
import { migrate } from '../../src/core/Settings.js';
import { computeLayout, DENSITY_PRESETS } from '../../src/render/layout.js';
import { buildRamp } from '../../src/render/glyphAtlas.js';

describe('ASCII 版面：密度、DPR、取樣分開控制', () => {
  const base = { cssWidth: 1280, cssHeight: 800, deviceRatio: 2, quality: 'high' };

  it('提高 DPR 不會改變字元格數，只改變每格的實際像素', () => {
    const a = computeLayout({ ...base, density: 'fine', pixelRatio: '1' });
    const b = computeLayout({ ...base, density: 'fine', pixelRatio: '2' });
    expect(a.cols).toBeGreaterThan(200);
    expect(Math.abs(a.cols - b.cols)).toBeLessThanOrEqual(1);
    expect(b.cellWidth).toBe(a.cellWidth * 2);
    expect(b.bufferWidth).toBe(a.bufferWidth * 2);
  });

  it('密度越高格數越多：Classic < Fine < Ultra < Cinematic', () => {
    const cols = ['classic', 'fine', 'ultra', 'cinematic'].map((d) => computeLayout({ ...base, density: d }).cols);
    expect(cols).toEqual([...cols].sort((x, y) => x - y));
    expect(new Set(cols).size).toBe(4);
  });

  it('每格 CSS 大小符合預設範圍', () => {
    for (const [d, range] of Object.entries({ classic: [8, 10], fine: [5, 6], ultra: [3, 4], cinematic: [2, 3] })) {
      const l = computeLayout({ ...base, density: d });
      const cssCell = l.cellWidth / l.dpr;
      expect(cssCell).toBeGreaterThanOrEqual(range[0]);
      expect(cssCell).toBeLessThanOrEqual(range[1]);
    }
  });

  it('場景貼圖 = 格數 × 取樣倍率，超過上限時自動降取樣', () => {
    const l4 = computeLayout({ ...base, density: 'fine', samples: '4' });
    expect(l4.sceneWidth).toBe(l4.cols * 4);
    const big = computeLayout({ ...base, density: 'cinematic', samples: '8', quality: 'low' });
    expect(big.samples).toBeLessThan(8);
    expect(big.sceneWidth * big.sceneHeight).toBeLessThanOrEqual(600_000);
  });

  it('手機短邊小於 600 時使用小螢幕的格子大小', () => {
    const phone = computeLayout({ cssWidth: 390, cssHeight: 844, deviceRatio: 3, density: 'classic', quality: 'medium' });
    expect(phone.cssCell).toBe(DENSITY_PRESETS.classic.css[1]);
    expect(phone.dpr).toBe(1.5);
  });

  it('直長格子：列數變少、直向取樣變多', () => {
    const sq = computeLayout({ ...base, density: 'fine', samples: '4' });
    const tall = computeLayout({ ...base, density: 'fine', samples: '4', shape: 'tall' });
    expect(tall.rows).toBeLessThan(sq.rows);
    expect(tall.samplesY).toBeGreaterThan(tall.samplesX);
  });
});

describe('字元亮度階梯', () => {
  it('依覆蓋率等距挑選、由暗到亮排序、第一個是空白', () => {
    const coverage = new Map([[' ', 0], ['.', 0.05], [':', 0.1], ['-', 0.12], ['+', 0.2], ['*', 0.3], ['#', 0.5], ['@', 0.6], ['M', 0.58]]);
    const ramp = buildRamp([...coverage.keys()].join(''), coverage, 5);
    expect(ramp[0]).toBe(' ');
    expect(ramp.length).toBe(5);
    const covs = [...ramp].map((g) => coverage.get(g));
    expect(covs).toEqual([...covs].sort((a, b) => a - b));
    expect(ramp.at(-1)).toBe('@');
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
  it('2.x 的 ascii 開關與密度轉成新選項', () => {
    expect(migrate({ ascii: false, density: 'normal' })).toEqual({ renderMode: '3d', density: 'classic' });
    expect(migrate({ ascii: true, density: 'fine' })).toEqual({ renderMode: 'hd', density: 'fine' });
  });
});
