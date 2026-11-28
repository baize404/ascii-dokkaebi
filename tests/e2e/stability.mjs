/**
 * 畫面穩定度測試（抖動回歸測試）
 *
 * 1. 鏡頭：逐格（1/60 秒）推進，角色直走 → 轉彎 → 停下，記錄角色在畫面上的位置。
 *    平順時二階差分（每格位置的變化量的變化）應該接近 0；鏡頭不應該上下來回震動。
 * 2. 角色：在固定 60 Hz、不規則幀間隔、144 Hz、偶爾掉格（1/20 秒）四種情況下，
 *    量測頭、手腕、辮子、댕기、衣帶、燈籠等部位的加速度。各種幀率下應該差不多，
 *    而且不能有突然的大尖峰（姿勢跳動）。
 *
 * 用法：npm run build && node tests/e2e/stability.mjs
 */
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4196 }, logLevel: 'silent' });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(server.resolvedUrls.local[0] + '?test');
await page.waitForFunction(() => window.__dokkaebi);
await page.locator('#btn-new').click();
await page.locator('#btn-skip').click();
await page.waitForFunction(() => window.__dokkaebi.state().mode === 'playing');
await page.evaluate(() => window.__dokkaebi.freeze());

let failed = 0;
const check = (ok, label) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
};

console.log('[鏡頭] 角色在畫面上的平順度（純 3D）');
for (const view of ['explore', 'close']) {
  const r = await page.evaluate((view) => {
    const api = window.__dokkaebi;
    api.setSetting('cameraView', view);
    api.teleport(0, 21);
    api.step(120, 1 / 60, null, true);
    const rows = [];
    for (let i = 0; i < 300; i++) {
      const move = i < 150 ? { x: 0, z: -1 } : i < 240 ? { x: 1, z: -0.3 } : null;
      api.step(1, 1 / 60, move, true);
      const c = api.cameraInfo();
      rows.push({ s: api.projectToScreen(c.player[0], c.player[1] + 0.7, c.player[2]), y: c.pos[1] });
    }
    const jerk = rows.slice(2).map((r, k) => Math.hypot(r.s.x - 2 * rows[k + 1].s.x + rows[k].s.x, r.s.y - 2 * rows[k + 1].s.y + rows[k].s.y));
    const dy = rows.slice(1).map((r, k) => r.y - rows[k].y);
    const flips = dy.slice(1).filter((v, k) => Math.sign(v) !== Math.sign(dy[k]) && Math.abs(v) > 1e-4).length;
    return { avg: jerk.reduce((a, b) => a + b, 0) / jerk.length, big: jerk.filter((j) => j > 4).length, flips };
  }, view);
  const name = view === 'close' ? '近景' : '遠景';
  console.log(`  ${name}：抖動平均 ${r.avg.toFixed(2)} px、超過 4 px 的格數 ${r.big}、鏡頭上下反轉 ${r.flips} 次`);
  check(r.avg < (view === 'close' ? 0.6 : 0.3), `${name}角色畫面位置平順（平均抖動 < ${view === 'close' ? 0.6 : 0.3} px）`);
  check(r.big <= 3, `${name}突然跳動 ≤ 3 格（撞到障礙物時的減速除外）`);
  check(r.flips <= 2, `${name}鏡頭沒有上下震動`);
}

console.log('[角色] 各部位加速度：平均／最大（m/s²）');
const parts = ['Head', 'Wrist.R', 'Braid3', 'Ribbon', 'Goreum2', 'lantern'];
const results = {};
for (const pattern of ['fixed60', 'irregular', 'fixed144', 'drops']) {
  results[pattern] = await page.evaluate(
    ({ pattern, parts }) => {
      const api = window.__dokkaebi;
      api.teleport(0, 21);
      api.step(60, 1 / 60, null, true);
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const samples = [];
      let t = 0;
      while (t < 5) {
        let dt = 1 / 60;
        if (pattern === 'irregular') dt = (1 / 60) * (0.6 + rnd() * 0.8);
        if (pattern === 'fixed144') dt = 1 / 144;
        if (pattern === 'drops') dt = rnd() < 0.08 ? 1 / 20 : 1 / 60;
        const move = t < 2 ? { x: 0, z: -1 } : t < 3 ? null : t < 4 ? { x: 0.5, z: -0.2 } : null;
        api.step(1, dt, move, true);
        t += dt;
        samples.push({ dt, p: api.rigProbe() });
      }
      const out = {};
      for (const key of parts) {
        let sum = 0;
        let max = 0;
        let n = 0;
        for (let i = 2; i < samples.length; i++) {
          const [a, b, c] = [samples[i - 2], samples[i - 1], samples[i]];
          const v1 = a.p[key].map((x, k) => (b.p[key][k] - x) / b.dt);
          const v2 = b.p[key].map((x, k) => (c.p[key][k] - x) / c.dt);
          const acc = Math.hypot(...v2.map((v, k) => (v - v1[k]) / ((b.dt + c.dt) / 2)));
          sum += acc;
          max = Math.max(max, acc);
          n++;
        }
        out[key] = [sum / n, max];
      }
      return out;
    },
    { pattern, parts },
  );
}
const label = { fixed60: '60 Hz', irregular: '不規則', fixed144: '144 Hz', drops: '偶爾掉格' };
for (const key of parts) console.log(`  ${key.padEnd(8)} ${Object.entries(results).map(([p, v]) => `${label[p]} ${v[key][0].toFixed(1)}／${v[key][1].toFixed(0)}`).join('　')}`);
for (const key of ['Braid3', 'Ribbon', 'Goreum2']) {
  const base = results.fixed60[key][0];
  const worst = Math.max(results.irregular[key][0], results.fixed144[key][0], results.drops[key][0]);
  check(worst / base < 1.4, `${key} 在各種幀率下的晃動一致（最差／60 Hz = ${(worst / base).toFixed(2)} < 1.4）`);
}
for (const key of ['Head', 'Wrist.R', 'lantern']) check(results.fixed60[key][1] < 150, `${key} 沒有姿勢跳動（60 Hz 最大 ${results.fixed60[key][1].toFixed(0)} < 150）`);

await browser.close();
await server.close();
console.log(failed ? `\n${failed} 項未通過` : '\n全部通過');
process.exit(failed ? 1 : 0);
