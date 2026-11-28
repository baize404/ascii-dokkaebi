/**
 * 效能量測：在同一個遊戲狀態、同一個鏡頭下，比較各渲染模式、字元密度與畫質的幀率與幀時間。
 * 每個組合先暖機 2 秒，再量 4 秒（requestAnimationFrame 間隔）：平均 FPS、平均／第 95 百分位幀時間、JS heap。
 *
 * 注意：在沒有顯示卡的環境（SwiftShader）量到的數字只能比較「相對成本」，不代表真實裝置。
 * 用法：node tests/e2e/perf.mjs [輸出 JSON 路徑]
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const out = process.argv[2] ?? 'docs/perf/results.json';
// [畫質, 光暈, 陰影]：4.0 只有純 3D
const CASES = [
  ['low', 'off', 'auto'],
  ['medium', 'off', 'auto'],
  ['high', 'auto', 'auto'],
  ['high', 'off', 'auto'],
  ['ultra', 'auto', 'auto'],
];
const VIEWPORTS = [
  { name: '桌面 1280×800 DPR1', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  { name: '手機直式 390×844 DPR2', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

const server = await preview({ preview: { port: 4198 }, logLevel: 'silent' });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const results = [];
for (const vp of VIEWPORTS) {
  const { name, ...ctx } = vp;
  const page = await browser.newPage(ctx);
  await page.goto(server.resolvedUrls.local[0] + '?test');
  await page.waitForFunction(() => window.__dokkaebi);
  await page.locator('#btn-new').click();
  await page.locator('#btn-skip').click();
  await page.waitForFunction(() => window.__dokkaebi.state().mode === 'playing');
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  for (const [quality, render, density] of CASES) {
    await page.evaluate(([q, b, sh]) => {
      const api = window.__dokkaebi;
      api.setSetting('quality', q);
      api.setSetting('bloom', b);
      api.setSetting('shadows', sh);
    }, [quality, render, density]);
    await page.waitForTimeout(2000);
    const m = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const times = [];
          let last = performance.now();
          const t0 = last;
          const f = (now) => {
            times.push(now - last);
            last = now;
            if (now - t0 < 4000) requestAnimationFrame(f);
            else {
              times.sort((a, b) => a - b);
              const avg = times.reduce((a, b) => a + b, 0) / times.length;
              resolve({ fps: 1000 / avg, avgMs: avg, p95Ms: times[Math.floor(times.length * 0.95)], heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null });
            }
          };
          requestAnimationFrame(f);
        }),
    );
    const layout = await page.evaluate(() => window.__dokkaebi.layout());
    const row = {
      viewport: name,
      quality,
      bloom: layout.bloom,
      buffer: `${layout.width}×${layout.height}`,
      dpr: layout.dpr,
      fps: +m.fps.toFixed(1),
      avgMs: +m.avgMs.toFixed(1),
      p95Ms: +m.p95Ms.toFixed(1),
      heapMB: m.heapMB === null ? null : +m.heapMB.toFixed(1),
    };
    results.push(row);
    console.log(`${name}｜${quality} 光暈${layout.bloom ? '開' : '關'}｜${row.buffer} DPR ${row.dpr}｜${row.fps} FPS（平均 ${row.avgMs} ms、p95 ${row.p95Ms} ms）｜heap ${row.heapMB} MB`);
  }
  results.push({ viewport: name, gpu });
  await page.close();
}
writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), environment: 'Linux 容器、Chrome 無頭模式、SwiftShader（CPU 模擬 WebGL，沒有實體顯示卡）、2 核心 CPU', results }, null, 2));
await browser.close();
await server.close();
