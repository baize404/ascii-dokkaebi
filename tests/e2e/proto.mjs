/**
 * Gate 1 原型「斷橋與燈」端對端測試。
 *
 *   keyboard：真實鍵盤（按住方向鍵走路、F 舉燈、Q 靈視、E 互動），即時執行，從開場到點亮石燈（關閘門解法）
 *   fall：在陣風中走上記憶的橋 → 燈被吹熄 → 掉下去 → 回到橋頭 → 到火盆重新點燈（逐格推進）
 *   timing：不關閘門，看準風停的時機過橋（逐格推進）
 *   phone：手機直式版面：按鈕至少 44×44、互不遮擋；點「靈視」按鈕有效
 *
 * 這是工程測試：測試程式知道地圖與答案，會讀遊戲狀態來導航與驗證；不是黑箱玩家測試。
 * 用法：npm run build && node tests/e2e/proto.mjs [情境,...]
 */
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const names = (process.argv[2] ?? 'keyboard,fall,timing,phone').split(',');
const server = await preview({ preview: { port: 4187 }, logLevel: 'silent' });
const base = server.resolvedUrls.local[0] + 'prototype.html?test';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let passed = 0;
let failed = 0;
const check = (ok, label) => {
  ok ? passed++ : failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
};

async function open(ctx = { viewport: { width: 1280, height: 800 } }) {
  const page = await browser.newPage(ctx);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base);
  await page.waitForFunction(() => window.__proto, null, { timeout: 30000 });
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__proto[f](...a), [f, a]);
  return { page, errors, api, state: () => api('state') };
}

// 鏡頭方位固定：畫面「上」= 西北
const F = { x: -11, z: -13.5 };
const fl = Math.hypot(F.x, F.z);
const fwd = { x: F.x / fl, z: F.z / fl };
const right = { x: -fwd.z, z: fwd.x };

/** 用真實鍵盤走到某個點：每次按住 W/A/S/D 一小段時間，朝目標修正方向 */
async function keyWalk(page, state, x, z, { tol = 0.6, timeout = 40000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const s = await state();
    const dx = x - s.player.x;
    const dz = z - s.player.z;
    const d = Math.hypot(dx, dz);
    if (d < tol) return true;
    const f = (dx * fwd.x + dz * fwd.z) / d;
    const r = (dx * right.x + dz * right.z) / d;
    const keys = [];
    if (f > 0.38) keys.push('w');
    if (f < -0.38) keys.push('s');
    if (r > 0.38) keys.push('d');
    if (r < -0.38) keys.push('a');
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(Math.min(450, 120 + d * 60));
    for (const k of keys) await page.keyboard.up(k);
  }
  return false;
}

async function keyboard() {
  console.log('[keyboard] 真實鍵盤，從開場到點亮石燈');
  const { page, errors, api, state } = await open();
  await page.locator('#btn-start').click();
  check(await keyWalk(page, state, 4.2, 12.2), '走到石碑 A');
  await page.keyboard.down('f');
  await page.waitForTimeout(2500);
  await page.keyboard.up('f');
  let s = await state();
  check(s.progress.revealed.includes('stele-eye'), '舉燈後石碑 A 的圖案顯現');
  await page.keyboard.press('e');
  await page.waitForTimeout(1500);
  check((await state()).caption.includes('眼睛'), '調查石碑時有文字描述（3D、ASCII、看不清楚的玩家都能理解）');
  await page.keyboard.press('q');
  await page.waitForTimeout(400);
  check((await state()).lantern.spirit, 'Q 開啟靈視');
  check(await keyWalk(page, state, -3.8, 11.5), '走到溝邊');
  check(await keyWalk(page, state, -7.3, 11.5, { tol: 0.7 }), '靈視中走過記憶木板到小平台');
  await page.keyboard.down('f');
  await page.waitForTimeout(2500);
  await page.keyboard.up('f');
  check((await state()).progress.revealed.includes('stele-wind'), '石碑 B 顯現（風與閘門）');
  check(await keyWalk(page, state, -3.8, 11.5), '走回庭院');
  await page.keyboard.press('q');
  check(await keyWalk(page, state, 6.2, 5.7), '走到絞盤');
  await page.keyboard.press('e');
  await page.waitForTimeout(4500);
  check((await state()).shutterClosed, '轉絞盤關上木閘門');
  check(await keyWalk(page, state, 0, 4.4), '走到橋頭');
  if (!(await state()).lantern.spirit) await page.keyboard.press('q');
  await page.waitForTimeout(300);
  check(await keyWalk(page, state, 0, -5.2, { tol: 0.7, timeout: 60000 }), '靈視中走過記憶的橋（閘門關著，燈沒有熄）');
  s = await state();
  check(s.progress.falls === 0 && s.progress.crossedWith === 'gate', '用「關閘門」解法過橋，沒有掉下去');
  check(await keyWalk(page, state, 0.2, -8.7), '走到石燈前');
  await page.keyboard.press('e');
  await page.waitForTimeout(4500);
  s = await state();
  check(s.lampLit && s.mode === 'ended', '點亮石燈，原型結束');
  check(await page.locator('#end').isVisible(), '結算畫面出現');
  check(errors.length === 0, `沒有 JS 錯誤${errors.length ? `：${errors[0]}` : ''}`);
  await page.screenshot({ path: 'tests/e2e/screenshots/proto-keyboard-end.png' });
  await page.close();
}

