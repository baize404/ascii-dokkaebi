/**
 * 動畫錄影：在真的遊戲裡逐格推進（每格固定 1/30 秒）、每格截圖，再用 ffmpeg 合成影片。
 * 錄的是實際的遊戲畫面與動畫系統（不是另外做的影片），但因為是逐格渲染，
 * 影片的流暢度不代表實際幀率（實際效能見 docs/TESTING.md）。
 *
 * 用法：node tests/e2e/record.mjs <輸出資料夾> [take 名稱,...] [hd|pure|hybrid|3d] [classic|fine|ultra|cinematic]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const outDir = resolve(process.argv[2] ?? 'docs/media');
const only = process.argv[3] ? process.argv[3].split(',') : null;
const render = process.argv[4] ?? 'hd';
const density = process.argv[5] ?? 'ultra';
mkdirSync(outDir, { recursive: true });

const SPOT = { x: 2.2, z: 14.5 };
const api = (page, fn, ...args) => page.evaluate(([f, a]) => window.__dokkaebi[f](...a), [fn, args]);

/** 每個 take：setup 之後跑 frames 格，每格可以指定移動與鏡頭 */
const TAKES = {
  // 走路 → 跑步 → 停下：側面跟拍
  'walk-run': {
    setup: async (p) => {
      await api(p, 'teleport', -3, 17);
      await api(p, 'setYaw', Math.PI / 2);
    },
    frames: 150,
    move: (i) => (i < 20 ? null : i < 75 ? { x: 0.42, z: 0 } : i < 125 ? { x: 1, z: 0 } : null),
    camera: [0.6, 1.5, 4.2],
    look: 0.85,
  },
  // 撿拾：彎腰屈膝、手伸到地面、握住、起身
  pickup: {
    setup: async (p) => {
      await api(p, 'teleport', SPOT.x, SPOT.z);
      await api(p, 'setYaw', 0);
    },
    frames: 55,
    at: { 5: (p) => api(p, 'act', 'Pickup') },
    camera: [2.0, 1.2, 2.2],
    look: 0.7,
  },
  // 各種操作：調查、伸手抓取、轉鑰匙、開門、獻上、歡呼、受驚
  actions: {
    setup: async (p) => {
      await api(p, 'teleport', SPOT.x, SPOT.z);
      await api(p, 'setYaw', 0.3);
    },
    frames: 300,
    at: { 4: (p) => api(p, 'act', 'Inspect'), 56: (p) => api(p, 'act', 'Grab'), 76: (p) => api(p, 'act', 'UseKey'), 120: (p) => api(p, 'act', 'OpenDoor'), 170: (p) => api(p, 'act', 'OfferItem'), 228: (p) => api(p, 'act', 'Cheer'), 278: (p) => api(p, 'act', 'Startled') },
    camera: [2.2, 1.4, 2.6],
    look: 0.9,
  },
  // 燈籠慣性：跑一段後急停、原地轉身
  lantern: {
    setup: async (p) => {
      await api(p, 'teleport', 0, 18);
      await api(p, 'setYaw', 0);
    },
    frames: 120,
    move: (i) => (i < 30 ? { x: 0, z: -1 } : i < 50 ? null : i < 62 ? { x: 1, z: 0 } : i < 75 ? null : i < 88 ? { x: -1, z: 0.2 } : null),
    camera: [1.8, 1.3, 2.4],
    look: 0.8,
  },
  // 黑貓：舔毛、伸懶腰、跳
  cat: {
    setup: async (p) => {
      await api(p, 'teleport', -15.8, 13.2);
    },
    frames: 210,
    at: { 2: (p) => api(p, 'npcAct', 'cat', 'Stretch'), 72: (p) => api(p, 'npcAct', 'cat', 'Lick'), 150: (p) => api(p, 'npcAct', 'cat', 'Jump') },
    npcCamera: { npc: 'cat', offset: [0.9, 0.55, 1.1], look: 0.25 },
  },
  // 廚房的門：伸手握住門環、拉開（鉸鏈旋轉、室內的光透出來），再關上
  door: {
    setup: async (p) => {
      await api(p, 'teleport', -6.2, 9.5);
      await api(p, 'setYaw', -Math.PI / 2);
    },
    frames: 170,
    at: { 6: (p) => api(p, 'demo', 'door') },
    camera: [1.6, 1.5, 3.0],
    look: 1.0,
  },
  // 水井：手握曲柄轉三圈，滾輪轉動、繩子收短、水桶離開水面（滴水）升上來
  well: {
    setup: async (p) => {
      await api(p, 'teleport', 5.5, 9.2);
      await api(p, 'setYaw', Math.PI);
    },
    frames: 125,
    at: { 4: (p) => api(p, 'demo', 'crank') },
    fixed: { pos: [2.6, 2.5, 9.9], look: [5.4, 1.2, 7.7] },
  },
  // 點石燈：伸手把燈籠送進火室、火焰慢慢形成、火星飄散、石燈內部發亮
  light: {
    setup: async (p) => {
      await api(p, 'teleport', -2.1, -4);
      await api(p, 'setYaw', -Math.PI / 2);
    },
    frames: 130,
    at: { 4: (p) => api(p, 'demo', 'light', 0) },
    fixed: { pos: [-0.9, 2.2, -1.6], look: [-2.9, 1.15, -4.1] },
  },
  // 村落環境：風吹草、樹與布條擺動、落葉、廚房煙囪的炊煙、螢火蟲（固定鏡頭）
  village: {
    setup: async (p) => {
      await api(p, 'teleport', -4.5, 13.5);
      await api(p, 'setYaw', 2.4);
    },
    frames: 180,
    fixed: { pos: [-1.5, 4.2, 17.5], look: [-9, 1.2, 8] },
  },
  // 池塘：水波、漣漪；月亮回歸時倒影出現、村子的窗戶亮起
  moon: {
    setup: async (p) => {
      await api(p, 'teleport', 5.5, 17.2);
      await api(p, 'setYaw', 1.6);
    },
    frames: 210,
    at: { 10: (p) => api(p, 'demo', 'moon') },
    fixed: { pos: [9.5, 2.2, 25.5], look: [6.5, 2.6, 11] },
  },
  // 도깨비：鬼火聚集後現身、大笑、揮棒歡呼
  dokkaebi: {
    setup: async (p) => {
      await api(p, 'teleport', 0, -13.2);
      await api(p, 'setYaw', Math.PI);
    },
    frames: 170,
    at: { 4: (p) => api(p, 'demo', 'dokkaebi') },
    npcCamera: { npc: 'dokkaebi', offset: [2.6, 1.4, 3.6], look: 1.1, fixed: true },
  },
  // 할머니：打盹 → 揉眼睛 → 起身走下마루 → 揮手
  grandma: {
    setup: async (p) => {
      await api(p, 'teleport', -6.4, 0.4);
      await api(p, 'setYaw', -Math.PI / 2);
    },
    frames: 200,
    at: { 30: (p) => api(p, 'npcAct', 'grandma', 'wake') },
    npcCamera: { npc: 'grandma', offset: [2.4, 1.3, 1.6], look: 0.9, fixed: true },
  },
};

