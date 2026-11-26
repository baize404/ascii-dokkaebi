import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter } from 'three';

/**
 * 字元圖集。
 *
 * - 亮度階梯依「實際筆畫覆蓋率」排序：先把候選字元畫出來量每個字元有多少比例是筆畫，
 *   再挑出覆蓋率接近等距的字元，讓明暗層次平均。
 * - Pure ASCII 用精選的符號（比較乾淨），HD ASCII 用全部可列印 ASCII 挑出更多層次。
 *   兩者都只用 ASCII（0x20–0x7E）。
 * - 方向輪廓字元：| \ - /（依梯度方向）以及細線版本 ' ` , .（給很小的物件）。
 * - 每個字元放在獨立的格子裡、四周留白邊，配合 mipmap 取樣時不會滲到隔壁字元。
 */

/** Pure ASCII 的候選字元（只用符號與少數字母，畫面比較乾淨） */
export const PURE_CANDIDATES = ' .\'`,:;-~_^"=+*<>!icoxXO#%@';
/**
 * HD ASCII 的候選字元：符號為主，加上形狀圓潤、不搶眼的小寫字母與少數高密度字元。
 * （大片同色區域會重複同一個字，像 C、U、A 這種辨識度高的字母會變成明顯的花紋，所以排除）
 */
export const HD_CANDIDATES = ' .\'`,:;-~_^"=+*<>!?icl1rvxzsoea0O#%&$@8B';
/** 輪廓字元：梯度方向 0°、45°、90°、135° */
export const EDGE_GLYPHS = '|\\-/';

const PURE_LEVELS = 14;
const HD_LEVELS = 24;
const TILE = 64;
const GUTTER = 8;

const FONT_STACK = '"DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", monospace';

function drawGlyph(ctx, glyph, x, y, { weight, shape }) {
  const inner = TILE - GUTTER * 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + GUTTER, y + GUTTER, inner, inner);
  ctx.clip();
  ctx.translate(x + TILE / 2, y + TILE / 2 + inner * 0.04);
  // 方格：等寬字比較瘦，橫向拉寬；直長格：保持原本的字形比例（格子本身會被拉高）
  if (shape === 'square') ctx.scale(1.35, 1);
  else ctx.scale(1.6, 0.62);
  ctx.font = `${weight === 'bold' ? 'bold' : 'normal'} ${Math.round(inner * 0.98)}px ${FONT_STACK}`;
  ctx.fillText(glyph, 0, 0);
  ctx.restore();
}

/** 量測每個字元的筆畫覆蓋率（0–1） */
export function measureCoverage(glyphs, style, makeCanvas = () => document.createElement('canvas')) {
  const canvas = makeCanvas();
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const inner = TILE - GUTTER * 2;
  const result = new Map();
  for (const g of new Set(glyphs)) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.fillStyle = '#fff';
    drawGlyph(ctx, g, 0, 0, style);
    const data = ctx.getImageData(GUTTER, GUTTER, inner, inner).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i];
    result.set(g, sum / (255 * inner * inner));
  }
  return result;
}

/**
 * 從候選字元挑出 levels 個覆蓋率接近等距的字元（第一個一定是空白）。
 * @param coverage Map<字元, 覆蓋率>
 */
export function buildRamp(candidates, coverage, levels) {
  const sorted = [...new Set(candidates)].sort((a, b) => coverage.get(a) - coverage.get(b));
  const max = coverage.get(sorted[sorted.length - 1]);
  const ramp = [' '];
  const used = new Set([' ']);
  for (let k = 1; k < levels; k++) {
    const target = (k / (levels - 1)) * max;
    let best = null;
    let bestDiff = Infinity;
    for (const g of sorted) {
      if (used.has(g)) continue;
      const diff = Math.abs(coverage.get(g) - target);
      if (diff < bestDiff) {
        best = g;
        bestDiff = diff;
      }
    }
    if (!best) break;
    used.add(best);
    ramp.push(best);
  }
  return ramp.sort((a, b) => coverage.get(a) - coverage.get(b)).join('');
}

/**
 * 建立圖集貼圖：[Pure 階梯][HD 階梯][輪廓 4 個][細輪廓 4 個]，排成方形格子。
 * @param style { weight: 'normal'|'bold', shape: 'square'|'tall' }
 */
export function createGlyphAtlas(style = { weight: 'bold', shape: 'square' }) {
  const coverage = measureCoverage(PURE_CANDIDATES + HD_CANDIDATES, style);
  const pure = buildRamp(PURE_CANDIDATES, coverage, PURE_LEVELS);
  const hd = buildRamp(HD_CANDIDATES.replace(/[|\\/]/g, ''), coverage, HD_LEVELS);
  const thin = "'`,.";
  const glyphs = pure + hd + EDGE_GLYPHS + thin;

  const columns = Math.ceil(Math.sqrt(glyphs.length));
  const rowsCount = Math.ceil(glyphs.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * TILE;
  canvas.height = rowsCount * TILE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [...glyphs].forEach((g, i) => drawGlyph(ctx, g, (i % columns) * TILE, Math.floor(i / columns) * TILE, style));

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = false;

  return {
    texture,
    canvas,
    tile: TILE,
    gutter: GUTTER,
    columns,
    rows: rowsCount,
    pure,
    hd,
    pureStart: 0,
    pureCount: pure.length,
    hdStart: pure.length,
    hdCount: hd.length,
    edgeStart: pure.length + hd.length,
    thinStart: pure.length + hd.length + EDGE_GLYPHS.length,
    total: glyphs.length,
    coverage: [...glyphs].map((g) => coverage.get(g) ?? 0),
  };
}
