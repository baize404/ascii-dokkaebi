/**
 * 端對端測試：在真的瀏覽器裡把遊戲玩完。
 *
 *   npm run build && npm run test:e2e
 *
 * 情境：
 *  1. desktop-real：不使用傳送，用鍵盤與點擊地面（A* 尋路）實際走完主線到結局
 *  2. desktop-full：真結局、答錯與提示、存檔／重新整理／繼續、設定、ASCII 切換、重新開始
 *  3. phone-portrait：搖桿、點擊移動、互動按鈕、介面不互相遮擋
 *  4. phone-landscape：版面、對話、面板
 *  5. boot-failure：主程式載入失敗時的說明
 * 需要本機的 Chrome；路徑不同時可以設定 CHROME_PATH。截圖存在 tests/e2e/screenshots/。
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'screenshots');
mkdirSync(shots, { recursive: true });
const only = process.argv[2];

let failures = 0;
const results = [];
function check(cond, message) {
  results.push({ ok: Boolean(cond), message });
  if (cond) console.log(`  ✓ ${message}`);
  else {
    failures++;
    console.log(`  ✗ ${message}`);
  }
}

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PORTRAIT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const LANDSCAPE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// ---------- 共用工具 ----------

const api = (page, fn, arg) => page.evaluate(([f, a]) => window.__dokkaebi[f](...(a ?? [])), [fn, arg]);
const state = (page) => api(page, 'state');

async function openPage(browser, url, context, name) {
  const page = await browser.newPage(context);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  page.shot = (label) => page.screenshot({ path: join(shots, `${name}-${label}.png`) });
  // 測試機是 CPU 模擬的 WebGL：沒有設定時用低畫質跑邏輯測試（畫質切換另外測）。E2E_QUALITY 可以覆寫
  await page.addInitScript((q) => {
    if (!localStorage.getItem('ascii-dokkaebi.settings')) localStorage.setItem('ascii-dokkaebi.settings', JSON.stringify({ quality: q }));
  }, process.env.E2E_QUALITY ?? 'low');
  await page.goto(`${url}?test`);
  await page.waitForTimeout(1200);
  return page;
}

async function startNewGame(page, { touch = false, skipOpening = true } = {}) {
  if (touch) await page.locator('#btn-new').tap();
  else await page.locator('#btn-new').click();
  await page.waitForTimeout(400);
  if (await page.locator('#panel').isVisible()) await page.locator('.pause-menu button').first().click();
  await page.waitForTimeout(600);
  if (!skipOpening) return;
  await page.locator('#btn-skip').click();
  for (let i = 0; i < 40 && (await state(page)).mode !== 'playing'; i++) await page.waitForTimeout(250);
}

/** 對話：一路點完；遇到選項時依 picks 依序選（字串比對或函式回傳索引） */
async function finishDialogue(page, picks = []) {
  // 4.0 純 3D 在 SwiftShader（CPU 模擬）上每格比 ASCII 版慢很多；祭壇一整段（三題＋兩輪甕遊戲＋結局）可能要好幾分鐘
  const deadline = Date.now() + 480000;
  const trail = [];
  while (Date.now() < deadline) {
    await page.waitForTimeout(110);
    const s = await state(page);
    trail.push(`${((deadline - Date.now()) / 1000).toFixed(0)}s ${s.dialogueOpen ? 'D' : '-'}${s.busy ? 'B' : '-'} ${(await page.locator('#dialogue-text').textContent()).slice(0, 14)}`);
    if (!s.dialogueOpen && !s.busy) return;
    const buttons = page.locator('#dialogue-choices button:not([disabled])');
    if ((await buttons.count()) > 0) {
      await page.waitForTimeout(380); // 選項有防誤觸鎖定
      let want = picks.shift();
      if (typeof want === 'function') want = await want();
      if (want === undefined) throw new Error(`出現選項但沒有準備答案：${await page.locator('#dialogue-text').textContent()}`);
      const all = page.locator('#dialogue-choices button');
      if (typeof want === 'number') await all.nth(want).click();
      else await all.filter({ hasText: want }).first().click();
    } else if (s.dialogueOpen) {
      // 點對話框以外的空白處推進（點到虛線詞彙會改成顯示註解）
      await page.locator('#dialogue').click({ position: { x: 8, y: 8 } });
    }
  }
  const s = await state(page);
  await page.shot('stuck');
  console.log('    對話紀錄（最後 25 筆）：\n      ' + trail.slice(-25).join('\n      '));
  throw new Error(`對話沒有結束：mode=${s.mode} busy=${s.busy} dialogue=${s.dialogueOpen} 文字=「${await page.locator('#dialogue-text').textContent()}」 選項=${await page.locator('#dialogue-choices button').count()} 錯誤=${page.errors.join(' | ')}`);
}

