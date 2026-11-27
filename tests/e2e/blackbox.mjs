/**
 * 黑箱玩家測試（AI 模擬玩家，不是真人測試）
 *
 * 模擬第一次玩的大學生：從標題畫面開始，只根據「畫面上看得到的東西」做決定——
 * 目前目標、互動提示、對話與選項文字、地圖上的地點清單、任務日誌、畫面訊息；
 * 只用鍵盤、滑鼠或觸控操作。
 *
 * 不做的事：不傳送、不讀座標、不呼叫 riddleAnswer／shellAnswer／carvingAt／pickAt 等測試介面、不看攻略。
 * 謎題靠讀到的文字推理，猜不到就試、會答錯、會用提示；可以走錯路、點到走不到的地方。
 * 測試框架只在每一步「之後」讀遊戲狀態來記錄統計與最後驗證，不影響玩家的決定。
 *
 * 用法：node tests/e2e/blackbox.mjs [persona,...]
 *   keyboard：B 習慣鍵盤的電腦玩家（WASD、E、M、數字鍵）
 *   touch：C 只用手機觸控（直式；搖桿、點按鈕、點地圖地點）
 *   explorer：D 喜歡自由探索與解謎（滑鼠；先到處亂逛、不照順序，石燈直接用試的）
 *   newcomer：A／E 第一次玩、不熟快捷鍵與韓國文化（只點畫面按鈕、卡住就看提示）
 * 結果寫到 docs/playtest/<persona>.json。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../../docs/playtest');
const shotDir = join(here, 'screenshots');
mkdirSync(outDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });

const PERSONAS = {
  keyboard: { label: 'B：習慣鍵盤的電腦玩家', viewport: { width: 1280, height: 800 }, input: 'keyboard', explore: false, hints: 'late', seed: 11 },
  touch: { label: 'C：只用手機觸控的玩家（直式）', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, input: 'touch', explore: false, hints: 'late', seed: 23 },
  explorer: { label: 'D：喜歡自由探索與解謎的玩家', viewport: { width: 1280, height: 800 }, input: 'mouse', explore: true, hints: 'never', seed: 37 },
  newcomer: { label: 'A／E：第一次玩、不熟快捷鍵與韓國文化', viewport: { width: 1280, height: 800 }, input: 'mouse', explore: false, hints: 'early', seed: 51 },
};
const BUDGET_MS = 30 * 60 * 1000;
const DECLINE = ['算了', '先不要', '離開', '讓她睡吧', '把門關上'];
const SEASONS = ['春', '夏', '秋', '冬'];

const wait = (page, ms) => page.waitForTimeout(ms);
const VERBOSE = !!process.env.BB_VERBOSE;

/** 簡單的可重現亂數 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 讀畫面（只讀玩家看得到的 DOM） ----------

async function ui(page) {
  return page.evaluate(() => {
    const vis = (el) => !!el && !el.hidden && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
    const $ = (s) => document.querySelector(s);
    const choices = [...document.querySelectorAll('#dialogue-choices button')].filter(vis).map((b) => b.textContent.trim());
    return {
      title: vis($('#screen-title')),
      ended: vis($('#screen-end')),
      cutscene: vis($('#btn-skip')),
      dialogue: vis($('#dialogue')),
      speaker: $('#dialogue-speaker')?.textContent.trim() ?? '',
      text: $('#dialogue-text')?.textContent.trim() ?? '',
      choices,
      prompt: vis($('#prompt')) ? $('#prompt').textContent.trim() : '',
      objective: $('#objective-text')?.textContent.trim() ?? '',
      chapter: $('#objective-chapter')?.textContent.trim() ?? '',
      toast: $('#toast')?.textContent.trim() ?? '',
      tip: vis($('#tip')) ? $('#tip').textContent.trim() : '',
      panel: vis($('#panel')),
    };
  });
}

// ---------- 輸入（依玩家類型：鍵盤、滑鼠、觸控） ----------

function makeInput(page, persona) {
  let cdp = null;
  const touchPoint = async (type, points) => {
    cdp ??= await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  };
  const press = async (selector) => {
    const loc = page.locator(selector).first();
    if (persona.input === 'touch') await loc.tap();
    else await loc.click();
  };
  return {
    press,
    /** 互動：鍵盤玩家按 E，其他人點畫面上的互動按鈕 */
    async interact() {
      if (persona.input === 'keyboard') await page.keyboard.press('e');
      else await press('#prompt');
    },
    async openMap() {
      if (persona.input === 'keyboard') await page.keyboard.press('m');
      else await press('#btn-map');
    },
    async openJournal() {
      if (persona.input === 'keyboard') await page.keyboard.press('j');
      else await press('#objective');
    },
    async closePanel() {
      if (persona.input === 'keyboard') await page.keyboard.press('Escape');
      else await press('#panel-close');
    },
    /** 對話：鍵盤按空白鍵；滑鼠／觸控點對話框左上角（避開可以點的韓文註解） */
    async advance() {
      if (persona.input === 'keyboard') return page.keyboard.press('Space');
      const box = await page.locator('#dialogue .dialogue, #dialogue').first().boundingBox();
      if (!box) return;
      if (persona.input === 'touch') await page.touchscreen.tap(box.x + 10, box.y + 10);
      else await page.mouse.click(box.x + 8, box.y + 8);
    },
    async choose(index) {
      if (persona.input === 'keyboard') return page.keyboard.press(String(index + 1));
      const btn = page.locator('#dialogue-choices button').nth(index);
      if (persona.input === 'touch') await btn.tap();
      else await btn.click();
    },
    /** 自由走動：鍵盤按住方向鍵；觸控推搖桿；滑鼠點畫面上的地面 */
    async walk(dir, ms) {
      if (persona.input === 'keyboard') {
        const key = { up: 'w', right: 'd', down: 's', left: 'a' }[dir];
        await page.keyboard.down(key);
        await wait(page, ms);
        await page.keyboard.up(key);
        return;
      }
      const vp = page.viewportSize();
      if (persona.input === 'touch') {
        const box = await page.locator('#joystick').boundingBox();
        if (!box) return;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const [dx, dy] = { up: [0, -45], right: [45, 0], down: [0, 45], left: [-45, 0] }[dir];
        await touchPoint('touchStart', [{ x: cx, y: cy, id: 3 }]);
        await touchPoint('touchMove', [{ x: cx + dx / 2, y: cy + dy / 2, id: 3 }]);
        await touchPoint('touchMove', [{ x: cx + dx, y: cy + dy, id: 3 }]);
        await wait(page, ms);
        await touchPoint('touchEnd', []);
        return;
      }
      const [fx, fy] = { up: [0.5, 0.22], right: [0.8, 0.5], down: [0.5, 0.78], left: [0.2, 0.5] }[dir];
      await page.mouse.click(vp.width * fx, vp.height * fy);
      await wait(page, ms);
    },
  };
}

