/**
 * 「斷橋與燈」4.0 端對端測試（工程測試：測試程式知道地圖與答案，會讀遊戲狀態來導航與驗證；不是黑箱玩家測試）。
 *
 *   keyboard：真實鍵盤即時遊玩：調查石碑（舉燈＋移動燈光顯影）→ 靈視 → 記憶木板 → 第二塊石碑 → 絞盤降下擋板 → 過橋 → 點燈 → 結局
 *   fall：陣風吹熄燈籠 → 橋崩散 → 掉落（原因：風）；主動關靈視 → 掉落（原因：自己）；成形中不能踩上去
 *   timing：不關閘門，看準風停的時機過橋
 *   camera：鏡頭專項（模式切換、快速連切、調查進出恢復、移動方向一致、遮擋、幀率、橫直式、互動中斷）
 *   pause：暫停／說明／日誌時世界與遊玩時間都停；失焦清除按住的輸入；開場不累積遊玩時間、可略過
 *   click：點地面尋路、點深谷給原因、點物件走過去並開始互動
 *   phone：手機直式：按鈕至少 44×44、互不遮擋；舉燈切換模式
 *
 * 用法：npm run build && node tests/e2e/proto.mjs [情境,...]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const names = (process.argv[2] ?? 'keyboard,fall,timing,camera,pause,click,phone').split(',');
const server = await preview({ preview: { port: 4187 }, logLevel: 'silent' });
const base = server.resolvedUrls.local[0] + 'prototype.html?test&fastEnding';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let passed = 0;
let failed = 0;
const results = [];
let scenario = '';
const check = (ok, label) => {
  ok ? passed++ : failed++;
  results.push({ scenario, ok: !!ok, label });
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
};

async function open({ ctx = { viewport: { width: 1280, height: 800 } }, query = '&quality=low' } = {}) {
  const page = await browser.newPage(ctx);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base + query);
  await page.waitForFunction(() => window.__proto, null, { timeout: 60000 });
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__proto[f](...a), [f, a]);
  return { page, errors, api, state: () => api('state') };
}

/** 用真實鍵盤走到某個點：依「移動基準」（鏡頭方位）換算 W/A/S/D */
async function keyWalk(page, state, x, z, { tol = 0.5, timeout = 45000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const s = await state();
    const dx = x - s.player.x;
    const dz = z - s.player.z;
    const d = Math.hypot(dx, dz);
    if (d < tol) return true;
    const b = s.camera.basisYaw;
    const fwd = { x: -Math.sin(b), z: -Math.cos(b) };
    const right = { x: Math.cos(b), z: -Math.sin(b) };
    const f = (dx * fwd.x + dz * fwd.z) / d;
    const r = (dx * right.x + dz * right.z) / d;
    const keys = [];
    if (f > 0.38) keys.push('w');
    if (f < -0.38) keys.push('s');
    if (r > 0.38) keys.push('d');
    if (r < -0.38) keys.push('a');
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(Math.min(400, 90 + d * 55));
    for (const k of keys) await page.keyboard.up(k);
  }
  return false;
}

/**
 * 逐格推進走到某點（輸入換算用移動基準）。每 20 格回到測試程式一次：
 * 讓遊戲裡的 Promise（動畫播完等）有機會完成，和真實的逐格執行一樣。
 */
async function stepWalk(api, x, z, { tol = 0.3, max = 2400, dt = 1 / 30 } = {}) {
  let frames = 0;
  while (frames < max) {
    const r = await api.page.evaluate(
      ([x, z, tol, n, dt]) => {
        const P = window.__proto;
        for (let i = 0; i < n; i++) {
          const s = P.state();
          const dx = x - s.player.x;
          const dz = z - s.player.z;
          const d = Math.hypot(dx, dz);
          if (d < tol) return { done: true, ok: true, i };
          if (s.mode !== 'playing') return { done: true, ok: false, i, mode: s.mode };
          const b = s.camera.basisYaw;
          const k = Math.min(1, d / 0.8 + 0.25);
          P.step(1, dt, { x: ((dx * Math.cos(b) - dz * Math.sin(b)) / d) * k, y: ((-dx * Math.sin(b) - dz * Math.cos(b)) / d) * k });
        }
        return { done: false, i: n };
      },
      [x, z, tol, 20, dt],
    );
    frames += r.i;
    if (r.done) return { ok: r.ok, frames, mode: r.mode };
  }
  return { ok: false, frames };
}
async function stepUntil(api, cond, { max = 600, dt = 1 / 30, move = null } = {}) {
  let frames = 0;
  while (frames <= max) {
    const r = await api.page.evaluate(
      ([src, n, dt, move]) => {
        const P = window.__proto;
        const f = new Function('s', `return (${src})(s)`);
        for (let i = 0; i < n; i++) {
          if (f(P.state())) return { ok: true, i };
          P.step(1, dt, move);
        }
        return { ok: false, i: n };
      },
      [cond.toString(), 20, dt, move],
    );
    frames += r.i;
    if (r.ok) return { ok: true, frames };
  }
  return { ok: false, frames };
}