/** 傳送到互動點並互動（只用在「完整驗證」情境） */
async function teleportInteract(page, id, picks = [], touch = false) {
  const spot = (await api(page, 'interactables')).find((i) => i.id === id);
  if (!spot) throw new Error(`找不到互動點 ${id}`);
  await api(page, 'teleport', [spot.x, spot.z]);
  await page.waitForTimeout(400);
  const s = await state(page);
  if (s.nearest !== id) throw new Error(`站在 ${id} 旁邊，但最近的是 ${s.nearest}`);
  if (touch) await page.locator('#prompt').tap();
  else await page.keyboard.press('e');
  await finishDialogue(page, picks);
}

/**
 * 不傳送：用點擊地面讓角色自己尋路走到互動點，到了按 E。
 * 目標在畫面外時，沿著「角色→目標」的方向點最遠、而且會點到地面的位置。
 */
async function walkAndInteract(page, id, picks = []) {
  for (let step = 0; step < 30; step++) {
    const s = await state(page);
    if (s.nearest === id) {
      await page.keyboard.press('e');
      await finishDialogue(page, picks);
      return;
    }
    const target = (await api(page, 'interactables')).find((i) => i.id === id);
    const p = s.player;
    const vw = page.viewportSize();
    let clicked = false;
    for (let t = 1; t >= 0.15 && !clicked; t -= 0.08) {
      const x = p.x + (target.x - p.x) * t;
      const z = p.z + (target.z - p.z) * t;
      const sp = await api(page, 'projectToScreen', [x, undefined, z]);
      if (sp.x < vw.width * 0.06 || sp.x > vw.width * 0.94 || sp.y < vw.height * 0.12 || sp.y > vw.height * 0.88) continue;
      const pick = await api(page, 'pickAt', [sp.x, sp.y]);
      if (pick.kind === 'ground' || (pick.kind === 'object' && pick.id === id)) {
        await page.mouse.click(sp.x, sp.y);
        clicked = true;
      }
    }
    if (!clicked) {
      // 實在點不到：用方向鍵朝目標走一小段
      await page.keyboard.down('w');
      await page.waitForTimeout(400);
      await page.keyboard.up('w');
    }
    // 等角色走完這段路
    for (let w = 0; w < 40; w++) {
      await page.waitForTimeout(250);
      const now = await state(page);
      if (now.nearest === id || now.path.length === 0) break;
    }
  }
  throw new Error(`走不到 ${id}`);
}

const riddleAnswer = (page) => () => api(page, 'riddleAnswer');
const shellAnswer = (page) => () => api(page, 'shellAnswer');
const lanternOrder = ['plum', 'orchid', 'chrysanthemum', 'bamboo'];
async function spotsInOrder(page) {
  const layout = (await state(page)).layout;
  return lanternOrder.map((c) => layout.indexOf(c));
}

/** 兩個元素的畫面範圍是否重疊 */
async function overlaps(page, a, b) {
  const ra = await page.locator(a).boundingBox();
  const rb = await page.locator(b).boundingBox();
  if (!ra || !rb) return false;
  return !(ra.x + ra.width <= rb.x || rb.x + rb.width <= ra.x || ra.y + ra.height <= rb.y || rb.y + rb.height <= ra.y);
}

// ---------- 情境 ----------