// ---------- 玩家的「腦」：記憶與決策（只用讀到的文字） ----------

/** 兩段文字是否有共同的兩個字（地點名稱 ↔ 互動提示） */
function shares(a, b) {
  const clean = (s) => s.replace(/[\s（）()「」：:,，。·]/g, '');
  const x = clean(a);
  const y = clean(b);
  for (let i = 0; i < x.length - 1; i++) if (y.includes(x.slice(i, i + 2))) return true;
  return false;
}

function seasonOrder(texts) {
  const order = {};
  // 「梅—早春」或「梅花，題著『早春』」兩種寫法都讀得懂
  for (const t of texts) for (const m of t.matchAll(/([梅蘭菊竹])[^梅蘭菊竹；;。\n]{0,8}?早?([春夏秋冬])/g)) order[m[1]] ??= SEASONS.indexOf(m[2]);
  return Object.keys(order).length === 4 ? Object.keys(order).sort((a, b) => order[a] - order[b]) : null;
}

/** 從讀過的文字找答案：選項本身出現在文字裡（長的優先），或題目中「X」附近出現的選項 */
function guessFromTexts(question, choices, texts, tried) {
  const pool = texts.join('\n');
  const key = question.match(/「(.+?)」/)?.[1];
  const scored = choices.map((c, i) => {
    if (tried.has(i)) return { i, s: -1 };
    let s = 0;
    if (c.length >= 2 && pool.includes(c)) s += c.length;
    if (key && c.length <= 2) {
      const near = new RegExp(`${c}[^，。\\n]{0,3}${key}|${key}[^，。\\n]{0,3}${c}`);
      if (near.test(pool)) s += 5;
    }
    const core = c.replace(/[的甕種]/g, '');
    if (core.length >= 2 && pool.includes(core)) s += 1;
    return { i, s };
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored[0].s >= 0 ? scored[0].i : 0;
}

// ---------- 一次完整遊玩 ----------

async function play(page, persona, log, metricsOut) {
  const input = makeInput(page, persona);
  const random = rng(persona.seed);
  const t0 = Date.now();
  const mem = {
    texts: [],
    known: new Set(), // 讀過的每一句（判斷這次互動有沒有新收穫）
    tried: new Map(), // 題目 → 試過的選項
    carvingAt: new Map(), // 地點名稱 → 刻紋
    lit: [],
    visits: new Map(), // 地點 → { count, fruitless }
    lastSig: '',
    lastVisitAt: new Map(), // 地點 → 上次去的時候讀過幾句
    failedAt: new Map(), // 第幾盞 → 試過不對的刻紋
    pendingLantern: null,
    lastRiddle: null,
    wrongInRow: 0,
  };
  const metrics = Object.assign(metricsOut, {
    firstPromptSeconds: null,
    objectiveTimeline: [],
    pathFailures: 0,
    invalidActions: 0,
    puzzleMistakes: 0,
    hintsUsed: 0,
    dialogueChoices: 0,
    travels: 0,
    exploreBursts: 0,
    interactions: 0,
    blockedToasts: [],
    stuckEvents: 0,
    recoveredErrors: 0,
  });
  const elapsed = () => Math.round((Date.now() - t0) / 1000);
  const remember = (t) => {
    if (t && mem.texts[mem.texts.length - 1] !== t) mem.texts.push(t);
    if (t) mem.known.add(t);
  };
  let lastToast = '';
  const watch = async () => {
    const u = await ui(page);
    if (u.prompt && metrics.firstPromptSeconds === null) metrics.firstPromptSeconds = elapsed();
    const sig = `${u.chapter}|${u.objective}`;
    if (sig !== mem.lastSig && u.objective) {
      metrics.objectiveTimeline.push({ t: elapsed(), chapter: u.chapter, objective: u.objective });
      mem.lastSig = sig;
      for (const v of mem.visits.values()) v.fruitless = 0;
    }
    if (u.toast && u.toast !== lastToast) {
      lastToast = u.toast;
      if (/無法到達|被阻擋|過不去|攔住|需要先/.test(u.toast)) {
        metrics.pathFailures++;
        metrics.blockedToasts.push(u.toast);
      }
      if (/請靠近/.test(u.toast)) metrics.invalidActions++;
    }
    return u;
  };

  // 標題畫面 → 新的旅程；開場過場看幾秒（新手看完一段）再跳過
  await input.press('#btn-new');
  await wait(page, 500);
  if ((await ui(page)).panel) await input.press('.pause-menu button');
  await wait(page, persona.hints === 'early' ? 6000 : 2500);
  if ((await ui(page)).cutscene) await input.press('#btn-skip');
  for (let i = 0; i < 40 && !(await ui(page)).objective; i++) await wait(page, 250);
  log(`進入遊戲（${elapsed()} 秒），目標：「${(await watch()).objective}」`);

  /** 處理一整段對話：讀文字、遇到選項依記憶做決定 */
  const dialogueLoop = async () => {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const u = await watch();
      if (u.ended) return;
      if (!u.dialogue) {
        // 動作演出中（轉轆轤、開門）對話框會暫時關掉：等一下，看看是不是還有下一段
        let back = false;
        for (let i = 0; i < 16 && !back; i++) {
          await wait(page, 250);
          const v = await ui(page);
          if (v.ended) return;
          back = v.dialogue;
        }
        if (!back) return;
        continue;
      }
      remember(u.text);
      if (!u.choices.length) {
        // 等字打完、選項出現（選項在打字結束後才出現）
        await wait(page, 260);
        const again = await ui(page);
        if (again.choices.length || !again.dialogue) continue;
        await input.advance();
        await wait(page, 180);
        continue;
      }
      const idx = decide(u);
      if (VERBOSE) log(`  · 「${u.text.slice(0, 40)}」→ 選「${u.choices[idx]}」`);
      metrics.dialogueChoices++;
      await wait(page, 380);
      await input.choose(idx);
      await wait(page, 350);
    }
    metrics.stuckEvents++;
  };

  /** 選項決策 */
  const decide = (u) => {
    const { text, choices } = u;
    const pick = (label) => Math.max(0, choices.findIndex((c) => c.includes(label)));
    // 答錯後：再想一次 or 看提示
    if (choices.includes('看提示')) {
      const useHint = persona.hints === 'early' || (persona.hints === 'late' && mem.wrongInRow >= 2);
      if (useHint) metrics.hintsUsed++;
      return pick(useHint ? '看提示' : choices[0]);
    }
    const riddle = text.match(/第 \d 題：(.+)/);
    if (riddle) {
      const q = riddle[1];
      if (mem.lastRiddle !== q) mem.wrongInRow = 0;
      mem.lastRiddle = q;
      const tried = mem.tried.get(q) ?? new Set();
      mem.tried.set(q, tried);
      // 「第一盞石燈」：自己記得點過的順序
      let i = q.includes('第一盞') && mem.lit[0] ? choices.indexOf(mem.lit[0]) : -1;
      if (i < 0 || tried.has(i)) i = guessFromTexts(q, choices, mem.texts, tried);
      tried.add(i);
      mem.pendingAnswer = q;
      return i;
    }
    if (text.includes('月亮在哪一個甕裡')) return Math.floor(random() * choices.length);
    // 石燈：讀刻紋，照屏風的季節順序點；不知道順序時，探索型玩家直接試
    const carving = text.match(/石燈的火室裡刻著.*「(.)」/)?.[1];
    if (carving) {
      const order = seasonOrder(mem.texts);
      const next = order?.find((c) => !mem.lit.includes(c));
      const lanternFruitless = [...mem.visits].filter(([n]) => n.startsWith('石燈')).reduce((a, [, v]) => a + v.fruitless, 0);
      const failed = mem.failedAt.get(mem.lit.length) ?? new Set();
      const light = order ? next === carving : (persona.explore || lanternFruitless > 6) && !failed.has(carving) && !mem.lit.includes(carving);
      mem.pendingLantern = light ? carving : null;
      return light ? 0 : choices.length - 1;
    }
    if (text.includes('轆轤')) return pick('轉動轆轤');
    if (choices.some((c) => c.includes('叫醒'))) return pick('叫醒');
    if (choices.some((c) => c.includes('還給他'))) return 0;
    if (choices.includes('進去看看')) return 0;
    // 장독대這類「選一個」：先用讀過的文字（字條）推理，沒線索就依序試
    const key = `${u.speaker}|${text}`;
    const tried = mem.tried.get(key) ?? new Set();
    mem.tried.set(key, tried);
    const options = choices.map((c, i) => i).filter((i) => !DECLINE.some((d) => choices[i].includes(d)));
    if (!options.length) return 0;
    let i = guessFromTexts(text, choices, mem.texts, new Set([...tried, ...choices.map((c, j) => (options.includes(j) ? -1 : j)).filter((j) => j >= 0)]));
    if (!options.includes(i) || tried.has(i)) i = options.find((j) => !tried.has(j)) ?? options[0];
    tried.add(i);
    return i;
  };

  /** 對話結束後依讀到的回應更新記憶（答錯、點燈成功或失敗） */
  const afterDialogue = () => {
    const recent = mem.texts.slice(-8).join('\n');
    if (mem.pendingLantern) {
      if (/吹熄/.test(recent)) {
        metrics.puzzleMistakes++;
        const failed = mem.failedAt.get(mem.lit.length) ?? new Set();
        failed.add(mem.pendingLantern);
        mem.failedAt.set(mem.lit.length, failed);
      }
      else if (recent.includes('燈火亮了起來')) mem.lit.push(mem.pendingLantern);
      mem.pendingLantern = null;
    }
  };

  /** 從地圖讀出看過的地點，選一個去 */
  const chooseDestination = async () => {
    await input.openMap();
    await wait(page, 450);
    const places = await page.$$eval('#panel .places .place', (bs) => bs.map((b) => ({ name: b.textContent.replace('◆ ', '').trim(), task: b.classList.contains('task') })));
    if (VERBOSE) log(`  · 地圖上的地點：${places.map((p) => (p.task ? '◆' : '') + p.name).join('、') || '（無）'}`);
    const v = (n) => mem.visits.get(n) ?? { count: 0, fruitless: 0 };
    const order = seasonOrder(mem.texts);
    const nextCarving = order?.find((c) => !mem.lit.includes(c));
    const score = (p) => {
      const s = v(p.name);
      let k = 0;
      if (p.task) k += persona.explore ? 2 : 6;
      if (!s.done) k += persona.explore ? 7 : 3;
      k -= s.fruitless * 4;
      if (p.name.startsWith('石燈') && nextCarving) {
        const known = mem.carvingAt.get(p.name);
        if (known === nextCarving) k += 10;
        else if (known && mem.lit.includes(known)) k -= 8;
        else if (known) k -= 3;
      }
      if (p.name === '黑貓') k += 1;
      // 別人剛提到、之後還沒去過的地方（例如할머니說「屋裡的屏風」）優先去看
      if (!p.name.startsWith('石燈')) {
        const key = p.name.replace(/（.*）/, '').slice(-2);
        const since = mem.lastVisitAt.get(p.name) ?? 0;
        if (mem.texts.slice(since).some((t) => t.includes(key))) k += s.done ? 3 : 9;
      }
      return k + random() * (persona.explore ? 3 : 1);
    };
    places.sort((a, b) => score(b) - score(a));
    const best = places[0];
    if (!best || score(best) < -6) {
      await input.closePanel();
      return null;
    }
    try {
      await page.locator(`#panel .places .place >> text=${best.name}`).first()[persona.input === 'touch' ? 'tap' : 'click']({ timeout: 5000 });
    } catch {
      return null; // 地圖已經被關掉（例如劇情開始）
    }
    metrics.travels++;
    return best;
  };

  /** 等角色走到：互動提示出現且和地點名稱相符，或停下來超過一段時間 */
  const waitArrive = async (place) => {
    const deadline = Date.now() + 30000;
    let stable = 0;
    let last = '';
    while (Date.now() < deadline) {
      await wait(page, 300);
      const u = await watch();
      if (u.dialogue || u.ended) return u.prompt;
      if (/無法到達|被阻擋|攔住|需要先/.test(u.toast) && u.toast !== place.lastToast) {
        place.lastToast = u.toast;
        return '';
      }
      if (u.prompt && shares(place.name, u.prompt)) {
        stable = u.prompt === last ? stable + 1 : 0;
        last = u.prompt;
        if (stable >= 2) return u.prompt;
      }
    }
    return (await ui(page)).prompt;
  };

  const exploreBurst = async () => {
    metrics.exploreBursts++;
    const dirs = ['up', 'left', 'right', 'up', 'down'];
    const dir = dirs[Math.floor(random() * dirs.length)];
    await input.walk(dir, 1200 + random() * 1500);
    await wait(page, 300);
  };

  // 新手教學：先照提示走幾步
  await exploreBurst();
  await input.walk('up', 1500);

  let lastProgress = Date.now();
  let lastObjective = '';
  while (Date.now() - t0 < BUDGET_MS) {
    try {
      if (await step()) break;
    } catch (err) {
      // 測試程式自己的操作失敗（例如按鈕剛好消失）：記下來，回到遊戲畫面繼續
      metrics.recoveredErrors++;
      if (VERBOSE) log(`  · 操作失敗，重試：${err.message.split('\n')[0]}`);
      if ((await ui(page)).ended) break;
      await wait(page, 500);
    }
  }
  metrics.totalSeconds = elapsed();
  metrics.lanternOrderPlayed = mem.lit;
  return metrics;

  /** 一步：回傳 true 代表遊戲結束 */
  async function step() {
    const u = await watch();
    if (u.ended) return true;
    if (u.objective !== lastObjective) {
      lastObjective = u.objective;
      lastProgress = Date.now();
      log(`[${elapsed()} 秒] ${u.chapter}｜${u.objective}`);
    }
    if (u.dialogue) {
      await dialogueLoop();
      afterDialogue();
      return false;
    }
    if (u.panel) {
      await input.closePanel();
      await wait(page, 300);
      return false;
    }
    // 卡太久：看提示（新手一卡住就看）
    const stuckFor = Date.now() - lastProgress;
    if (persona.hints !== 'never' && stuckFor > (persona.hints === 'early' ? 90000 : 200000) && !mem.hintAt?.[u.objective]) {
      mem.hintAt = { ...(mem.hintAt ?? {}), [u.objective]: true };
      await input.press('#btn-hint');
      await wait(page, 600);
      const hintText = await page.evaluate(() => document.querySelector('#panel')?.innerText ?? '');
      remember(hintText);
      const more = page.locator('#panel-body button:has-text("給我一點提示"), #panel-body button:has-text("再具體一點")').first();
      if (await more.count()) {
        await more[persona.input === 'touch' ? 'tap' : 'click']();
        metrics.hintsUsed++;
        await wait(page, 500);
        remember(await page.evaluate(() => document.querySelector('#panel')?.innerText ?? ''));
      }
      await input.closePanel();
      lastProgress = Date.now();
      return false;
    }
    // 要去祭壇前先翻任務日誌複習線索
    if (u.objective.includes('祭壇') && !mem.readJournal) {
      mem.readJournal = true;
      await input.openJournal();
      await wait(page, 600);
      const tabs = page.locator('#panel-tabs [role="tab"]');
      const n = await tabs.count();
      for (let i = 0; i < n; i++) {
        await tabs.nth(i)[persona.input === 'touch' ? 'tap' : 'click']();
        await wait(page, 250);
        remember(await page.evaluate(() => document.querySelector('#panel')?.innerText ?? ''));
      }
      await input.closePanel();
      return false;
    }

    const place = await chooseDestination();
    if (VERBOSE) log(`  · 前往 ${place?.name ?? '（沒有想去的地方，隨便走走）'}`);
    if (!place) {
      await exploreBurst();
      return false;
    }
    const prompt = await waitArrive(place);
    if (VERBOSE) log(`  · 抵達，提示「${prompt}」`);
    const rec = mem.visits.get(place.name) ?? { count: 0, fruitless: 0 };
    rec.count++;
    mem.visits.set(place.name, rec);
    if (!prompt) {
      // 沒走到：可能半路被擋住，換個方向走幾步再試，不算去過
      rec.fruitless++;
      await exploreBurst();
      return false;
    }
    rec.done = (rec.done ?? 0) + 1;
    const before = `${(await ui(page)).objective}|${mem.known.size}|${mem.lit.length}`;
    const knownBefore = new Set(mem.known);
    await input.interact();
    metrics.interactions++;
    await wait(page, 600);
    const after = await watch();
    if (after.dialogue) {
      await dialogueLoop();
      afterDialogue();
    } else await wait(page, 1200);
    // 刻紋記在這個地點名下（玩家記得哪一盞刻什麼）
    // 這次互動讀到的最後一個刻紋（不要拿到前一盞的）
    const lastOf = (re) => [...mem.texts.slice(-6).join('\n').matchAll(re)].pop()?.[1];
    const carving = lastOf(/石燈的火室裡刻著[^「\n]*「(.)」/g) ?? lastOf(/刻著(.)的石燈正燒得旺盛/g);
    if (carving && place.name.startsWith('石燈')) {
      mem.carvingAt.set(place.name, carving);
      if (mem.texts.slice(-3).join('').includes('正燒得旺盛') && !mem.lit.includes(carving)) mem.lit.push(carving);
    }
    // 沒有新的對話內容、目標也沒變：這一趟沒收穫（同一句話再看一次不算）
    const fresh = [...mem.known].filter((t) => !knownBefore.has(t) && !/^轆轤（已轉|^石燈的火室/.test(t)).length;
    const now = `${(await ui(page)).objective}|${mem.known.size}|${mem.lit.length}`;
    if (now.split('|')[0] === before.split('|')[0] && fresh === 0 && now.split('|')[2] === before.split('|')[2]) rec.fruitless++;
    mem.lastVisitAt.set(place.name, mem.texts.length);
    // 答錯題目時（도깨비說錯啦）累計
    const recent = mem.texts.slice(-10).join('\n');
    const wrongs = (recent.match(/錯啦|空的～/g) ?? []).length;
    if (wrongs) {
      metrics.puzzleMistakes += wrongs;
      mem.wrongInRow += wrongs;
    }
    return false;
  }
}

// ---------- 執行 ----------

const names = (process.argv[2] ?? 'keyboard,touch,explorer,newcomer').split(',');
const server = await preview({ root: join(here, '../..'), preview: { port: 4197 }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
let failed = 0;
for (const name of names) {
  const persona = PERSONAS[name];
  console.log(`\n[${name}] ${persona.label}`);
  const { input, explore, hints, seed, label, ...ctx } = persona;
  const page = await browser.newPage(ctx);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const lines = [];
  const log = (s) => {
    lines.push(s);
    console.log(`  ${s}`);
  };
  await page.goto(`${url}?test`);
  await wait(page, 1500);
  const metrics = {};
  try {
    await play(page, persona, log, metrics);
  } catch (err) {
    log(`測試程式例外：${err.message.split('\n')[0]}`);
    metrics.crashed = err.message.split('\n')[0];
  }
  // ---- 結束後才讀遊戲狀態：驗證與統計（不影響上面的決定） ----
  const st = await page.evaluate(() => window.__dokkaebi?.state());
  await page.screenshot({ path: join(shotDir, `blackbox-${name}-end.png`) });
  const ok = !!st?.flags?.finished;
  const report = {
    persona: name,
    label,
    kind: 'AI 模擬玩家（自動化黑箱測試，不是真人）',
    date: new Date().toISOString(),
    environment: `Chrome（無頭，SwiftShader 軟體繪圖） ${ctx.viewport.width}×${ctx.viewport.height}${ctx.hasTouch ? ' 觸控' : ''}`,
    finished: ok,
    ending: st?.flags?.ending ?? null,
    chapterReached: st?.chapter ?? null,
    gameStats: st?.stats ?? null,
    landmarksFound: st?.landmarks?.length ?? 0,
    errors: errors.slice(0, 10),
    ...metrics,
    log: lines,
  };
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(report, null, 2));
  const pass = ok && errors.length === 0;
  if (!pass) failed++;
  console.log(`  ${pass ? '✓' : '✗'} ${ok ? `完成遊戲（${report.ending === 'true' ? '真結局' : '一般結局'}）` : `沒有完成（停在第 ${report.chapterReached} 章）`}，花費 ${metrics.totalSeconds ?? '?'} 秒，` +
    `走不到 ${metrics.pathFailures ?? '?'} 次、無效操作 ${metrics.invalidActions ?? '?'} 次、謎題失誤 ${metrics.puzzleMistakes ?? '?'} 次、提示 ${metrics.hintsUsed ?? '?'} 次、JS 錯誤 ${errors.length} 個`);
  await page.close();
}
await browser.close();
await server.close();
console.log(failed ? `\n${failed} 位模擬玩家沒有完成` : '\n全部模擬玩家都完成遊戲');
process.exit(failed ? 1 : 0);
