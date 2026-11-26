import { CanvasTexture, LinearFilter } from 'three';

/** 由暗到亮的字元階梯，第 0 個（空白）代表全黑。 */
export const LUMA_RAMP = ' .:-~=+<>*x#%@';
/** 邊緣字元，依序對應梯度方向 0°、45°、90°、135°。 */
export const EDGE_GLYPHS = '|\\-/';

/**
 * 把所有字元畫成一條橫向圖集（白字黑底），給 ASCII shader 取樣。
 */
export function createGlyphAtlas(tile = 48) {
  const glyphs = LUMA_RAMP + EDGE_GLYPHS;
  const canvas = document.createElement('canvas');
  canvas.width = tile * glyphs.length;
  canvas.height = tile;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(tile * 0.92)}px "DejaVu Sans Mono", Menlo, Consolas, monospace`;

  [...glyphs].forEach((glyph, i) => {
    // 等寬字比較瘦，橫向拉寬一點讓正方形格子比較飽滿
    ctx.save();
    ctx.translate(i * tile + tile / 2, tile / 2 + tile * 0.04);
    ctx.scale(1.35, 1);
    ctx.fillText(glyph, 0, 0);
    ctx.restore();
  });

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;

  return { texture, lumaCount: LUMA_RAMP.length, total: glyphs.length };
}
