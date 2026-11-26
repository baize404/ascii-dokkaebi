const RAMP = ' .:-=+*#%@';

/** 判斷系統有沒有能畫出這段文字的字型（沒有的話會畫成豆腐方塊）。 */
function canRender(text, font) {
  const draw = (t) => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = font;
    ctx.fillText(t, 4, 50);
    return c.toDataURL();
  };
  return draw(text[0]) !== draw('￿');
}

/**
 * 把一段文字畫在離屏 canvas 上，再依每格的覆蓋率轉成 ASCII 藝術字。
 */
export function textToAscii(text, cols) {
  const fontFamily = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const font = `900 120px ${fontFamily}`;
  const label = canRender(text, font) ? text : 'DOKKAEBI';

  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const width = Math.ceil(measure.measureText(label).width) + 20;
  const height = 150;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 10, height / 2);

  const data = ctx.getImageData(0, 0, width, height).data;
  const cellW = width / cols;
  const cellH = cellW * 2; // 字元大約是寬:高 = 1:2
  const rows = Math.floor(height / cellH);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(r * cellH); y < Math.floor((r + 1) * cellH); y += 2) {
        for (let x = Math.floor(c * cellW); x < Math.floor((c + 1) * cellW); x += 2) {
          sum += data[(y * width + x) * 4];
          n++;
        }
      }
      const v = n ? sum / n / 255 : 0;
      line += RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  // 去掉上下空行
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}
