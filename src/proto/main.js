import { PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3 } from 'three';
import { AudioManager } from '../audio/AudioManager.js';
import { EventBus } from '../core/EventBus.js';
import { Input } from '../core/Input.js';
import { Settings } from '../core/Settings.js';
import { CameraRig } from '../game/CameraRig.js';
import { NavGrid } from '../game/Pathfinding.js';
import { Player } from '../game/Player.js';
import { tagObject } from '../render/objectId.js';
import { Renderer } from '../render/Renderer.js';
import { Joystick } from '../ui/Joystick.js';
import { updatePointScale } from '../world/Particles.js';
import { ProtoWorld } from './ProtoWorld.js';
import { GUST, LAYOUT, Lantern, MEMORY_WALK_SPEED, exposedAt, gustAt, inBridgeGap, inTrench, nextHint, onMemory, onPlank } from './rules.js';

/**
 * Gate 1 原型「斷橋與燈」：驗證月魂燈籠＋靈界＋風這組規則。
 * 和正式遊戲分開（prototype.html），重用角色、ASCII 渲染、鏡頭、輸入與音訊模組。
 */
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const $ = (id) => document.getElementById(id);
const touch = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;

const bus = new EventBus();
const settings = new Settings(bus);
const audio = new AudioManager(settings, bus);
const canvas = $('game');
const renderer = new Renderer(canvas);
renderer.set({ mode: params.get('render') ?? 'hd', density: params.get('density') ?? 'fine', samples: 'auto', quality: params.get('quality') ?? 'high' });
const scene = new Scene();
const world = new ProtoWorld(scene);
const camera = new PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
const rig = new CameraRig(camera);
const input = new Input({ canvas, bus });
let nav = new NavGrid(LAYOUT.bounds, world.colliders);
const player = new Player(world, LAYOUT.start, nav);
scene.add(player.object);
tagObject(player.object, 'character');
const lantern = new Lantern();
const joystick = new Joystick((v) => input.setJoystick(v));
if (touch) {
  $('joystick').hidden = false;
  document.body.classList.add('touch');
}

renderer.onResize = (w, h, layout) => {
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  rig.setAspect(w / h);
  rig.cellRows = renderer.asciiEnabled ? layout.rows : 0;
};
renderer.resize();
// 這一關不大：預設鏡頭比正式版近一點
rig.setUserZoom?.(0.72);
rig.follow(player.position, true);

// ---------- 狀態與玩家紀錄（結算畫面與真人測試都會用到） ----------
let mode = TEST ? 'playing' : 'intro'; // intro | playing | acting | falling | ended
let time = 0;
let raiseHeld = false;
let raiseBlend = 0;
let fall = null;
let fadeTimer = 0;
const shownHints = new Set();
const progress = {
  revealed: new Set(),
  revealedAt: {},
  usedSpirit: false,
  firstSpiritAt: null,
  firstRaiseAt: null,
  nearSteleEye: 0,
  plankCrossedAt: null,
  bridgeAttempts: 0,
  falls: 0,
  fallsOnBridge: 0,
  relights: 0,
  shutterClosed: false,
  shutterClosedAt: null,
  crossedAt: null,
  crossedWith: null,
  raisedSeconds: 0,
  spiritSeconds: 0,
  interactions: 0,
  hints: [],
  log: [],
};
const note = (event) => progress.log.push({ t: +time.toFixed(1), event });