/** 調查中用真實鍵盤掃過石碑：按住 F，一行一行來回移動燈光（看遊戲裡燈光的實際位置決定放開的時機） */
async function sweepStele(page, state) {
  const hold = async (key, until, ms = 9000) => {
    await page.keyboard.down(key);
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const s = await state();
      if (!s.inspect || until(s.inspect) || s.steles.find((x) => x.id === s.inspect.id)?.seen) break;
      await page.waitForTimeout(60);
    }
    await page.keyboard.up(key);
  };
  await page.keyboard.down('f');
  await hold('w', (i) => i.v <= 0.15);
  for (const [r, v] of [0.15, 0.35, 0.55, 0.75, 0.9].entries()) {
    if (r > 0) await hold('s', (i) => i.v >= v);
    await hold(r % 2 ? 'a' : 'd', (i) => (r % 2 ? i.u <= 0.12 : i.u >= 0.88));
    const s = await state();
    if (!s.inspect || s.steles.find((x) => x.id === s.inspect.id)?.seen) break;
  }
  await page.keyboard.up('f');
}

const scenarios = {
  async keyboard() {
    const { page, errors, state } = await open();
    await page.keyboard.press('KeyV'); // 第三人稱（遊玩時預設探索視角）
    check(await keyWalk(page, state, 4.2, 11.6), '走到石碑「眼」前');
    let s = await state();
    check(s.prompt.includes('調查'), `靠近時出現互動提示：「${s.prompt}」`);
    check(s.camera.shot === null, '只是經過石碑，鏡頭不會被強制拉近');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__proto.state().mode === 'inspect' && !window.__proto.state().camera.blending, null, { timeout: 20000 }).catch(() => {});
    s = await state();
    check(s.mode === 'inspect' && s.camera.shot === 'inspect', '按 E 才進入調查視角（角色先走到石碑左前方、轉身）');
    await sweepStele(page, state);
    await page.waitForTimeout(400);
    s = await state();
    check(s.steles[0].seen && s.journal.includes('stele-eye'), `舉燈移動光照過刻紋：圖案浮現並記入日誌（覆蓋 ${Math.round(s.steles[0].coverage * 100)}%）`);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__proto.state().mode === 'playing' && !window.__proto.state().camera.blending, null, { timeout: 20000 }).catch(() => {});
    s = await state();
    check(s.mode === 'playing' && s.camera.shot === null && s.camera.userMode === 'third', '離開調查：回到原本的第三人稱鏡頭');
    await page.keyboard.press('KeyQ');
    await page.waitForFunction(() => window.__proto.state().memory.state === 'stable', null, { timeout: 8000 }).catch(() => {});
    s = await state();
    check(s.lantern.spirit && s.memory.state === 'stable', `Q 開啟靈視，記憶完全成形（${s.memory.state}）`);
    check(await keyWalk(page, state, -3.9, 11.5), '走到溝邊');
    check(await keyWalk(page, state, -7.25, 11.5, { tol: 0.45 }), '靈視中走過記憶木板到小平台');
    s = await state();
    check(s.progress.plankCrossedAt !== null, '記錄走過記憶木板的時間');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__proto.state().mode === 'inspect' && !window.__proto.state().camera.blending, null, { timeout: 20000 }).catch(() => {});
    await sweepStele(page, state);
    await page.waitForTimeout(400);
    s = await state();
    check(s.journal.includes('stele-wind'), '第二塊石碑「風」顯影並記入日誌');
    await page.keyboard.press('Escape'); // 調查中 Esc = 離開調查
    await page.waitForFunction(() => window.__proto.state().mode === 'playing' && !window.__proto.state().camera.blending, null, { timeout: 20000 }).catch(() => {});
    s = await state();
    check(s.mode === 'playing' && !s.paused, 'Esc 離開調查（不是開暫停選單）');
    check(await keyWalk(page, state, -3.9, 11.5), '走回庭院');
    check(await keyWalk(page, state, 5.15, 4.6, { tol: 0.4 }), '走到絞盤');
    await page.keyboard.press('KeyE');
    let handErr = Infinity;
    let shot = null;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(150);
      s = await state();
      if (s.interaction.state === 'commit') {
        handErr = Math.min(handErr, s.handError ?? Infinity);
        shot = shot ?? s.camera.shot;
      }
      if (s.gate.open01 <= 0 && s.interaction.state === 'idle') break;
    }
    check(s.gate.state === 'closed' && s.shutterClosed, `轉動絞盤：擋板全部降下（${s.gate.state}）`);
    check(handErr < 0.12, `轉的時候左手握在把手上（誤差 ${handErr.toFixed(3)} 公尺）`);
    check(shot === 'action', '操作絞盤時有動作演出鏡頭');
    check(s.camera.shot === null && s.camera.userMode === 'third', '演出結束後鏡頭控制權還給玩家');
    check(await keyWalk(page, state, 0, 4.4), '走到橋頭');
    if (!(await state()).lantern.spirit) await page.keyboard.press('KeyQ');
    await page.waitForTimeout(900);
    check(await keyWalk(page, state, 0, -5.2, { tol: 0.6, timeout: 70000 }), '靈視中走過記憶的橋（擋板降下，燈沒有熄）');
    s = await state();
    check(s.progress.crossedWith === 'gate' && s.progress.falls === 0, `過橋方式：${s.progress.crossedWith}`);
    check(await keyWalk(page, state, 0, -9.1, { tol: 0.45 }), '走到石燈前');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__proto.state().mode === 'ended', null, { timeout: 30000 }).catch(() => {});
    s = await state();
    check(s.lampLit && s.mode === 'ended', '點亮石燈 → 結局演出 → 結局畫面');
    const end = await page.evaluate(() => ({ story: document.querySelector('#end .story')?.textContent ?? '', detailsOpen: document.querySelector('#end details')?.open, rows: document.querySelectorAll('#end-stats tr').length }));
    check(end.story.length > 20 && end.detailsOpen === false && end.rows >= 6, '結局有劇情文字；遊玩紀錄收在可展開區');
    check(errors.length === 0, `沒有 JavaScript 錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await page.close();
  },

  async fall() {
    const a = await open();
    const { api, errors } = a;
    a.page.api = api;
    await api('freeze');
    await api('setCamera', { yaw: 0 });
    await api('teleport', 0, 3.0, Math.PI);
    await api('step', 5, 1 / 30);
    await api('toggleSpirit');
    // 成形中（revealing）不能踩上去：碰撞跟著狀態
    await api('step', 3, 1 / 60);
    let s = await api('state');
    check(s.memory.state === 'revealing' && !s.memory.solid, '靈視剛開：橋板還在成形，不能走');
    await api('step', 12, 1 / 30, { x: 0, y: 1 });
    s = await api('state');
    check(s.player.z > 2.5, `成形前往前走會停在斷口（z = ${s.player.z.toFixed(2)}，斷口在 2.1）`);
    await api('step', 30, 1 / 30);
    s = await api('state');
    check(s.memory.state === 'stable', '成形完成後才能走');
    // 在陣風中上橋
    await api('setTime', 3.3);
    const r = await stepWalk({ page: a.page }, 0, -1, { max: 400 });
    s = await api('state');
    const got = await stepUntil({ page: a.page }, (st) => st.mode === 'falling' || st.mode === 'playing' && st.progress.falls > 0, { max: 300 });
    s = await api('state');
    check(!r.ok || got.ok, '陣風中走在記憶的橋上');
    check(s.progress.fallReasons.wind === 1, '燈被風吹熄 → 掉落原因記為「風」');
    check(s.progress.log.some((l) => l.event === 'memory-dissolving'), '掉落前橋先崩散（dissolving），畫面和碰撞一致');
    await stepUntil({ page: a.page }, (st) => st.mode === 'playing', { max: 200 });
    s = await api('state');
    check(Math.hypot(s.player.x - 0, s.player.z - 4.6) < 0.3 && !s.lantern.lit, '回到南橋頭；燈籠是熄的');
    check(s.caption.includes('風') && s.caption.includes('火盆'), `回饋說明原因與下一步：「${s.caption}」`);
    check(s.camera.shot === null && !s.camera.inputLocked, '恢復後立刻可以操作');
    // 主動關靈視
    await api('teleport', -3.2, 5.8, Math.PI);
    await api('interact', 'brazier');
    await stepUntil({ page: a.page }, (st) => st.lantern.lit && st.interaction.state === 'idle', { max: 400 });
    s = await api('state');
    check(s.lantern.lit && s.progress.relights === 1, '到火盆重新點燈（走過去、點火、火焰從小長大）');
    await stepUntil({ page: a.page }, (st) => st.lantern.heat > 0.95, { max: 200 });
    await api('setTime', 0);
    await api('teleport', 0, 4.4, Math.PI);
    await api('toggleSpirit');
    await api('step', 30, 1 / 30);
    const w2 = await stepWalk({ page: a.page }, 0, 0.5);
    if (!w2.ok) console.log('    （除錯）走上橋失敗', JSON.stringify(w2), JSON.stringify((await api('state')).player), (await api('state')).memory.state);
    await api('toggleSpirit');
    await stepUntil({ page: a.page }, (st) => st.progress.falls === 2 && st.mode === 'playing', { max: 300 });
    s = await api('state');
    check(s.progress.fallReasons.manual === 1 && s.lantern.lit, '在橋上自己收起靈視 → 掉落原因「自己」，燈還亮著');
    check(s.caption.includes('收起了靈視'), `兩種原因的回饋不同：「${s.caption}」`);
    check(errors.length === 0, `沒有 JavaScript 錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await a.page.close();
  },

  async timing() {
    const a = await open();
    const { api, errors } = a;
    await api('freeze');
    await api('teleport', 0, 4.4, Math.PI);
    await api('toggleSpirit');
    await api('step', 30, 1 / 30);
    // 陣風剛結束（7 秒週期的第 0 秒）時出發
    await api('setTime', 7.05);
    const r = await stepWalk({ page: a.page }, 0, -5.2, { max: 900 });
    const s = await api('state');
    check(r.ok && s.progress.falls === 0, `看準風停的時機過橋（${r.frames} 格）`);
    check(s.progress.crossedWith === 'timing' && !s.shutterClosed, '過橋方式記為「看時機」，擋板沒降');
    check(errors.length === 0, '沒有 JavaScript 錯誤');
    await a.page.close();
  },

  async camera() {
    const a = await open();
    const { api, errors, page } = a;
    const P = { page };
    await api('freeze');
    await api('step', 10, 1 / 30);
    let s = await api('state');
    check(s.camera.userMode === 'explore' && s.camera.mode === 'explore', '預設探索視角');
    // 切換
    await page.keyboard.press('KeyV');
    await api('step', 30, 1 / 30);
    s = await api('state');
    check(s.camera.userMode === 'third' && Math.abs(s.camera.fov - 58) < 2, `V 切到第三人稱（FOV ${s.camera.fov.toFixed(0)}°）`);
    // 快速連切 7 次（每 3 格一次）：最後狀態正確、沒有 NaN、沒有瞬移
    const trace = await page.evaluate(() => {
      const P = window.__proto;
      const out = [];
      for (let i = 0; i < 7; i++) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV' }));
        for (let k = 0; k < 3; k++) {
          P.step(1, 1 / 60);
          out.push(P.state().camera.pos);
        }
      }
      for (let k = 0; k < 60; k++) P.step(1, 1 / 60);
      return { out, mode: P.state().camera.userMode };
    });
    let maxJump = 0;
    for (let i = 1; i < trace.out.length; i++) maxJump = Math.max(maxJump, Math.hypot(...trace.out[i].map((v, k) => v - trace.out[i - 1][k])));
    check(trace.out.every((p) => p.every(Number.isFinite)) && maxJump < 0.9, `快速連切 7 次：鏡頭連續（每格最大位移 ${maxJump.toFixed(2)} 公尺）`);
    check(trace.mode === 'explore', '連切奇數次後停在探索視角（狀態一致）');
    // 調查進出：恢復玩家自訂的方位、俯仰、縮放
    await page.keyboard.press('KeyV');
    await api('orbit', 140, -40);
    await page.evaluate(() => document.getElementById('game').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true })));
    await api('step', 20, 1 / 30);
    const before = (await api('state')).camera;
    await api('teleport', 4.2, 11.55, Math.PI);
    await api('interact', 'stele-eye');
    await stepUntil(P, (st) => st.camera.shot === 'inspect' && !st.camera.blending, { max: 120 });
    await api('orbit', 300, 100); // 調查中的拖曳只影響調查鏡頭
    await api('step', 10, 1 / 30);
    await api('interact');
    await stepUntil(P, (st) => st.mode === 'playing' && !st.camera.blending, { max: 120 });
    s = await api('state');
    check(Math.abs(s.camera.yaw - before.yaw) < 1e-6 && Math.abs(s.camera.pitch - before.pitch) < 1e-6 && s.camera.userMode === before.userMode, '調查結束後恢復原本的模式、方位與俯仰（不是重設成預設）');
    // 移動方向一致：按著前進時鏡頭突然轉 180°，角色不會突然往反方向走
    await api('teleport', 1.5, 13, Math.PI);
    await api('step', 10, 1 / 30, { x: 0, y: 1 });
    const dirs = await page.evaluate(() => {
      const P = window.__proto;
      const out = [];
      let prev = P.state().player;
      P.orbit(-Math.PI / 0.0062, 0); // 一格內把鏡頭轉半圈
      for (let i = 0; i < 20; i++) {
        P.step(1, 1 / 30, { x: 0, y: 1 });
        const cur = P.state().player;
        out.push([cur.x - prev.x, cur.z - prev.z]);
        prev = cur;
      }
      return out;
    });
    let minDot = 1;
    for (let i = 1; i < dirs.length; i++) {
      const [ax, az] = dirs[i - 1];
      const [bx, bz] = dirs[i];
      const la = Math.hypot(ax, az);
      const lb = Math.hypot(bx, bz);
      if (la > 1e-4 && lb > 1e-4) minDot = Math.min(minDot, (ax * bx + az * bz) / (la * lb));
    }
    check(minDot > 0.9, `鏡頭急轉時移動方向平順地跟上（相鄰兩格方向夾角餘弦最小 ${minDot.toFixed(3)}）`);
    // 遮擋：鏡頭被石碑擋住時拉近，離開後慢慢退回
    await api('setView', 'third');
    await api('setCamera', { yaw: 0, pitch: 0.3 });
    await api('teleport', 4.2, 9.2, Math.PI); // 石碑在玩家南邊（鏡頭後方）
    await api('step', 40, 1 / 30);
    s = await api('state');
    check(s.camera.occlusion !== null && s.camera.occDist < 4.2, `被石碑擋住時鏡頭拉近（距離 ${s.camera.occDist.toFixed(2)}）`);
    await api('teleport', 1.5, 13, Math.PI);
    await api('step', 120, 1 / 30);
    s = await api('state');
    check(s.camera.occlusion === null && s.camera.occDist > 4.4, `障礙物離開後退回（距離 ${s.camera.occDist.toFixed(2)}）`);
    // 幀率：同一段移動在 30 Hz 與 144 Hz 下的鏡頭結果接近
    const runAt = (hz) =>
      page.evaluate((hz) => {
        const P = window.__proto;
        P.teleport(1.5, 14, Math.PI);
        P.setView('explore');
        for (let i = 0; i < hz * 2; i++) P.step(1, 1 / hz, { x: 0.3, y: 1 });
        for (let i = 0; i < hz; i++) P.step(1, 1 / hz, null);
        return P.state().camera.pos;
      }, hz);
    const c30 = await runAt(30);
    const c144 = await runAt(144);
    const dd = Math.hypot(...c30.map((v, i) => v - c144[i]));
    check(dd < 0.35, `30 Hz 與 144 Hz 的鏡頭位置差 ${dd.toFixed(3)} 公尺`);
    // 互動中斷：絞盤轉到一半按方向鍵
    await api('teleport', 5.15, 4.5, Math.PI / 2);
    await api('interact', 'winch');
    await stepUntil(P, (st) => st.gate.open01 < 0.6, { max: 400 });
    await api('step', 2, 1 / 30, { x: -1, y: 0 });
    await api('step', 30, 1 / 30);
    s = await api('state');
    check(s.interaction.last?.result === 'cancel' && s.gate.open01 > 0.05 && s.gate.open01 < 0.7 && s.gate.state === 'partial', `絞盤轉到一半停手：擋板停在半途（${Math.round((1 - s.gate.open01) * 100)}%）`);
    check(s.camera.shot === null && !s.camera.inputLocked, '中斷後鏡頭與操作都恢復');
    // 掉落與恢復
    const modeBeforeFall = (await api('state')).camera.userMode;
    await api('teleport', 0, 4.4, Math.PI);
    await api('toggleSpirit');
    await api('step', 30, 1 / 30);
    await stepWalk(P, 0, 0.8);
    await api('toggleSpirit');
    await stepUntil(P, (st) => st.mode === 'falling', { max: 60 });
    s = await api('state');
    check(s.camera.shot === 'recovery', '掉落時使用恢復鏡頭（停在原地看角色掉下去）');
    await stepUntil(P, (st) => st.mode === 'playing', { max: 200 });
    s = await api('state');
    check(s.camera.shot === null && s.camera.userMode === modeBeforeFall, `重生後立即回到玩家原本的鏡頭模式（${modeBeforeFall}）`);
    // 橫直式切換：不重設模式與方位、直式視角加寬
    const yawBefore = s.camera.yaw;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await api('step', 30, 1 / 30);
    const tall = await api('state');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    await api('step', 30, 1 / 30);
    const wide = await api('state');
    check(tall.camera.fov > wide.camera.fov + 4 && Math.abs(tall.camera.yaw - yawBefore) < 0.05 && tall.camera.userMode === modeBeforeFall, `直式畫面加寬視角（${tall.camera.fov.toFixed(0)}° vs ${wide.camera.fov.toFixed(0)}°），不重設方位與模式`);
    check(errors.length === 0, `沒有 JavaScript 錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await page.close();
  },

  async pause() {
    const a = await open();
    const { api, page, errors } = a;
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    let s0 = await api('state');
    await page.waitForTimeout(1500);
    let s1 = await api('state');
    check(s0.paused && s0.overlay === 'pause' && s1.clock.play === s0.clock.play && s1.clock.world === s0.clock.world, '暫停時遊玩時間與世界（風）都停住');
    await page.locator('#btn-help').click();
    s1 = await api('state');
    check(s1.paused && s1.overlay === 'help', '暫停選單裡的操作說明也是暫停狀態');
    await page.locator('#btn-help-back').click();
    await page.locator('#btn-resume').click();
    await page.waitForTimeout(800);
    s1 = await api('state');
    check(!s1.paused && s1.clock.play > s0.clock.play, '繼續之後時間恢復');
    await page.keyboard.press('KeyJ');
    s1 = await api('state');
    check(s1.paused && s1.overlay === 'journal' && (await page.locator('#journal-list li').count()) >= 1, 'J 開線索日誌（暫停）');
    await page.keyboard.press('KeyJ');
    // 失焦：按住 W 時切走，角色不會一直走
    await page.keyboard.down('w');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const p0 = (await api('state')).player;
    await page.waitForTimeout(900);
    const p1 = (await api('state')).player;
    await page.keyboard.up('w');
    check(Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.6, `失焦時清除按住的鍵（之後只滑行 ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)} 公尺）`);
    await page.close();
    // 開場：標題 → 電影式開場（不算遊玩時間）→ 略過
    const b = await open({ query: '&quality=low&intro' });
    let s = await b.api('state');
    check(s.mode === 'title' && (await b.page.locator('#title').isVisible()), '正式入口先顯示標題畫面');
    await b.page.locator('#btn-start').click();
    await b.page.waitForTimeout(1500);
    s = await b.api('state');
    check(s.mode === 'intro' && s.camera.shot === 'cinematic' && s.clock.play === 0, '開場演出中不累積遊玩時間');
    await b.page.locator('#btn-skip').click();
    await b.page.waitForTimeout(1200);
    s = await b.api('state');
    check(s.mode === 'playing' && s.camera.shot === null && s.objective.includes('石燈'), '可以略過開場，略過後立刻可以操作並顯示目標');
    check(errors.length + b.errors.length === 0, `沒有 JavaScript 錯誤${b.errors.length ? '：' + b.errors.join(' | ') : ''}`);
    await b.page.close();
  },

  async click() {
    const a = await open();
    const { api, page, errors } = a;
    await page.waitForTimeout(800);
    const tapWorld = async (x, y, z) => {
      const pt = await api('project', x, y, z);
      await page.mouse.click(pt.x, pt.y);
      return pt;
    };
    await tapWorld(3, 0, 11.5);
    await page.waitForTimeout(3500);
    let s = await api('state');
    check(Math.hypot(s.player.x - 3, s.player.z - 11.5) < 1.2, `點地面：走到點的位置（${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}）`);
    await tapWorld(4.2, 1.4, 10.55);
    await page.waitForFunction(() => window.__proto.state().mode === 'inspect', null, { timeout: 15000 }).catch(() => {});
    s = await api('state');
    check(s.mode === 'inspect' && s.inspect?.id === 'stele-eye', '點石碑：走到石碑前並開始調查');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
    await api('teleport', 1, 6, Math.PI);
    await page.waitForTimeout(500);
    await tapWorld(-2.5, 0, 0);
    await page.waitForTimeout(400);
    s = await api('state');
    check(s.caption.includes('深谷'), `點深谷：說明走不過去的原因（「${s.caption}」）`);
    check(errors.length === 0, `沒有 JavaScript 錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await page.close();
  },

  async phone() {
    const a = await open({ ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
    const { api, page, errors } = a;
    await page.waitForTimeout(800);
    const boxes = await page.evaluate(() =>
      ['btn-raise', 'btn-spirit', 'btn-view', 'btn-center', 'btn-journal', 'btn-pause', 'joystick'].map((id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { id, x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 };
      }),
    );
    check(boxes.every((b) => b.visible && b.w >= 44 && b.h >= 44), `所有按鈕至少 44×44（${boxes.map((b) => `${b.id} ${Math.round(b.w)}×${Math.round(b.h)}`).join('、')}）`);
    let overlap = null;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i];
        const q = boxes[j];
        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) overlap = `${p.id}/${q.id}`;
      }
    check(!overlap, `按鈕互不遮擋${overlap ? `（${overlap}）` : ''}`);
    await page.locator('#btn-spirit').tap();
    await page.waitForTimeout(300);
    let s = await api('state');
    check(s.lantern.spirit, '點「靈視」按鈕有效');
    await page.locator('#btn-spirit').tap();
    // 舉燈切換模式：點一下舉起，再點一下放下（可以同時用另一指調鏡頭）
    await page.evaluate(() => {
      const el = document.querySelector('[data-setting="raiseMode"]');
      el.value = 'toggle';
      el.dispatchEvent(new Event('input'));
    });
    await page.locator('#btn-raise').tap();
    await page.waitForTimeout(800);
    s = await api('state');
    check(s.lantern.raised, '切換模式：點一下就保持舉著');
    await page.locator('#btn-raise').tap();
    await page.waitForTimeout(800);
    s = await api('state');
    check(!s.lantern.raised, '再點一下放下');
    await page.screenshot({ path: '/tmp/proto-phone.png' });
    check(errors.length === 0, `沒有 JavaScript 錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await page.close();
  },
};

for (const n of names) {
  scenario = n;
  console.log(`[${n}]`);
  try {
    await scenarios[n]();
  } catch (e) {
    check(false, `情境中斷：${e.message.split('\n')[0]}`);
  }
}
// 只重跑部分情境時，保留其他情境上一次的結果
const file = 'tests/e2e/proto-results.json';
let all = results;
if (existsSync(file)) {
  const prev = JSON.parse(readFileSync(file, 'utf8'));
  all = [...(prev.results ?? []).filter((r) => !names.includes(r.scenario)), ...results];
}
writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), environment: 'Linux 容器、Chrome 無頭模式、SwiftShader（CPU 模擬 WebGL）', passed: all.filter((r) => r.ok).length, failed: all.filter((r) => !r.ok).length, results: all }, null, 2));
console.log(`\n${passed} 項通過，${failed} 項失敗`);
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