async function desktopReal(browser, url) {
  console.log('\n[desktop-real] 不使用傳送，真實鍵盤＋點擊尋路通關');
  const page = await openPage(browser, url, DESKTOP, 'desktop-real');
  await startNewGame(page);
  check((await state(page)).mode === 'playing', '從標題畫面進入遊戲（略過開場）');
  const before = (await state(page)).player;
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  const after = (await state(page)).player;
  check(Math.hypot(after.x - before.x, after.z - before.z) > 1.5, '真實鍵盤輸入可以移動');

  await walkAndInteract(page, 'stele');
  check((await state(page)).flags.readStele, '走到장승並調查（第二章開始）');
  await walkAndInteract(page, 'kitchen');
  await walkAndInteract(page, 'jars', ['最大的甕']);
  check((await state(page)).inventory.includes('muk'), '照字條在장독대最大的甕找到메밀묵');
  await walkAndInteract(page, 'well', ['轉動轆轤', '轉動轆轤', '轉動轆轤']);
  check((await state(page)).inventory.includes('key'), '轉三次轆轤拿到鑰匙');
  await walkAndInteract(page, 'storehouse');
  check((await state(page)).inventory.includes('makgeolli'), '用葫蘆瓶裝到막걸리（角色繞過房子與樹走到倉庫）');
  await page.shot('village');
  await walkAndInteract(page, 'screen');
  for (const spot of await spotsInOrder(page)) await walkAndInteract(page, `lantern-${spot}`, ['用燈籠點亮它']);
  let s = await state(page);
  check(s.flags.ropeOpen && s.ropeOpen, '依屏風季節點亮四盞石燈，금줄斷開');
  await page.shot('lanterns');
  await walkAndInteract(page, 'altar', [riddleAnswer(page), riddleAnswer(page), riddleAnswer(page), shellAnswer(page)]);
  await page.waitForSelector('#screen-end:not([hidden])', { timeout: 60000 });
  s = await state(page);
  check(s.flags.finished && s.flags.ending === 'normal', '走上山丘、答題、甕遊戲，抵達一般結局');
  check(s.landmarks.length >= 8, `實際走過大部分地點（發現 ${s.landmarks.length} 個地標）`);
  await page.shot('ending');
  check(page.errors.length === 0, `沒有 JavaScript 錯誤${page.errors.length ? '：' + page.errors.join(' | ') : ''}`);
  await page.close();
}