// ---------- 音效（全部即時合成） ----------
const sfx = {
  gust: (closed) => audio.noise({ duration: GUST.warn + 2.6, type: 'bandpass', freq: 380, q: 0.7, gain: closed ? 0.04 : 0.2, attack: 0.8, sweepTo: 900 }),
  out: () => {
    audio.noise({ duration: 0.4, freq: 2600, sweepTo: 500, gain: 0.22 });
    audio.tone({ freq: 220, to: 110, duration: 0.4, type: 'triangle', gain: 0.08 });
  },
  relight: () => {
    audio.noise({ duration: 0.5, type: 'highpass', freq: 1500, gain: 0.14 });
    audio.tone({ freq: 262, to: 392, duration: 0.5, type: 'triangle', gain: 0.08 });
  },
  spirit: (on) => {
    audio.tone({ freq: on ? 392 : 784, to: on ? 784 : 392, duration: 0.6, gain: 0.1 });
    audio.tone({ freq: on ? 587 : 440, duration: 0.8, gain: 0.05, at: 0.08 });
  },
  deny: () => audio.tone({ freq: 160, duration: 0.18, type: 'square', gain: 0.05 }),
  reveal: () => {
    audio.pluck({ bus: 'sfx', freq: 523, duration: 1.4, gain: 0.12 });
    audio.pluck({ bus: 'sfx', freq: 784, duration: 1.6, gain: 0.08, at: 0.15 });
  },
  fall: () => audio.noise({ duration: 1.1, freq: 900, sweepTo: 140, gain: 0.25, attack: 0.05 }),
  winch: () => {
    audio.noise({ duration: 2.2, type: 'bandpass', freq: 260, q: 5, gain: 0.12 });
    audio.tone({ freq: 98, duration: 0.3, type: 'square', gain: 0.06, at: 2.1 });
  },
  lamp: () => [523, 659, 784, 1047].forEach((f, i) => audio.pluck({ bus: 'sfx', freq: f, duration: 2, gain: 0.12, at: i * 0.18 })),
  step: (memory) => (memory ? audio.tone({ freq: 880 + Math.random() * 220, duration: 0.14, type: 'triangle', gain: 0.025 }) : audio.noise({ duration: 0.05, freq: 1100, gain: 0.035 })),
};
player.onStep = () => sfx.step(lantern.spirit && onMemory(player.position.x, player.position.z));

// ---------- 介面 ----------
let captionTimer = 0;
function caption(text, seconds = 4.5) {
  const el = $('caption');
  el.textContent = text;
  el.hidden = false;
  captionTimer = seconds;
}
let tipTimer = 0;
function tip(text) {
  const el = $('tip');
  el.textContent = text;
  el.hidden = false;
  tipTimer = 10;
}

function rebuildNav() {
  nav = new NavGrid(LAYOUT.bounds, world.colliders);
  player.nav = nav;
}

function toggleSpirit() {
  if (mode !== 'playing') return;
  if (!lantern.toggleSpirit()) {
    caption('燈籠熄了，看不到月亮的另一面。');
    sfx.deny();
    return;
  }
  world.setSpirit(lantern.spirit);
  rebuildNav();
  sfx.spirit(lantern.spirit);
  note(lantern.spirit ? 'spirit-on' : 'spirit-off');
  if (lantern.spirit) {
    world.burst('memory', player.position.clone().setY(1.2));
    if (!progress.usedSpirit) {
      progress.usedSpirit = true;
      progress.firstSpiritAt = time;
      caption('燈籠照出了月亮另一面的東西。發著青光的，是過去還在的東西。', 6);
    }
  } else if (onMemory(player.position.x, player.position.z)) startFall();
}

function startFall() {
  const p = player.position;
  mode = 'falling';
  progress.falls++;
  if (inBridgeGap(p.x, p.z)) progress.fallsOnBridge++;
  fall = { t: 0, y: player.object.position.y, to: inTrench(p.x, p.z) ? LAYOUT.safeTrench : LAYOUT.safeSouth };
  player.stop();
  sfx.fall();
  note('fall');
  caption('燈一熄，腳下的橋就不見了……', 3.5);
}

// ---------- 互動 ----------
function available() {
  const p = player.position;
  let best = null;
  for (const it of world.interactables()) {
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (d < it.radius && (!best || d < best.d)) best = { ...it, d };
  }
  if (!best) return null;
  const label = {
    brazier: lantern.lit ? '看看 火盆' : '點燈',
    winch: world.shutterClosed ? '轉動絞盤（打開閘門）' : '轉動絞盤（關上閘門）',
    lamp: world.lamp.lit ? '石燈' : '點亮 石燈',
  }[best.id] ?? `調查 ${best.label}`;
  return { ...best, prompt: label };
}

