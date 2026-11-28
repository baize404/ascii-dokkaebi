/**
 * 4.0 切片的效能基準：各畫質實際跑 6 秒，記錄平均 FPS、幀時間分布與卡頓。
 * 注意：在沒有顯示卡的容器裡是 SwiftShader（CPU 模擬 WebGL），數字只能比較畫質之間的相對成本，
 * 不代表任何真實裝置。真實裝置請用同一支腳本或瀏覽器開發者工具另外量。
 *
 * 用法：npm run build && node tests/e2e/proto-perf.mjs docs/perf/v4-proto.json
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const out = process.argv[2] ?? 'docs/perf/v4-proto.json';
const server = await preview({ preview: { port: 4189 }, logLevel: 'silent' });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const results = [];
for (const viewport of [
  { name: '桌面 1280×720', viewport: { width: 1280, height: 720 } },
  { name: '手機直式 390×844（DPR 2）', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]) {
  for (const quality of ['low', 'medium', 'high', 'ultra']) {
    const page = await browser.newPage(viewport);
    await page.goto(`${server.resolvedUrls.local[0]}prototype.html?test&quality=${quality}`);
    await page.waitForFunction(() => window.__proto, null, { timeout: 60000 });
    // 站在最重的位置：看得到峽谷、閘門、山寺與草
    await page.evaluate(() => {
      window.__proto.teleport(1.2, 6.5, Math.PI);
      window.__proto.setView('explore');
    });
    await page.waitForTimeout(2500);
    const m = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const times = [];
          let last = performance.now();
          const t0 = last;
          const f = (now) => {
            times.push(now - last);
            last = now;
            if (now - t0 < 6000) requestAnimationFrame(f);
            else {
              times.sort((a, b) => a - b);
              const avg = times.reduce((a, b) => a + b, 0) / times.length;
              resolve({ frames: times.length, avgMs: avg, p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)], max: times.at(-1), hitches: times.filter((t) => t > avg * 2).length });
            }
          };
          requestAnimationFrame(f);
        }),
    );
    const s = await page.evaluate(() => window.__proto.state().render);
    const row = { viewport: viewport.name, quality, buffer: `${s.width}×${s.height}`, dpr: s.dpr, bloom: s.bloom, fps: +(1000 / m.avgMs).toFixed(1), avgMs: +m.avgMs.toFixed(1), p50Ms: +m.p50.toFixed(1), p95Ms: +m.p95.toFixed(1), maxMs: +m.max.toFixed(1), hitches: m.hitches };
    results.push(row);
    console.log(`${row.viewport}｜${quality}｜${row.buffer} DPR ${row.dpr} 光暈${row.bloom ? '開' : '關'}｜${row.fps} FPS（p50 ${row.p50Ms} ms、p95 ${row.p95Ms} ms、最長 ${row.maxMs} ms、卡頓 ${row.hitches} 次）`);
    await page.close();
  }
}
writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), environment: 'Linux 容器、Chrome 無頭模式、SwiftShader（CPU 模擬 WebGL，沒有實體顯示卡）。數字只能比較畫質之間的相對成本，不代表真實裝置。', results }, null, 2));
await browser.close();
await server.close();
