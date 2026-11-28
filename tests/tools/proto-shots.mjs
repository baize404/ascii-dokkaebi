/**
 * 原型截圖工具（開發用）：用測試介面把鏡頭放到幾個位置，各拍一張。
 * node tests/tools/proto-shots.mjs [輸出資料夾] [畫質]
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const out = resolve(process.argv[2] ?? '/tmp/proto-shots');
const quality = process.argv[3] ?? 'high';
mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port: 4191 }, logLevel: 'silent' });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.stack));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${server.resolvedUrls.local[0]}prototype.html?test&quality=${quality}`);
await page.waitForFunction(() => window.__proto, null, { timeout: 60000 }).catch(() => { console.log("載入失敗", errors); process.exit(1); });
await page.evaluate(() => window.__proto.freeze());
const P = (fn, ...a) => page.evaluate(([f, args]) => window.__proto[f](...args), [fn, a]);
await P('step', 30, 1 / 30);
const shots = process.env.SHOTS ? process.env.SHOTS.split(',') : ['play', 'third', 'bridge', 'shrine', 'winch', 'stele'];
for (const name of shots) {
  if (name === 'play') {
    await P('step', 20, 1 / 30);
  } else if (name === 'third') {
    await P('setView', 'third');
    await P('step', 30, 1 / 30);
  } else if (name === 'bridge') {
    await P('photo', [3.5, 3.2, 7.5], [0, 0, -2]);
  } else if (name === 'shrine') {
    await P('photo', [3.5, 2.4, -5.5], [0, 1.8, -12.5]);
  } else if (name === 'winch') {
    await P('photo', [4.2, 1.6, 6.8], [6.2, 0.8, 4.5]);
  } else if (name === 'stele') {
    await P('photo', [3.4, 1.7, 13.2], [4.2, 1.2, 10.4]);
  } else if (name === 'canyon') {
    await P('photo', [12, 5, 10], [0, -2, 0]);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log(JSON.stringify({ errors, state: await P('state') }, (k, v) => (k === 'log' || k === 'progress' ? undefined : v)).slice(0, 1500));
await browser.close();
await server.close();
