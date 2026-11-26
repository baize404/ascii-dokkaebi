/**
 * 固定鏡頭比較截圖：同樣的遊戲狀態、同樣的鏡頭、同樣的解析度，
 * 依序拍下不同渲染模式／字元密度，用來比較改版前後與各畫質。
 *
 * 用法：node tests/e2e/shots.mjs <輸出資料夾> [模式清單，逗號分隔]
 * 模式格式：<render>:<density>，例如 ascii:classic、hd:fine、3d:-
 * （舊版只認得 ascii／3d 與 density 0–2）
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const outDir = resolve(process.argv[2] ?? 'tests/e2e/shots');
const modes = (process.argv[3] ?? 'ascii:1,3d:-').split(',');
mkdirSync(outDir, { recursive: true });

// 鏡頭：[鏡頭位置, 注視點]；主角會被放在 HERO 位置（只為了拍照擺位，不是通關測試）
const HERO = { x: 2.2, z: 13.5, yaw: Math.PI * 0.8 };
const SHOTS = {
  village: [[16, 20, 30], [0, 0, 6]],
  hero: [[4.3, 2.2, 17.2], [2.2, 0.85, 13.5]],
  well: [[9.5, 4.2, 12], [5.5, 1, 7]],
  kitchen: [[-2.5, 5, 15], [-11, 1.5, 9.5]],
  lanterns: [[7, 6, -3], [0, 0.8, -9]],
};

const server = await preview({ preview: { port: 4196 }, logLevel: 'silent' });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?test');
await page.waitForFunction(() => window.__dokkaebi);
await page.locator('#btn-new').click();
await page.locator('#btn-skip').click();
await page.waitForFunction(() => window.__dokkaebi.state().mode === 'playing');
await page.evaluate((h) => window.__dokkaebi.teleport(h.x, h.z), HERO);
await page.waitForTimeout(800);

for (const mode of modes) {
  const [render, density] = mode.split(':');
  await page.evaluate(
    ([r, d]) => {
      const api = window.__dokkaebi;
      api.unfreeze?.();
      if (api.setRender) api.setRender(r, d);
      else {
        // 舊版：只有 ASCII 開關與 0–2 的密度
        const s = JSON.parse(localStorage.getItem('ascii-dokkaebi.settings') ?? '{}');
        window.dispatchEvent(new CustomEvent('noop', { detail: s }));
        if (api.setAscii) api.setAscii(r !== '3d');
      }
    },
    [render, density],
  );
  for (const [name, [pos, look]] of Object.entries(SHOTS)) {
    await page.evaluate(([p, l]) => window.__dokkaebi.photo(p, l), [pos, look]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${name}-${render}-${density}.png` });
  }
}
console.log(errors.length ? `JavaScript 錯誤：${errors.join(' | ')}` : `已拍攝 ${modes.length * Object.keys(SHOTS).length} 張，無錯誤`);
await browser.close();
await server.close();
