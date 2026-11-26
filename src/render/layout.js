/**
 * ASCII 版面計算（純函式，可單元測試）。
 *
 * 四件事分開控制，不互相混淆：
 * 1. 字元密度：每格字元在畫面上的大小（CSS 像素）→ 決定畫面有幾欄幾列字元
 * 2. Canvas DPR：畫布實際像素（drawing buffer）與 CSS 像素的比例 → 只影響字元筆畫是否銳利，不改變格數
 * 3. 場景取樣：每格字元由 N×N 個場景像素平均而來 → 場景離屏貼圖 = 格數 × N（有上限）
 * 4. 陰影解析度：由場景模組另外處理
 */

/** 字元密度預設：每格 CSS 像素 [大螢幕, 小螢幕（短邊 < 600）] */
export const DENSITY_PRESETS = {
  classic: { label: 'Classic', css: [9, 8], samples: 4 },
  fine: { label: 'Fine', css: [6, 5], samples: 4 },
  ultra: { label: 'Ultra', css: [4, 4], samples: 2 },
  cinematic: { label: 'Cinematic', css: [3, 3], samples: 2 },
};

/** 各畫質等級：Canvas DPR 上限、場景貼圖最多幾個像素 */
export const QUALITY_LIMITS = {
  low: { dpr: 1, maxSceneTexels: 600_000 },
  medium: { dpr: 1.5, maxSceneTexels: 1_300_000 },
  high: { dpr: 2, maxSceneTexels: 2_600_000 },
};

/** 字元格子比例：方格，或接近一般文字的直長格 */
export const GLYPH_SHAPES = { square: 1, tall: 1.6 };

/**
 * @param o.cssWidth/cssHeight 視窗 CSS 尺寸
 * @param o.deviceRatio 裝置像素比（window.devicePixelRatio）
 * @param o.density classic | fine | ultra | cinematic
 * @param o.samples 'auto' 或 1／2／4／8
 * @param o.pixelRatio 'auto' 或數字（DPR 上限）
 * @param o.quality low | medium | high
 * @param o.shape square | tall
 */
export function computeLayout({ cssWidth, cssHeight, deviceRatio = 1, density = 'fine', samples = 'auto', pixelRatio = 'auto', quality = 'high', shape = 'square' }) {
  const preset = DENSITY_PRESETS[density] ?? DENSITY_PRESETS.fine;
  const limits = QUALITY_LIMITS[quality] ?? QUALITY_LIMITS.high;
  const dprCap = pixelRatio === 'auto' ? limits.dpr : Number(pixelRatio);
  const dpr = Math.max(0.5, Math.min(deviceRatio || 1, dprCap));
  const bufferWidth = Math.max(1, Math.round(cssWidth * dpr));
  const bufferHeight = Math.max(1, Math.round(cssHeight * dpr));

  // 格子大小以「實際像素」取整數，避免字元寬度忽大忽小；換回 CSS 像素時仍接近預設值
  const cssCell = Math.min(cssWidth, cssHeight) < 600 ? preset.css[1] : preset.css[0];
  const cellWidth = Math.max(2, Math.round(cssCell * dpr));
  const cellHeight = Math.max(2, Math.round(cssCell * dpr * (GLYPH_SHAPES[shape] ?? 1)));
  const cols = Math.ceil(bufferWidth / cellWidth);
  const rows = Math.ceil(bufferHeight / cellHeight);

  // 取樣倍率：超過貼圖上限就降一級（8 → 4 → 2 → 1）
  let n = samples === 'auto' ? preset.samples : Number(samples);
  if (![1, 2, 4, 8].includes(n)) n = preset.samples;
  while (n > 1 && cols * rows * n * n > limits.maxSceneTexels) n /= 2;
  // 方格以外的比例：直向多取樣一些，維持每個樣本接近正方形
  const aspect = cellHeight / cellWidth;
  const samplesX = n;
  const samplesY = Math.max(1, Math.round(n * aspect));

  return {
    dpr,
    bufferWidth,
    bufferHeight,
    cssCell,
    cellWidth,
    cellHeight,
    cols,
    rows,
    samples: n,
    samplesX,
    samplesY,
    sceneWidth: cols * samplesX,
    sceneHeight: rows * samplesY,
  };
}