async function desktopFull(browser, url) {
  console.log('\n[desktop-full] 真結局、答錯與提示、存讀檔、設定、重新開始');
  const page = await openPage(browser, url, DESKTOP, 'desktop-full');
  await page.shot('title');
  await startNewGame(page, { skipOpening: false });
  await page.waitForTimeout(1500);
  await page.shot('opening');
  await page.locator('#btn-skip').click();
  for (let i = 0; i < 30 && (await state(page)).mode !== 'playing'; i++) await page.waitForTimeout(200);
  check(await page.locator('#tip').isVisible(), '新手教學提示出現');

  // 點擊地面：繞過障礙物
  await api(page, 'teleport', [-3, 14]);
  await page.waitForTimeout(1500);
  const target = await api(page, 'projectToScreen', [-3, undefined, 4]);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(300);
  check((await state(page)).path.length >= 1, '點擊地面會算出尋路路徑');
  await page.waitForTimeout(3000);
  const pos = (await state(page)).player;
  check(Math.hypot(pos.x + 3, pos.z - 4) < 1.2, `沿路徑走到目的地（${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}）`);

  await teleportInteract(page, 'altar').catch(() => {});
  check(!(await state(page)).flags.offered, '還沒準備好時無法使用祭壇（금줄擋住）');
  await teleportInteract(page, 'stele');
  check((await state(page)).chapter === 2, '讀完장승進入第二章');
  check((await state(page)).objective.includes('供品'), 'HUD 只顯示目前目標');

  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  check(await page.locator('#panel').isVisible(), '按 J 打開任務日誌');
  await page.locator('#panel-tabs button', { hasText: '提示' }).click();
  await page.locator('#panel-body button.primary').click();
  await page.waitForTimeout(200);
  check((await page.locator('.hint-box').count()) === 1 && (await state(page)).stats.hintsUsed === 1, '分段提示：第一段提示並記錄次數');
  await page.shot('journal');
  await page.keyboard.press('Escape');
  check(!(await page.locator('#panel').isVisible()), 'Esc 關閉面板');

  await teleportInteract(page, 'storehouse');
  check(!(await state(page)).flags.storehouseOpen, '沒有鑰匙打不開倉庫');
  await teleportInteract(page, 'kitchen');
  await teleportInteract(page, 'jars', ['小的甕']);
  check(!(await state(page)).inventory.includes('muk'), '選錯甕拿不到메밀묵');
  await teleportInteract(page, 'jars', ['最大的甕']);
  await teleportInteract(page, 'well', ['轉動轆轤', '算了']);
  check((await state(page)).flags.wellCranks === 1 && !(await state(page)).inventory.includes('key'), '轆轤轉一半可以先離開');
  await teleportInteract(page, 'well', ['轉動轆轤', '轉動轆轤']);
  await teleportInteract(page, 'storehouse');
  check((await state(page)).inventory.includes('makgeolli'), '打開倉庫拿到막걸리');

  // 黑貓隱藏事件與할머니
  for (let i = 0; i < 3; i++) await teleportInteract(page, 'cat');
  check((await state(page)).inventory.includes('tornHat'), '追黑貓三次拿到破掉的감투');
  await teleportInteract(page, 'grandma', ['輕輕叫醒她']);
  check((await state(page)).inventory.includes('needle'), '叫醒할머니拿到針線');
  await teleportInteract(page, 'screen');

  // 背包組合
  await page.keyboard.press('i');
  await page.waitForTimeout(300);
  await page.locator('.inv-slot[data-item="tornHat"]').click();
  await page.locator('.inv-actions button', { hasText: '組合' }).click();
  await page.locator('.inv-slot[data-item="needle"]').click();
  await page.waitForTimeout(300);
  check((await state(page)).inventory.includes('hat'), '背包組合：破帽子＋針線＝도깨비 감투');
  await page.shot('inventory');
  await page.keyboard.press('Escape');

  // 存檔 → 重新整理 → 繼續
  const layoutBefore = (await state(page)).layout;
  await api(page, 'save');
  await page.reload();
  await page.waitForTimeout(1500);
  check(await page.locator('#btn-continue').isVisible(), '重新整理後主選單出現「繼續旅程」');
  await page.locator('#btn-continue').click();
  for (let i = 0; i < 30 && (await state(page)).mode !== 'playing'; i++) await page.waitForTimeout(200);
  let s = await state(page);
  check(s.inventory.includes('hat') && s.inventory.includes('muk') && JSON.stringify(s.layout) === JSON.stringify(layoutBefore), '恢復道具、進度與這局的石燈配置');

  // 石燈：先點錯
  const order = await spotsInOrder(page);
  await teleportInteract(page, `lantern-${order[0]}`, ['用燈籠點亮它']);
  await teleportInteract(page, `lantern-${order[2]}`, ['用燈籠點亮它']);
  s = await state(page);
  check(s.litSpots.length === 1 && s.stats.lanternMistakes === 1, '點錯石燈：只有那一盞點不起來，已點亮的保留');
  for (const spot of order.slice(1)) await teleportInteract(page, `lantern-${spot}`, ['用燈籠點亮它']);
  check((await state(page)).ropeOpen, '四盞石燈點亮後금줄斷開');

  // 祭壇：第一題先答錯並看提示，甕遊戲先猜錯並看提示，最後還帽子
  const wrong = async () => ((await api(page, 'riddleAnswer')) + 1) % 3;
  const wrongShell = async () => ((await api(page, 'shellAnswer')) + 1) % 3;
  await teleportInteract(page, 'altar', [wrong, '看提示', riddleAnswer(page), riddleAnswer(page), riddleAnswer(page), wrongShell, '看提示', shellAnswer(page), '把감투還給他']);
  await page.waitForSelector('#screen-end:not([hidden])', { timeout: 60000 });
  s = await state(page);
  check(s.flags.ending === 'true', '把補好的감투還給도깨비 → 真結局');
  check(s.stats.riddleMistakes === 1 && s.stats.shellMistakes === 1, '答錯次數正確記錄');
  check(s.achievements.includes('friend') && s.achievements.includes('catFriend'), '解鎖「도깨비의 친구」「貓的朋友」成就');
  check((await page.locator('#end-stats').textContent()).includes('探索度'), '結局顯示探索度與統計');
  await page.shot('ending');

  // 設定：改畫面與無障礙，重新整理後保留
  await page.locator('#btn-to-title').click();
  await page.waitForTimeout(800);
  await page.locator('#btn-settings-title').click();
  await page.locator('#panel-tabs button', { hasText: '畫面' }).click();
  await page.locator('[data-setting="quality"] button', { hasText: '低' }).click();
  await page.locator('[data-setting="bloom"] button', { hasText: '關' }).click();
  await page.waitForTimeout(150);
  const settingsText = await page.locator('#panel-body').textContent();
  await page.locator('#panel-tabs button', { hasText: '介面與無障礙' }).click();
  await page.locator('[data-setting="reduceMotion"] button', { hasText: '開' }).click();
  await page.shot('settings');
  s = await state(page);
  check(s.quality === 'low' && s.render.quality === 'low' && s.render.bloom === false, '設定立即套用（畫質、光暈）');
  check(!/ASCII|字元密度|渲染模式/.test(settingsText), '設定面板不再出現 ASCII 選項');
  await page.reload();
  await page.waitForTimeout(1200);
  s = await state(page);
  check(s.quality === 'low' && s.render.bloom === false && (await page.evaluate(() => document.documentElement.dataset.reduceMotion)) === 'true', '設定在重新整理後保留');
  await page.locator('#btn-settings-title').click();
  await page.locator('#panel-tabs button', { hasText: '介面與無障礙' }).click();
  await page.locator('#panel-body button', { hasText: '恢復預設值' }).click();
  await page.keyboard.press('Escape');

  // 重新開始：狀態清乾淨
  await startNewGame(page);
  s = await state(page);
  check(s.chapter === 1 && s.inventory.length === 0 && s.clues.length === 0 && !s.flags.readStele, '重新開始後進度全部清除');
  const before = await state(page);
  await page.keyboard.press('t');
  await page.waitForTimeout(200);
  const after = await state(page);
  check(JSON.stringify(after.render) === JSON.stringify(before.render) && after.player.x === before.player.x, 'T 鍵不再切換任何渲染模式（4.0 只有純 3D）');
  // 畫質輪流切換：遊戲狀態不受影響，沒有錯誤
  for (const q of ['low', 'medium', 'high', 'ultra']) {
    await api(page, 'setRender', [q]);
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(shots, `quality-${q}.png`) });
  }
  const modes = await state(page);
  check(modes.render.quality === 'ultra' && modes.render.bloom === true && modes.player.x === before.player.x, '四種畫質切換不會重設玩家位置，超高畫質開啟光暈');
  const hasAscii = await page.evaluate(() => [...document.querySelectorAll('pre, [id*=ascii], .glyph-preview')].map((e) => e.id || e.className));
  check(hasAscii.length === 0, `頁面上沒有 ASCII 元素${hasAscii.length ? '：' + hasAscii.join(',') : ''}`);
  await api(page, 'setRender', ['auto']);
  check(page.errors.length === 0, `沒有 JavaScript 錯誤${page.errors.length ? '：' + page.errors.join(' | ') : ''}`);
  await page.close();
}