const server = await preview({ preview: { port: 4197 }, logLevel: 'silent' });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('ascii-dokkaebi.settings', JSON.stringify({ density: 'ultra', sampling: 'auto', quality: 'high' })));
await page.goto(server.resolvedUrls.local[0] + '?test');
await page.waitForFunction(() => window.__dokkaebi);
await page.locator('#btn-new').click();
await page.locator('#btn-skip').click();
await page.waitForFunction(() => window.__dokkaebi.state().mode === 'playing');
await page.evaluate(() => document.querySelectorAll('#hud, #minimap, .hud').forEach((e) => (e.style.visibility = 'hidden')));
await api(page, 'setRender', render === 'hd' ? 'hd' : render, density, 'auto');

for (const [name, take] of Object.entries(TAKES)) {
  if (only && !only.includes(name)) continue;
  const dir = join('/tmp/frames', `${name}-${render}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await api(page, 'unfreeze');
  await take.setup(page);
  await api(page, 'photo', [0, 30, 0], [0, 0, 0]); // 凍結時間，之後逐格推進
  await api(page, 'step', 20, 1 / 30); // 讓姿勢穩定
  let anchor = null;
  for (let i = 0; i < take.frames; i++) {
    await take.at?.[i]?.(page);
    const move = take.move?.(i) ?? null;
    await api(page, 'step', 1, 1 / 30, move, true);
    if (take.fixed) await api(page, 'photo', take.fixed.pos, take.fixed.look);
    else if (take.npcCamera) {
      const c = take.npcCamera;
      const p = c.fixed && anchor ? anchor : await api(page, 'npcPosition', c.npc);
      anchor ??= p;
      await api(page, 'photo', [p.x + c.offset[0], p.y + c.offset[1], p.z + c.offset[2]], [p.x, p.y + c.look, p.z]);
    } else await api(page, 'followShot', take.camera, take.look);
    await page.screenshot({ path: join(dir, `${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 88 });
  }
  await api(page, 'releaseShot');
  const out = join(outDir, `${name}-${render}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(dir, '%04d.jpg'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', out]);
  console.log(`${name}：${take.frames} 格 → ${out}`);
}
console.log(errors.length ? `JavaScript 錯誤：${errors.join(' | ')}` : '錄影完成，無 JavaScript 錯誤');
await browser.close();
await server.close();