async function interact() {
  if (mode !== 'playing') return;
  const it = available();
  if (!it) {
    caption('附近沒有可以互動的東西。', 2);
    return;
  }
  mode = 'acting';
  progress.interactions++;
  player.stop();
  player.faceTowards(it.face);
  try {
    if (it.id === 'brazier') {
      if (!lantern.lit) {
        const fire = world.brazier.position.clone().setY(0.95);
        await player.act('LightLantern', {
          hand: { R: { target: fire.clone().lerp(player.position.clone().setY(0.95), 0.35), weight: 1, envelope: [0.1, 0.36, 0.62, 0.92] } },
          look: fire,
          events: {
            ignite: () => {
              lantern.ignite();
              sfx.relight();
              world.burst('ignite', player.model.lantern.getWorldPosition(new Vector3()));
            },
          },
        });
        if (!lantern.lit) lantern.ignite();
        progress.relights++;
        note('relight');
        caption('燈籠重新點亮了。');
      } else {
        await player.act('Inspect');
        caption(world.shutterClosed ? '火盆的煙直直地往上飄。' : '火盆燒得很旺。煙一陣一陣地被吹向西邊，又直直地飄起來。');
      }
    } else if (it.id === 'winch') {
      const closing = !world.shutterClosed;
      sfx.winch();
      if (closing) world.gate.close();
      else world.gate.open();
      const h = player.hold('CrankWell');
      await new Promise((r) => setTimeout(r, TEST ? 50 : 2100));
      h.stop();
      progress.shutterClosed = closing;
      if (closing && progress.shutterClosedAt === null) progress.shutterClosedAt = time;
      note(closing ? 'gate-close' : 'gate-open');
      caption(closing ? '峽谷東邊的木閘門慢慢關上了。風聲小了下來。' : '木閘門打開了，峽谷的風又灌了進來。');
    } else if (it.id.startsWith('stele')) {
      const s = world.steles.find((x) => x.id === it.id);
      // 看過一次的圖案，之後放下燈籠再調查也記得（不要跟玩家剛看到的東西矛盾）
      const known = s.seen || s.reveal > 0.6;
      await player.act('Inspect');
      if (!known) caption('石碑上的刻痕很淺，看不清楚。也許需要更亮的光。');
      else if (s.picture === 'eye') caption('石碑上浮現一隻眼睛，瞳孔是一彎新月。', 6);
      else caption('石碑上浮現兩幅畫：上面，橋上的燈被風吹熄；下面，閘門關上了，燈火直直地燒著。', 7);
    } else if (it.id === 'lamp') {
      if (world.lamp.lit) caption('石燈靜靜地燒著。');
      else if (!lantern.lit) caption('燈籠的火熄了，沒辦法點燈。');
      else {
        const fire = world.lamp.group.localToWorld(new Vector3(0, 1.46, 0));
        await player.act('LightLantern', {
          hand: { R: { target: fire.clone().lerp(player.position.clone().setY(fire.y), 0.28), weight: 1, envelope: [0.1, 0.36, 0.62, 0.92] } },
          look: fire,
          events: { ignite: () => world.lamp.setLit(true, false) },
        });
        if (!world.lamp.lit) world.lamp.setLit(true, false);
        sfx.lamp();
        note('lamp');
        finish();
        return;
      }
    }
  } catch (err) {
    console.error(err);
    caption('出了點問題，已經恢復。');
  }
  if (mode === 'acting') mode = 'playing';
}

function finish() {
  mode = 'ended';
  const p = progress;
  const fmt = (s) => (s == null ? '—' : `${Math.floor(s / 60)} 分 ${String(Math.round(s % 60)).padStart(2, '0')} 秒`);
  const rows = [
    ['完成時間', fmt(time)],
    ['第一次舉燈', fmt(p.firstRaiseAt)],
    ['第一次靈視', fmt(p.firstSpiritAt)],
    ['過橋方式', p.crossedWith === 'gate' ? '關上木閘門' : p.crossedWith === 'timing' ? '看準風停的時機' : '—'],
    ['掉下去', `${p.falls} 次`],
    ['重新點燈', `${p.relights} 次`],
    ['看到的提示', p.hints.length ? p.hints.map((h) => h.id).join('、') : '沒有'],
  ];
  $('end-stats').innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
  setTimeout(() => ($('end').hidden = false), TEST ? 0 : 2200);
}