async function phonePortrait(browser, url) {
  console.log('\n[phone-portrait] 觸控、搖桿、互動按鈕、版面');
  const page = await openPage(browser, url, PORTRAIT, 'phone-portrait');
  await page.shot('title');
  await startNewGame(page, { touch: true });
  check(await page.locator('#joystick').isVisible(), '手機顯示虛擬搖桿');
  const box = await page.locator('#joystick').boundingBox();
  const before = (await state(page)).player;
  // 用搖桿往前推
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.evaluate(([x, y]) => {
    const el = document.getElementById('joystick');
    const fire = (type, cy2) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: cy2, bubbles: true, pointerType: 'touch' }));
    fire('pointerdown', y);
    fire('pointermove', y - 45);
    window.__joyEnd = () => fire('pointerup', y - 45);
  }, [cx, cy]);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__joyEnd());
  const after = (await state(page)).player;
  check(Math.hypot(after.x - before.x, after.z - before.z) > 1, '虛擬搖桿可以移動');
  check(after.x === after.x && (await state(page)).path.length === 0, '搖桿操作不會被當成點擊地面');

  // 點擊地面移動
  const t = await api(page, 'projectToScreen', [after.x - 2, undefined, after.z - 3]);
  await page.touchscreen.tap(t.x, t.y);
  await page.waitForTimeout(1800);
  const moved = (await state(page)).player;
  check(Math.hypot(moved.x - after.x, moved.z - after.z) > 1.5, '輕觸地面可以移動');

  await api(page, 'teleport', [0, 18.6]);
  await page.waitForTimeout(800);
  check(await page.locator('#prompt').isVisible(), '靠近時出現「互動」按鈕');
  const prompt = await page.locator('#prompt').boundingBox();
  check(prompt.width >= 44 && prompt.height >= 44, `互動按鈕至少 44×44（${Math.round(prompt.width)}×${Math.round(prompt.height)}）`);
  check(!(await overlaps(page, '#prompt', '#joystick')) && !(await overlaps(page, '#prompt', '#minimap')) && !(await overlaps(page, '#objective', '.hud-buttons')), '互動按鈕、搖桿、小地圖、目標與按鈕互不遮擋');
  for (const id of ['#btn-inventory', '#btn-map', '#btn-menu', '#btn-hint']) {
    const b = await page.locator(id).boundingBox();
    check(b.width >= 44 && b.height >= 44, `${id} 觸控範圍至少 44×44`);
  }
  await page.shot('hud');
  await page.locator('#prompt').tap();
  await page.waitForTimeout(1200);
  await page.shot('dialogue');
  await finishDialogue(page);
  check((await state(page)).flags.readStele, '用互動按鈕調查장승');
  await page.locator('#btn-map').tap();
  await page.waitForTimeout(500);
  check(await page.locator('.map-big').isVisible(), '打開探索地圖');
  await page.shot('map');
  await page.locator('#panel-close').tap();
  await teleportInteract(page, 'kitchen', [], true);
  await page.locator('#btn-inventory').tap();
  await page.waitForTimeout(400);
  check((await page.locator('.inv-slot').count()) === 1, '背包顯示道具圖示');
  await page.shot('inventory');
  await page.locator('#panel-close').tap();
  check(page.errors.length === 0, `沒有 JavaScript 錯誤${page.errors.length ? '：' + page.errors.join(' | ') : ''}`);
  await page.close();
}

