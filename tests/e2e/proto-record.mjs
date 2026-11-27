/**
 * 錄下 Gate 1 原型的關鍵片段（逐格推進、每格截圖、ffmpeg 合成 30 fps）。
 * 錄到的是實際原型程式；影片流暢度不代表實際幀率。
 *
 *   reveal：走到石碑 A、舉起燈籠 → 圖案浮現 → 放下 → 開靈視，看見記憶的橋
 *   fall：陣風中走上記憶的橋 → 火被吹小、熄滅 → 掉下去 → 回到橋頭
 *   gate：轉絞盤關上木閘門（煙從橫倒變成直直往上）→ 過橋 → 點亮石燈
 *
 * 用法：npm run build && node tests/e2e/proto-record.mjs docs/media [take,...] [hd|3d]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const outDir = process.argv[2] ?? 'docs/media';
const takes = (process.argv[3] ?? 'reveal,fall,gate').split(',');
const render = process.argv[4] ?? 'hd';
const NORTH = { x: 0.63, y: 0.78 }; // 畫面右上 ≈ 世界北方
const WEST = { x: -0.78, y: 0.63 };

const server = await preview({ preview: { port: 4185 }, logLevel: 'silent' });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

for (const take of takes) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  await page.goto(server.resolvedUrls.local[0] + `prototype.html?test&render=${render}&density=fine`);
  await page.waitForFunction(() => window.__proto);
  await page.evaluate(() => (document.getElementById('intro').hidden = true));
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__proto[f](...a), [f, a]);
  await api('freeze');
  const dir = `/tmp/proto-frames-${take}-${render}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const shoot = async (frames, move = null, before = null) => {
    for (let i = 0; i < frames; i++) {
      if (before) await before(i);
      await api('step', 1, 1 / 30, move);
      await page.screenshot({ path: join(dir, `${String(n++).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 88 });
    }
  };
  if (take === 'reveal') {
    await api('teleport', 4.2, 12.6, Math.PI);
    await api('step', 40, 1 / 30);
    await shoot(20);
    await api('setRaise', true);
    await shoot(75);
    await api('setRaise', false);
    await shoot(30);
    await api('teleport', 1.2, 6.2, Math.PI);
    await api('step', 30, 1 / 30);
    await shoot(15);
    await api('toggleSpirit');
    await shoot(60);
  } else if (take === 'fall') {
    await api('teleport', 0, 4.4, Math.PI);
    await api('setTime', 4.4);
    await api('toggleSpirit');
    await api('step', 20, 1 / 30);
    await shoot(150, NORTH);
  } else if (take === 'gate') {
    await api('teleport', 6.2, 5.8, Math.PI);
    await api('setTime', 4.6);
    await api('step', 20, 1 / 30);
    await shoot(10);
    await api('interact');
    await shoot(110);
    await api('teleport', 0, 4.4, Math.PI);
    await api('toggleSpirit');
    await api('step', 15, 1 / 30);
    await shoot(150, NORTH, async () => {
      const s = await api('state');
      if (s.player.z < -8) await api('step', 0);
    });
    await api('teleport', 0.2, -8.7, Math.PI);
    await api('step', 10, 1 / 30);
    await api('interact');
    await shoot(110);
  }
  void WEST;
  const out = join(outDir, `proto-${take}-${render}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(dir, '%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', out]);
  console.log('錄好了', out, `${n} 格`);
  await page.close();
}
await browser.close();
await server.close();