// ---------- 輸入 ----------
bus.on('input:action', () => interact());
bus.on('input:toggleAscii', () => renderer.set({ mode: renderer.asciiEnabled ? '3d' : renderer.lastAsciiMode ?? 'hd' }));
bus.on('input:zoom', (d) => rig.zoomBy(d));
const setRaise = (on) => {
  raiseHeld = on;
};
addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.repeat) return;
  if (e.code === 'KeyF') setRaise(true);
  if (e.code === 'KeyQ') toggleSpirit();
  if (mode === 'intro' && (e.code === 'Enter' || e.code === 'Space')) start();
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyF') setRaise(false);
});
addEventListener('blur', () => setRaise(false));
addEventListener('pointerdown', () => audio.unlock(), { capture: true });
const raiseBtn = $('btn-raise');
raiseBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  setRaise(true);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) raiseBtn.addEventListener(ev, () => setRaise(false));
$('btn-spirit').addEventListener('click', () => toggleSpirit());
$('prompt').addEventListener('click', () => interact());
const toggleView = () => {
  rig.setView(rig.view === 'close' ? 'explore' : 'close');
  $('btn-view').textContent = rig.view === 'close' ? '遠景' : '近景';
};
$('btn-view').addEventListener('click', toggleView);
bus.on('input:cameraView', toggleView);
$('btn-help').addEventListener('click', () => ($('intro').hidden = false));
$('btn-start').addEventListener('click', () => start());
$('btn-again').addEventListener('click', () => location.reload());
function start() {
  $('intro').hidden = true;
  audio.unlock();
  if (mode === 'intro') mode = 'playing';
}
const raycaster = new Raycaster();
const ground = new Plane(new Vector3(0, 1, 0), 0);
bus.on('input:tap', ({ x, y }) => {
  if (mode !== 'playing') return;
  raycaster.setFromCamera(new Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const hit = raycaster.ray.intersectPlane(ground, new Vector3());
  if (!hit) return;
  const res = player.walkTo(hit, null, 0.3, () => caption('這裡走不過去。', 2));
  if (!res.ok) caption(lantern.spirit ? '這裡走不過去。' : '那邊是深谷，走不過去。', 2);
});

// ---------- 每一格 ----------
const tmpTarget = new Vector3();
let lastPhase = 'calm';
let hintTimer = 0;
let framing = null;
const wasOnMemory = { bridge: false };

function frame(dt, moveOverride = null) {
  time += dt;
  const p = player.position;
  if (mode === 'falling') {
    fall.t += dt;
    player.object.position.y = fall.y - 4.5 * fall.t * fall.t;
    fadeTimer = Math.min(1, fall.t / 0.7);
    if (fall.t > 1.1) {
      player.object.position.y = 0;
      player.setPosition(fall.to.x, fall.to.z, Math.PI);
      if (lantern.spirit) lantern.spirit = false;
      world.setSpirit(false);
      rebuildNav();
      mode = 'playing';
      fall = null;
      rig.follow(player.position, true);
      caption('燈籠熄了。火盆的火還燒著。', 4);
    }
  } else {
    fadeTimer = Math.max(0, fadeTimer - dt * 1.6);
    let move = null;
    if (mode === 'playing') {
      const v = moveOverride ?? input.moveVector();
      if (v && Math.hypot(v.x, v.y) > 0.05) {
        const { forward, right } = rig.groundAxes();
        move = { x: forward.x * v.y + right.x * v.x, z: forward.z * v.y + right.z * v.x };
      }
    }
    player.speedLimit = lantern.spirit && onMemory(p.x, p.z) ? MEMORY_WALK_SPEED : 0;
    // 舉燈：右手把燈籠舉過頭（手部 IK）
    const raising = raiseHeld && mode === 'playing';
    raiseBlend += ((raising ? 1 : 0) - raiseBlend) * (1 - Math.exp(-dt * 8));
    if (mode === 'playing') {
      const yaw = player.yaw;
      tmpTarget.set(p.x + Math.sin(yaw) * 0.22, player.object.position.y + 1.42, p.z + Math.cos(yaw) * 0.22);
      player.animator.handTargets = raiseBlend > 0.01 ? { R: { target: tmpTarget, weight: raiseBlend } } : {};
    }
    player.update(dt, move, input.walkHeld);
  }
  lantern.raised = raiseBlend > 0.5;
  if (lantern.raised) {
    progress.raisedSeconds += dt;
    if (progress.firstRaiseAt === null) {
      progress.firstRaiseAt = time;
      note('first-raise');
    }
  }
  if (lantern.spirit) progress.spiritSeconds += dt;

  // 風與燈火
  const g = gustAt(time);
  if (g.phase === 'warn' && lastPhase === 'calm') sfx.gust(world.shutterClosed);
  lastPhase = g.phase;
  const exposure = mode !== 'falling' && exposedAt(p.x, p.z, world.shutterClosed) ? g.strength : 0;
  const ev = lantern.update(dt, exposure);
  if (ev.includes('out')) {
    sfx.out();
    world.burst('snuff', player.model.lantern.getWorldPosition(new Vector3()));
    note('lantern-out');
    if (!ev.includes('spiritOff')) caption('風把燈籠吹熄了。');
  }
  if (ev.includes('spiritOff')) {
    world.setSpirit(false);
    rebuildNav();
    if (mode !== 'falling' && onMemory(p.x, p.z)) startFall();
  }
  // 過橋的嘗試與成功
  const onBridge = lantern.spirit && inBridgeGap(p.x, p.z);
  if (onBridge && !wasOnMemory.bridge) {
    progress.bridgeAttempts++;
    note(`bridge-attempt-${g.phase}`);
  }
  wasOnMemory.bridge = onBridge;
  if (p.z < LAYOUT.remnantNorth.maxZ - 0.3 && progress.crossedAt === null && mode === 'playing') {
    progress.crossedAt = time;
    progress.crossedWith = world.shutterClosed ? 'gate' : 'timing';
    note(`crossed-${progress.crossedWith}`);
  }
  if (lantern.spirit && onPlank(p.x, p.z) && progress.plankCrossedAt === null) progress.plankCrossedAt = time;

  // 世界
  const res = world.update(dt, { raised: lantern.raised, lanternLit: lantern.lit, playerPos: p });
  if (res.revealed) {
    progress.revealed.add(res.revealed);
    progress.revealedAt[res.revealed] = time;
    sfx.reveal();
    note(`reveal-${res.revealed}`);
  }
  // 舉燈靠近石碑時，鏡頭自動轉成調查特寫（看得清楚浮現的圖案）；放下燈就回到跟隨
  const nearStele = mode === 'playing' && lantern.lit && lantern.raised ? world.steles.find((s) => Math.hypot(p.x - s.x, p.z - s.z) < 3.6) : null;
  if (nearStele && framing !== nearStele.id) {
    framing = nearStele.id;
    rig.frame(player.position, new Vector3(nearStele.x, 0, nearStele.z), 'inspect', 1.3);
  } else if (!nearStele && framing && mode === 'playing') {
    framing = null;
    rig.follow(player.position);
  }
  const eye = LAYOUT.steles[0];
  if (Math.hypot(p.x - eye.x, p.z - eye.z) < 3.6 && !progress.revealed.has('stele-eye')) progress.nearSteleEye += dt;

  // 燈籠的樣子：火力越低火越小；熄了就沒有光；舉高時照得更遠
  const m = player.model;
  m.flame.visible = lantern.lit;
  m.flame.scale.multiplyScalar(0.35 + 0.65 * lantern.heat);
  m.light.intensity = lantern.lit ? m.light.intensity * (0.35 + 0.65 * lantern.heat) * (1 + 0.5 * raiseBlend) : 0;
  m.light.distance = 8 + 5 * raiseBlend;

  // 提示：依玩家做過的事，卡住才給
  hintTimer -= dt;
  if (hintTimer <= 0 && mode === 'playing') {
    hintTimer = 0.5;
    const h = nextHint(progress, time, shownHints);
    if (h) {
      shownHints.add(h.id);
      progress.hints.push({ id: h.id, t: +time.toFixed(1) });
      tip(h.text);
    }
  }

  // 介面
  const it = mode === 'playing' ? available() : null;
  const prompt = $('prompt');
  prompt.hidden = !it;
  if (it) prompt.textContent = touch ? `互動\n${it.prompt}` : `[E] ${it.prompt}`;
  $('flame-bar').style.width = `${Math.round(lantern.heat * 100)}%`;
  $('lamp-status').classList.toggle('out', !lantern.lit);
  $('lamp-status').classList.toggle('spirit', lantern.spirit);
  $('lamp-status').classList.toggle('windy', exposure > 0.3);
  $('btn-spirit').classList.toggle('on', lantern.spirit);
  $('btn-raise').classList.toggle('on', raiseHeld);
  $('fade').style.opacity = fadeTimer.toFixed(3);
  captionTimer -= dt;
  if (captionTimer <= 0) $('caption').hidden = true;
  tipTimer -= dt;
  if (tipTimer <= 0) $('tip').hidden = true;

  // 鏡頭與渲染
  rig.update(dt);
  renderer.pass.setSpirit(world.spiritBlend);
  renderer.pass.setMotion(rig.camSpeed ?? 0);
  updatePointScale(world.pointMaterials, renderer.sceneHeight, camera.fov);
  renderer.render(scene, camera);
}

let frozen = false;
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, TEST ? 0.25 : 0.1);
  last = now;
  if (!frozen) frame(dt);
});