async function fall() {
  console.log('[fall] 陣風中過橋 → 掉下去 → 重新點燈');
  const { page, errors, api, state } = await open();
  await api('freeze');
  await api('teleport', 0, 4.4, Math.PI);
  await api('setTime', 5.0); // 預兆 → 陣風
  await api('toggleSpirit');
  // 往北走（畫面座標換算由遊戲處理：直接用世界方向推）
  const north = { x: -right.x * 0 + fwd.x * 0, y: 0 };
  void north;
  for (let i = 0; i < 240; i++) {
    await api('step', 1, 1 / 30, { x: 0.63, y: 0.78 }); // 畫面右上 ≈ 世界北方
    const s = await state();
    if (s.mode === 'falling' || s.progress.falls > 0) break;
  }
  let s = await state();
  check(s.progress.falls === 1, '陣風中燈被吹熄、在記憶的橋上掉下去');
  await api('step', 60, 1 / 30);
  s = await state();
  check(s.mode === 'playing' && Math.abs(s.player.z - 4.6) < 0.3, '回到橋頭，可以馬上再試');
  check(!s.lantern.lit && !s.lantern.spirit, '燈籠是熄的，靈視關閉');
  await api('teleport', -3.2, 6.2, Math.PI);
  await api('step', 5, 1 / 30);
  await api('interact');
  await api('step', 90, 1 / 30);
  s = await state();
  check(s.lantern.lit && s.progress.relights === 1, '在火盆重新點燈');
  check(errors.length === 0, '沒有 JS 錯誤');
  await page.close();
}

async function timing() {
  console.log('[timing] 不關閘門，看準風停的時機過橋');
  const { page, errors, api, state } = await open();
  await api('freeze');
  await api('teleport', 0, 4.4, Math.PI);
  await api('setTime', 7.0); // 剛好一輪陣風結束、平靜開始
  await api('toggleSpirit');
  for (let i = 0; i < 300; i++) {
    await api('step', 1, 1 / 30, { x: 0.63, y: 0.78 });
    const s = await state();
    if (s.player.z < -4.8 || s.progress.falls > 0) break;
  }
  const s = await state();
  check(s.progress.falls === 0 && s.progress.crossedWith === 'timing', '風停時出發，燈沒熄，過橋成功');
  check(!s.shutterClosed, '閘門一直開著（另一種解法）');
  check(errors.length === 0, '沒有 JS 錯誤');
  await page.close();
}

async function phone() {
  console.log('[phone] 手機直式版面');
  const { page, errors, state } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.locator('#btn-start').tap();
  const boxes = {};
  for (const id of ['joystick', 'btn-raise', 'btn-spirit', 'btn-view', 'btn-help', 'lamp-status']) boxes[id] = await page.locator(`#${id}`).boundingBox();
  for (const id of ['btn-raise', 'btn-spirit', 'btn-view', 'btn-help']) check(boxes[id].width >= 44 && boxes[id].height >= 44, `${id} 至少 44×44（${Math.round(boxes[id].width)}×${Math.round(boxes[id].height)}）`);
  const ov = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const ids = Object.keys(boxes);
  let overlap = null;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (ov(boxes[ids[i]], boxes[ids[j]])) overlap = `${ids[i]}／${ids[j]}`;
  check(!overlap, `按鈕與搖桿互不遮擋${overlap ? `（${overlap}）` : ''}`);
  await page.locator('#btn-spirit').tap();
  await page.waitForTimeout(400);
  check((await state()).lantern.spirit, '點「靈視」按鈕開啟靈視');
  await page.screenshot({ path: 'tests/e2e/screenshots/proto-phone.png' });
  check(errors.length === 0, '沒有 JS 錯誤');
  await page.close();
}

const scenarios = { keyboard, fall, timing, phone };
for (const n of names) await scenarios[n]();
await browser.close();
await server.close();
console.log(failed ? `\n${failed} 項失敗（通過 ${passed} 項）` : `\n全部通過（${passed} 項）`);
process.exit(failed ? 1 : 0);