async function phoneLandscape(browser, url) {
  console.log('\n[phone-landscape] 橫式版面');
  const page = await openPage(browser, url, LANDSCAPE, 'phone-landscape');
  await page.shot('title');
  check(await page.locator('#btn-new').isVisible(), '橫式標題畫面可以按「新的旅程」');
  await startNewGame(page, { touch: true });
  await api(page, 'teleport', [0, 18.6]);
  await page.waitForTimeout(800);
  check(!(await overlaps(page, '#prompt', '#joystick')) && !(await overlaps(page, '#objective', '.hud-buttons')), '橫式時 HUD 元件互不遮擋');
  await page.shot('hud');
  await page.locator('#prompt').tap();
  await page.waitForTimeout(1000);
  const dlg = await page.locator('.dialogue').boundingBox();
  check(dlg.height < 390 * 0.5, `橫式對話框不超過畫面一半高（${Math.round(dlg.height)}px）`);
  check(!(await overlaps(page, '.dialogue', '#joystick')), '橫式對話框不蓋住搖桿');
  await page.shot('dialogue');
  await finishDialogue(page);
  await page.locator('#btn-menu').tap();
  await page.waitForTimeout(300);
  check(await page.locator('.pause-menu').isVisible(), '暫停選單可以打開');
  await page.shot('pause');
  check(page.errors.length === 0, `沒有 JavaScript 錯誤${page.errors.length ? '：' + page.errors.join(' | ') : ''}`);
  await page.close();
}