// ---------- 測試介面（?test）：只給自動化測試與錄影用 ----------
if (TEST) {
  window.__proto = {
    state: () => ({
      mode,
      time,
      player: { x: player.position.x, z: player.position.z, y: player.object.position.y },
      lantern: { lit: lantern.lit, heat: lantern.heat, raised: lantern.raised, spirit: lantern.spirit },
      gust: gustAt(time),
      shutterClosed: world.shutterClosed,
      lampLit: world.lamp.lit,
      prompt: $('prompt').hidden ? '' : $('prompt').textContent,
      caption: $('caption').hidden ? '' : $('caption').textContent,
      tip: $('tip').hidden ? '' : $('tip').textContent,
      steles: world.steles.map((s) => ({ id: s.id, reveal: s.reveal })),
      progress: { ...progress, revealed: [...progress.revealed] },
    }),
    teleport: (x, z, yaw = Math.PI) => {
      player.setPosition(x, z, yaw);
      rig.follow(player.position, true);
    },
    freeze: () => {
      frozen = true;
    },
    unfreeze: () => {
      frozen = false;
      last = performance.now();
    },
    step: (frames = 1, dt = 1 / 60, move = null) => {
      for (let i = 0; i < frames; i++) frame(dt, move);
    },
    setRaise,
    toggleSpirit,
    // 不等動畫播完（凍結時間時動畫要靠 step 推進）
    interact: () => {
      interact();
    },
    setTime: (t) => {
      time = t;
      world.time = t;
    },
    setRender: (mode2, density) => renderer.set({ mode: mode2, density: density ?? renderer.options.density }),
    setView: (v) => rig.setView(v),
    photo: (pos, look) => {
      frozen = true;
      rig.snapShot(new Vector3(...pos), new Vector3(...look));
      rig.update(0);
      renderer.pass.setSpirit(world.spiritBlend);
      updatePointScale(world.pointMaterials, renderer.sceneHeight, camera.fov);
      renderer.render(scene, camera);
    },
  };
}
