/**
 * 錄下 4.0 垂直切片的實際遊戲畫面（逐格推進、每格截圖、ffmpeg 合成 30 fps）。
 * 錄到的是實際程式在無頭 Chrome（SwiftShader）裡的畫面；影片流暢度不代表實機幀率。
 *
 *   intro：標題 → 電影式開場 → 交還控制
 *   stele：走到石碑 → 按 E 進入調查視角 → 舉燈、移動燈光 → 刻紋浮現 → 離開、鏡頭恢復
 *   winch：第一次轉絞盤：手 → 繩子與擋板 → 峽谷與煙（鏡頭跟著機構進度）
 *   bridge：開靈視（光波、橋板成形）→ 過橋輔助鏡頭 → 走到對岸
 *   fall：陣風吹弱燈火（橋閃爍）→ 熄滅 → 崩散 → 掉落 → 恢復
 *   ending：點亮石燈 → 結局演出
 *
 * 用法：npm run build && node tests/e2e/proto-record.mjs docs/media [take,...] [畫質]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const outDir = process.argv[2] ?? 'docs/media';
const takes = (process.argv[3] ?? 'intro,stele,winch,bridge,fall,ending').split(',');
const quality = process.argv[4] ?? 'high';
const server = await preview({ preview: { port: 4185 }, build: { outDir: process.env.OUT_DIR ?? 'dist' }, logLevel: 'silent' });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

for (const take of takes) {
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0] + `prototype.html?test&quality=${quality}${take === 'intro' ? '&intro' : ''}`);
  await page.waitForFunction(() => window.__proto, null, { timeout: 60000 });
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__proto[f](...a), [f, a]);
  await api('freeze');
  const dir = `/tmp/proto4-frames-${take}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const snap = () => page.screenshot({ path: join(dir, `${String(n++).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 86 });
  /** 錄 frames 格；move 可以是固定輸入或每格呼叫的函式 */
  const shoot = async (frames, move = null) => {
    for (let i = 0; i < frames; i++) {
      await page.evaluate(
        ([m, i]) => {
          const P = window.__proto;
          let mv = m;
          if (m && m.to) {
            const s = P.state();
            const dx = m.to[0] - s.player.x;
            const dz = m.to[1] - s.player.z;
            const d = Math.hypot(dx, dz);
            const b = s.camera.basisYaw;
            const k = Math.min(m.speed ?? 1, d / 0.8 + 0.2);
            mv = d < 0.15 ? null : { x: ((dx * Math.cos(b) - dz * Math.sin(b)) / d) * k, y: ((-dx * Math.sin(b) - dz * Math.cos(b)) / d) * k };
          } else if (m && m.sweep) {
            // 調查：來回掃過石碑（每 54 格換一行）
            const row = Math.floor(i / 54);
            mv = { x: row % 2 ? -1 : 1, y: i % 54 > 46 ? -1 : 0 };
          }
          P.step(1, 1 / 30, mv);
        },
        [move, i],
      );
      await snap();
    }
  };
  if (take === 'intro') {
    await shoot(30);
    await api('startIntro');
    await shoot(300);
    await shoot(60, { to: [1.5, 12.5], speed: 0.6 });
  } else if (take === 'stele') {
    await api('setView', 'third');
    await api('teleport', 2.4, 14.2, Math.PI);
    await api('step', 20, 1 / 30);
    await shoot(50, { to: [4.2, 11.6] });
    await api('interact', 'stele-eye');
    await shoot(30);
    await api('setRaise', true);
    await shoot(20);
    await shoot(250, { sweep: true });
    await api('setRaise', false);
    await shoot(30);
    await api('interact');
    await shoot(45);
  } else if (take === 'winch') {
    await api('setView', 'third');
    await api('teleport', 3.6, 7.2, Math.PI);
    await api('step', 20, 1 / 30);
    await shoot(40, { to: [5.15, 4.6] });
    await api('interact', 'winch');
    await shoot(150);
    await shoot(30);
  } else if (take === 'bridge') {
    // 先把擋板降下（不錄），再錄開靈視與過橋
    await api('teleport', 5.15, 4.5, Math.PI / 2);
    await api('interact', 'winch');
    for (let i = 0; i < 12; i++) await api('step', 20, 1 / 30);
    await api('setView', 'explore');
    await api('teleport', 0.2, 5.6, Math.PI);
    await api('setCamera', { yaw: 0.5 });
    await api('step', 30, 1 / 30);
    await shoot(15);
    await api('toggleSpirit');
    await shoot(45);
    await shoot(200, { to: [0, -5.6] });
    await shoot(20);
  } else if (take === 'fall') {
    await api('setView', 'third');
    await api('teleport', 0, 4.4, Math.PI);
    await api('setCamera', { yaw: 0 });
    await api('toggleSpirit');
    await api('step', 30, 1 / 30);
    await api('setTime', 2.6);
    await shoot(110, { to: [0, -0.5] });
    await shoot(120);
  } else if (take === 'ending') {
    await api('setView', 'third');
    await api('teleport', 0.8, -7.4, Math.PI);
    await api('step', 20, 1 / 30);
    await shoot(30, { to: [0, -9.1] });
    await api('interact', 'lamp');
    for (let i = 0; i < 360; i++) {
      await shoot(1);
      if ((await api('state')).mode === 'ended') break;
    }
    await shoot(30);
  }
  const out = join(outDir, `v4-${take}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(dir, '%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'veryfast', '-movflags', '+faststart', out]);
  console.log(`${take}：${n} 格 → ${out}（${((Date.now() - t0) / 1000).toFixed(0)} 秒）${errors.length ? ' 錯誤：' + errors.join(' | ') : ''}`);
  await page.close();
}
await browser.close();
await server.close();