async function inputs(browser, url) {
  console.log('\n[inputs] 輸入與回饋：失焦清除、雙指縮放、走不到的提示、互動狀態');
  const page = await openPage(browser, url, DESKTOP, 'inputs');
  await startNewGame(page);
  check((await state(page)).phase === 'Exploring', '開始時是 Exploring 狀態');

  // 按住 W 時視窗失去焦點：角色要停下來，不能自己一直走
  await page.keyboard.down('w');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const a = (await state(page)).player;
  await page.waitForTimeout(600);
  const b = (await state(page)).player;
  await page.keyboard.up('w');
  check(Math.hypot(a.x - b.x, a.z - b.z) < 0.05, '視窗失焦後按住的方向鍵被清除，角色停下');

  // 雙指縮放：模擬兩根手指的 pointer 事件，放開後不能被當成點擊地面
  const zoom0 = (await state(page)).zoom;
  await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const ev = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true }));
    ev('pointerdown', 11, 600, 400);
    ev('pointerdown', 12, 700, 400);
    ev('pointermove', 12, 760, 400);
    ev('pointermove', 12, 820, 400);
    ev('pointerup', 12, 820, 400);
    ev('pointerup', 11, 601, 401);
  });
  await page.waitForTimeout(300);
  const afterPinch = await state(page);
  check(afterPinch.zoom < zoom0, `雙指張開會拉近鏡頭（${zoom0.toFixed(2)} → ${afterPinch.zoom.toFixed(2)}）`);
  check(afterPinch.path.length === 0, '縮放結束時剩下的手指放開，不會被當成點擊地面');

  // 點祭壇（금줄還沒解開）：要說明原因，不能沒聲音地停下
  const altar = (await api(page, 'interactables')).find((i) => i.id === 'altar');
  await api(page, 'photo', [[0, 26, 4], [0, 0, -12]]);
  const sp = await api(page, 'projectToScreen', [altar.x, undefined, altar.z]);
  await page.mouse.click(sp.x, sp.y);
  await page.waitForTimeout(400);
  const toasts = (await state(page)).toasts;
  check(toasts.some((t) => t.includes('금줄')), `點被금줄擋住的祭壇會說明原因（${toasts.at(-1) ?? '沒有提示'}）`);
  await api(page, 'unfreeze');

  // 離物件有點遠時按 E：提示靠近
  await api(page, 'teleport', [0, 22]);
  await page.waitForTimeout(300);
  const before = (await state(page)).toasts.length;
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  const s2 = await state(page);
  check(s2.nearest !== null || s2.toasts.length > before, '按互動鍵但不在範圍內時有提示');

  // 對話中按 E／點地面不會觸發別的互動
  const stele = (await api(page, 'interactables')).find((i) => i.id === 'stele');
  await api(page, 'teleport', [stele.x, stele.z]);
  await page.waitForTimeout(300);
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  const inDlg = await state(page);
  check(inDlg.phase === 'Dialogue', `互動後進入 Dialogue 狀態（${inDlg.phase}）`);
  const interactions = inDlg.stats.interactions;
  await page.keyboard.press('e');
  await page.mouse.click(200, 600);
  await page.waitForTimeout(200);
  check((await state(page)).stats.interactions === interactions, '對話中重複按鍵、點地面不會重複觸發互動');
  await finishDialogue(page);
  check((await state(page)).phase === 'Exploring', '對話結束回到 Exploring');
  check(page.errors.length === 0, `沒有 JavaScript 錯誤${page.errors.length ? '：' + page.errors.join(' | ') : ''}`);
  await page.close();
}

async function bootFailure(browser, url) {
  console.log('\n[boot-failure] 載入失敗說明');
  const page = await browser.newPage(DESKTOP);
  await page.route('**/assets/*.js', (r) => r.abort());
  await page.goto(url);
  await page.waitForTimeout(1000);
  check(await page.locator('#boot-error').isVisible(), '主程式載入失敗時顯示中文說明');
  await page.close();
}

const server = await preview({ preview: { port: 4173, strictPort: false }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const scenarios = { inputs, desktopReal, desktopFull, phonePortrait, phoneLandscape, bootFailure };
try {
  for (const [name, fn] of Object.entries(scenarios)) {
    if (only && only !== name) continue;
    try {
      await fn(browser, url);
    } catch (err) {
      failures++;
      console.log(`  ✗ ${name} 中斷：${err.message}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
const passed = results.filter((r) => r.ok).length;
console.log(failures ? `\n${failures} 項失敗（通過 ${passed}）` : `\n全部通過（${passed} 項）`);
process.exit(failures ? 1 : 0);
