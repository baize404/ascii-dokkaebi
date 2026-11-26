/**
 * 端對端測試：在真的瀏覽器裡，用桌面與手機兩種尺寸把遊戲從頭玩到破關。
 *
 *   npm run build && npm run test:e2e
 *
 * 需要本機的 Chrome；路徑不同時可以設定 CHROME_PATH。
 * 截圖存在 tests/e2e/screenshots/。
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'screenshots');
mkdirSync(shots, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

let failures = 0;
function check(cond, message) {
  if (cond) {
    console.log(`  ✓ ${message}`);
  } else {
    failures++;
    console.log(`  ✗ ${message}`);
  }
}

const state = (page) => page.evaluate(() => window.__dokkaebi.state());

/** 把對話一路點完；遇到選項時依序選 picks 裡的文字。 */
async function finishDialogue(page, picks = []) {
  for (let guard = 0; guard < 80; guard++) {
    await page.waitForTimeout(120);
    const s = await state(page);
    if (!s.dialogueOpen && !s.busy) return;
    const buttons = page.locator('#dialogue-choices button');
    if ((await buttons.count()) > 0) {
      const want = picks.shift();
      if (!want) throw new Error('出現選項，但測試沒有準備要選什麼');
      await buttons.filter({ hasText: want }).first().click();
    } else if (s.dialogueOpen) {
      await page.locator('#dialogue-text').click();
    }
  }
  throw new Error('對話沒有結束');
}

/** 傳送到互動點旁邊，按互動（桌面按 E，手機點按鈕）。 */
async function interact(page, id, picks = [], touch = false) {
  const spot = (await page.evaluate(() => window.__dokkaebi.interactables())).find((i) => i.id === id);
  await page.evaluate(([x, z]) => window.__dokkaebi.teleport(x, z), [spot.x, spot.z]);
  await page.waitForTimeout(150);
  const s = await state(page);
  if (s.nearest !== id) throw new Error(`站在 ${id} 旁邊，但最近的互動點是 ${s.nearest}`);
  if (touch) await page.locator('#prompt').tap();
  else await page.keyboard.press('e');
  await finishDialogue(page, picks);
}

async function run({ name, ...context }, browser, url) {
  console.log(`\n[${name}]`);
  const page = await browser.newPage(context);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const touch = Boolean(context.hasTouch);

  await page.goto(`${url}?test`);
  await page.waitForTimeout(1200);
  check(await page.locator('#screen-title').isVisible(), '標題畫面顯示');
  check((await page.locator('#ascii-title').textContent()).length > 50, 'ASCII 標題字有畫出來');
  await page.screenshot({ path: join(shots, `${name}-1-title.png`) });

  await page.locator('#btn-start').click();
  await page.waitForTimeout(800);
  let s = await state(page);
  check(s.state === 'playing', '按開始後進入遊戲');
  check(s.marker && Math.abs(s.marker.z - 19) < 0.1, '開場有引導光點指向장승');

  // 移動：鍵盤
  if (!touch) {
    const before = s.player;
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.keyboard.up('w');
    s = await state(page);
    check(Math.hypot(s.player.x - before.x, s.player.z - before.z) > 1, '按 W 可以移動');
  }

  // 移動：點地面
  {
    await page.evaluate(() => window.__dokkaebi.teleport(0, 12));
    await page.waitForTimeout(2000); // 等鏡頭跟上
    const target = await page.evaluate(() => window.__dokkaebi.projectToScreen(-1, 0, 9));
    if (touch) await page.touchscreen.tap(target.x, target.y);
    else await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(1500);
    s = await state(page);
    check(Math.hypot(s.player.x + 1, s.player.z - 9) < 0.6, `點擊地面會走過去（到達 ${s.player.x.toFixed(2)}, ${s.player.z.toFixed(2)}）`);
  }

  await page.screenshot({ path: join(shots, `${name}-2-village.png`) });

  // 還沒準備好就去祭壇
  await interact(page, 'altar', [], touch);
  s = await state(page);
  check(!s.flags.offered, '條件不足時祭壇不會觸發');

  await interact(page, 'stele', [], touch);
  s = await state(page);
  check(s.flags.readStele, '讀完장승的提示');

  await interact(page, 'kitchen', [], touch);
  check((await state(page)).inventory.includes('muk'), '在廚房拿到메밀묵');

  await interact(page, 'storehouse', [], touch);
  check(!(await state(page)).flags.storehouseOpen, '沒有鑰匙打不開倉庫');

  await interact(page, 'well', [], touch);
  check((await state(page)).inventory.includes('key'), '從井裡拉出鑰匙');

  await interact(page, 'storehouse', [], touch);
  s = await state(page);
  check(s.flags.storehouseOpen && s.inventory.includes('makgeolli') && !s.inventory.includes('key'), '用鑰匙打開倉庫拿到막걸리');

  // 石燈：先點錯，再照順序點
  const light = (season) => interact(page, `lantern-${season}`, ['用燈籠點亮它'], touch);
  await light('spring');
  await light('autumn');
  s = await state(page);
  check(s.lanternsLit.length === 0 && s.worldLanternsLit.length === 0, '點錯順序時石燈全部熄滅');
  check(s.stats.mistakes === 1, '失誤次數有記錄');

  await interact(page, 'lantern-winter', ['先不要'], touch);
  check((await state(page)).lanternsLit.length === 0, '選「先不要」不會點燈');

  for (const season of ['spring', 'summer', 'autumn', 'winter']) await light(season);
  s = await state(page);
  check(s.lanternsLit.length === 4 && s.worldLanternsLit.length === 4, '依序點亮四座石燈');
  check(s.marker && Math.abs(s.marker.z + 15.6) < 0.1, '條件備妥後引導光點移到祭壇');
  await page.screenshot({ path: join(shots, `${name}-3-lanterns.png`) });

  // 祭壇 → 도깨비 → 猜謎（第一題先答錯一次）
  const spot = (await page.evaluate(() => window.__dokkaebi.interactables())).find((i) => i.id === 'altar');
  await page.evaluate(([x, z]) => window.__dokkaebi.teleport(x, z), [spot.x, spot.z]);
  await page.waitForTimeout(150);
  if (touch) await page.locator('#prompt').tap();
  else await page.keyboard.press('e');
  // 點過供品與登場的對話，直到出現第一題
  for (let i = 0; i < 60 && (await page.locator('#dialogue-choices button').count()) === 0; i++) {
    await page.waitForTimeout(200);
    if ((await state(page)).dialogueOpen) await page.locator('#dialogue-text').click();
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shots, `${name}-4-dokkaebi.png`) });
  await finishDialogue(page, ['燈籠', '月亮', '水', '風']);

  await page.waitForSelector('#screen-end:not([hidden])', { timeout: 15000 });
  s = await state(page);
  check(s.flags.moonReturned && s.state === 'ending', '答對三題，月亮回來、進入結局');
  check(s.stats.mistakes === 2, `結算失誤次數正確（${s.stats.mistakes}）`);
  const stats = await page.locator('#end-stats').textContent();
  check(stats.includes('互動次數') && stats.includes('失誤次數'), '結局畫面顯示統計');
  await page.screenshot({ path: join(shots, `${name}-5-ending.png`) });

  // 看一下月亮（關掉結局畫面截圖）
  await page.evaluate(() => (document.getElementById('screen-end').hidden = true));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, `${name}-6-moon.png`) });
  await page.evaluate(() => (document.getElementById('screen-end').hidden = false));

  await page.locator('#btn-restart').click();
  await page.waitForTimeout(500);
  s = await state(page);
  check(s.state === 'playing' && s.inventory.length === 0 && !s.flags.readStele, '再玩一次會重置進度');

  // ASCII 開關
  await page.locator('#btn-ascii').click();
  check(!(await state(page)).ascii, 'ASCII 按鈕可以切換到原始畫面');
  await page.screenshot({ path: join(shots, `${name}-7-raw3d.png`) });

  check(errors.length === 0, `沒有 JavaScript 錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
  await page.close();
}

const server = await preview({ preview: { port: 4173, strictPort: false }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});

try {
  for (const vp of VIEWPORTS) await run(vp, browser, url);
} catch (err) {
  failures++;
  console.error('\n測試中斷：', err);
} finally {
  await browser.close();
  await server.close();
}

console.log(failures ? `\n${failures} 項失敗` : '\n全部通過');
process.exit(failures ? 1 : 0);
