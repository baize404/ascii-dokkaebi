import { PerspectiveCamera, Raycaster, Scene, Vector2, Vector3 } from 'three';
import { AudioManager } from '../audio/AudioManager.js';
import { AdaptiveQuality } from '../core/AdaptiveQuality.js';
import { EventBus } from '../core/EventBus.js';
import { Input } from '../core/Input.js';
import { Settings } from '../core/Settings.js';
import { NavGrid } from '../game/Pathfinding.js';
import { Player } from '../game/Player.js';
import { Renderer } from '../render/Renderer.js';
import { Joystick } from '../ui/Joystick.js';
import { updatePointScale } from '../world/Particles.js';
import { CameraDirector, angleDelta, damp } from './CameraDirector.js';
import { InteractionController } from './Interaction.js';
import { ProtoAudio } from './ProtoAudio.js';
import { ProtoWorld } from './ProtoWorld.js';
import { FALL_REASONS, GATE, LAYOUT, Lantern, MEMORY_WALK_SPEED, gustAt, inBridgeGap, inRavine, inTrench, nextHint, onMemory, onPlank, windExposure } from './rules.js';

/**
 * 「斷橋與燈」4.0 純 3D 垂直切片。
 * 和正式遊戲分開（prototype.html），重用角色、輸入、尋路、音訊模組；鏡頭改用 CameraDirector，互動改用 InteractionController。
 */
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
/** 自動化測試用：結局演出縮短成 0.5 秒（錄影不加這個參數，錄的是完整演出） */
const FAST_ENDING = params.has('fastEnding');
const $ = (id) => document.getElementById(id);
const touch = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
const L = LAYOUT;

const bus = new EventBus();
const settings = new Settings(bus);
const audio = new AudioManager(settings, bus);
const sound = new ProtoAudio(audio);
const canvas = $('game');
const renderer = new Renderer(canvas);
const adaptive = new AdaptiveQuality({ start: touch ? 2 : 0 });
const qualityParam = params.get('quality');
const effectiveQuality = () => qualityParam ?? (settings.get('quality') === 'auto' ? adaptive.step.quality : settings.get('quality'));
const applyRender = () => {
  const q = effectiveQuality();
  renderer.set({ quality: q, scale: settings.get('quality') === 'auto' && !qualityParam ? adaptive.step.scale : 1, pixelRatio: settings.get('pixelRatio'), bloom: settings.get('bloom') });
  world?.setQuality(q === 'ultra' ? 'high' : q);
};
const scene = new Scene();
let world = null;
world = new ProtoWorld(scene, { quality: effectiveQuality() === 'ultra' ? 'high' : effectiveQuality() });
applyRender();
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
const groundAt = (x, z) => (inRavine(x, z) ? -16 : inTrench(x, z) ? -9 : 0);
const director = new CameraDirector(camera, { groundAt });
director.setOccluders(world.occluders);
director.reduceMotion = settings.get('reduceMotion');
const input = new Input({ canvas, bus });
let nav = new NavGrid(L.bounds, world.colliders);
const player = new Player(world, L.start, nav);
scene.add(player.object);
const lantern = new Lantern();
player.lanternState = { heat: 1, lit: true, raised: 0 };
const joystick = new Joystick((v) => input.setJoystick(v));
input.onReset = () => joystick.reset();
if (touch) {
  $('joystick').hidden = false;
  document.body.classList.add('touch');
}
renderer.onResize = (w, h) => director.setAspect(w / h);
renderer.resize();
director.follow(player.position, null, true);
director.yaw = 0;
director.snap();

// ---------- 時間 ----------
// real：真實經過時間；presentation：畫面動畫（暫停時停）；world.time：世界模擬（風的時鐘）；play：正式遊玩時間（開場、暫停、結局不算）
const clock = { real: 0, presentation: 0, play: 0 };
const PLAY_MODES = new Set(['playing', 'inspect', 'falling']);

// ---------- 狀態 ----------
let mode = TEST && !params.has('intro') ? 'playing' : 'title'; // title | intro | playing | inspect | falling | ending | ended
let paused = false;
let overlay = null; // 'pause' | 'journal' | 'help' | null
let raiseHeld = false;
let raiseBlend = 0;
let fall = null;
let fadeTarget = 0;
let fade = 0;
let preFall = null; // 記憶崩散中（還撐得住），{ reason }
let spiritOffReason = 'manual';
const journal = new Map();
const shownHints = new Set();
const seenShots = new Set();
const progress = {
  revealed: new Set(),
  revealedAt: {},
  usedSpirit: false,
  firstSpiritAt: null,
  firstRaiseAt: null,
  firstMoveAt: null,
  firstInteractAt: null,
  nearSteleEye: 0,
  plankCrossedAt: null,
  bridgeAttempts: 0,
  falls: 0,
  fallsOnBridge: 0,
  fallReasons: { wind: 0, manual: 0 },
  relights: 0,
  shutterClosed: false,
  shutterClosedAt: null,
  crossedAt: null,
  crossedWith: null,
  raisedSeconds: 0,
  spiritSeconds: 0,
  interactions: 0,
  invalidInteractions: 0,
  pathFailures: 0,
  cameraToggles: 0,
  cameraOrbits: 0,
  hints: [],
  log: [],
};
const note = (event) => progress.log.push({ t: +clock.play.toFixed(1), event });

// ---------- 音效（全部即時合成） ----------
const sfx = {
  gust: () => audio.noise({ duration: 3.2, type: 'bandpass', freq: 380, q: 0.7, gain: 0.04 + 0.16 * world.shutterOpen01, attack: 0.8, sweepTo: 900 }),
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
  crumble: () => [0, 0.12, 0.25].forEach((at) => audio.tone({ freq: 1200 - at * 1600, duration: 0.25, type: 'triangle', gain: 0.05, at })),
  ratchet: () => audio.noise({ duration: 0.025, type: 'highpass', freq: 3200, gain: 0.09 }),
  creak: () => audio.noise({ duration: 0.35, type: 'bandpass', freq: 240, q: 6, gain: 0.07 }),
  lamp: () => [523, 659, 784, 1047].forEach((f, i) => audio.pluck({ bus: 'sfx', freq: f, duration: 2, gain: 0.12, at: i * 0.18 })),
  step: (surface) => {
    if (surface === 'memory') audio.tone({ freq: 880 + Math.random() * 220, duration: 0.14, type: 'triangle', gain: 0.025 });
    else if (surface === 'wood') audio.tone({ freq: 140 + Math.random() * 30, duration: 0.07, type: 'triangle', gain: 0.05 });
    else audio.noise({ duration: 0.05, freq: 1100, gain: 0.035 });
  },
};
player.onStep = () => {
  const p = player.position;
  const surface = world.memorySolid && onMemory(p.x, p.z) ? 'memory' : Math.abs(p.x) < 0.9 && p.z < L.ravine.maxZ + 0.5 && p.z > L.ravine.minZ - 0.5 ? 'wood' : 'ground';
  sfx.step(surface);
};

// ---------- 介面 ----------
let captionTimer = 0;
function caption(text, seconds = 4.5) {
  const el = $('caption');
  el.textContent = text;
  el.hidden = false;
  captionTimer = seconds;
}
let tipTimer = 0;
function tip(text, seconds = 10) {
  const el = $('tip');
  el.textContent = text;
  el.hidden = false;
  tipTimer = seconds;
}
let objectiveTimer = 0;
let objectiveText = '';
function setObjective(text) {
  if (text === objectiveText) return;
  objectiveText = text;
  $('objective').textContent = text;
  $('objective').classList.remove('faded');
  objectiveTimer = 6;
}
const keyLabel = (k, t) => (touch ? t : k);

function addJournal(id, entry) {
  if (journal.has(id)) return false;
  journal.set(id, { ...entry, t: clock.play });
  $('btn-journal').classList.add('new');
  note(`journal-${id}`);
  return true;
}
function renderJournal() {
  const list = $('journal-list');
  list.replaceChildren();
  if (!journal.size) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '還沒有記下任何線索。';
    list.append(li);
  }
  for (const [, e] of journal) {
    const li = document.createElement('li');
    if (e.img) {
      const img = document.createElement('img');
      img.src = e.img;
      img.alt = e.title;
      li.append(img);
    }
    const div = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = e.title;
    const p = document.createElement('p');
    p.textContent = e.text;
    div.append(h, p);
    li.append(div);
    list.append(li);
  }
  $('journal-objective').textContent = objectiveText;
  $('btn-journal').classList.remove('new');
}

function openOverlay(which) {
  if (mode === 'title') return;
  if (overlay === which) return closeOverlay();
  overlay = which;
  paused = true;
  setRaise(false);
  input.clear(true);
  for (const id of ['pause', 'journal', 'help']) $(id).hidden = id !== which;
  if (which === 'journal') renderJournal();
  if (which === 'pause') syncSettingsUi();
  note(`overlay-${which}`);
}
function closeOverlay() {
  overlay = null;
  for (const id of ['pause', 'journal', 'help']) $(id).hidden = true;
  paused = false;
  last = performance.now();
}

// ---------- 導航 ----------
function rebuildNav() {
  nav = new NavGrid(L.bounds, world.colliders);
  player.nav = nav;
  // 正在走的路徑如果穿過已經不能走的地方，重新規劃
  if (player.target && player.finalPoint) {
    const dest = player.finalPoint.clone();
    const cbA = player.onArrive;
    const cbF = player.onFail;
    const res = player.walkTo(dest, cbA, player.arriveDist, cbF);
    if (!res.ok) {
      player.stop();
      caption('路斷了，停下來了。', 2.5);
    }
  }
}

// ---------- 燈籠與靈視 ----------
function setRaise(on) {
  raiseHeld = on;
}
function toggleSpirit() {
  if (mode !== 'playing' || ic.controlsLocked || preFall) return;
  if (!lantern.toggleSpirit()) {
    caption('燈籠熄了，看不到月亮的另一面。');
    sfx.deny();
    return;
  }
  const origin = player.model.lantern.getWorldPosition(new Vector3());
  world.setSpirit(lantern.spirit, origin);
  sfx.spirit(lantern.spirit);
  note(lantern.spirit ? 'spirit-on' : 'spirit-off');
  if (lantern.spirit) {
    world.burst('memory', origin);
    if (!progress.usedSpirit) {
      progress.usedSpirit = true;
      progress.firstSpiritAt = clock.play;
      caption('燈籠照出了月亮另一面的東西。發著青光的，是過去還在的東西。', 6);
      addJournal('spirit', { title: '月亮的另一面', text: '舉著燈籠看「月亮的另一面」，過去存在的東西會變成實體。燈一熄就看不到了。' });
    }
  } else {
    spiritOffReason = 'manual';
  }
}

function startPreFall(reason) {
  if (preFall || mode === 'falling') return;
  preFall = { reason };
  ic.interrupt('fall');
  player.stop();
  player.play('startle').catch(() => {});
  sfx.crumble();
  caption(reason === 'wind' ? '燈火熄了——腳下的橋在散開！' : '腳下的橋在散開！', 2);
}

function startFall(reason) {
  const p = player.position;
  preFall = null;
  mode = 'falling';
  progress.falls++;
  progress.fallReasons[reason] = (progress.fallReasons[reason] ?? 0) + 1;
  if (inBridgeGap(p.x, p.z)) progress.fallsOnBridge++;
  const to = inTrench(p.x, p.z) ? L.safeTrench : L.safeSouth;
  fall = { t: 0, y: player.object.position.y, to, reason, hold: player.hold('Fall') };
  sfx.fall();
  note(`fall-${reason}`);
  // 恢復鏡頭：停在原地看著角色掉下去
  const fixed = camera.position.clone();
  director.play({ kind: 'recovery', blendIn: 0.15, lockInput: true, pose: (t, o) => o.pos.copy(fixed) && o.look.copy(player.object.position).setY(player.object.position.y + 0.6) && (o.fov = director.pose.fov) });
}

function finishFall() {
  const f = fall;
  fall = null;
  f.hold.stop();
  player.object.position.y = 0;
  // 面向橋：南橋頭面北、溝邊平台面西
  const yaw = f.to === L.safeTrench ? -Math.PI / 2 : Math.PI;
  player.setPosition(f.to.x, f.to.z, yaw);
  if (lantern.spirit) lantern.spirit = false;
  world.setSpirit(false);
  director.follow(player.position, new Vector3(), true);
  director.end('recovery', { blend: 0, yaw: yaw + Math.PI });
  director.snap();
  mode = 'playing';
  player.act('Recover', { cancelable: true }).catch(() => {});
  const extra = !lantern.lit ? '火盆的火還燒著，可以重新點燈。' : '燈還亮著。';
  caption(`${FALL_REASONS[f.reason]}${extra}`, 5);
  if (f.reason === 'wind' && progress.fallReasons.wind === 1) addJournal('wind', { title: '峽谷的風', text: '峽谷的風一陣一陣地吹。陣風來之前，火盆的煙會先往西倒，草也會先伏下去。' });
  fadeTarget = 0;
}

// ---------- 互動 ----------
const ic = new InteractionController({
  position: () => player.position,
  walkTo: (pt, onArrive, onFail) => player.walkTo(new Vector3(pt.x, 0, pt.z), onArrive, 0.18, onFail),
  stopWalking: () => player.stop(),
  face: (pt) => player.faceTowards(new Vector3(pt.x, 0, pt.z)),
  yawError: (pt) => angleDelta(player.yaw, Math.atan2(pt.x - player.position.x, pt.z - player.position.z)),
  onFinish: (r) => {
    note(`interact-${r.id}-${r.result}${r.reason ? `-${r.reason}` : ''}`);
    if (r.result === 'failed' && r.reason === 'unreachable') {
      progress.pathFailures++;
      caption(world.memorySolid ? '走不到那裡。' : '走不到那裡——中間隔著深谷。', 2.5);
    }
  },
});

const tmpV = new Vector3();
const tmpW = new Vector3();
/** 鏡頭構圖：從 a 平滑走向 b（演出內部用的阻尼） */
function chase(state, pos, look, fov, dt, rate = 3) {
  if (!state.pos) {
    state.pos = pos.clone();
    state.look = look.clone();
    state.fov = fov;
  }
  const k = damp(rate, dt);
  state.pos.lerp(pos, k);
  state.look.lerp(look, k);
  state.fov += (fov - state.fov) * k;
}
function actionShot(build, { rate = 3, blendIn = 0.6 } = {}) {
  const st = {};
  let lastT = 0;
  return director.play({
    kind: 'action',
    blendIn,
    blendOut: 0.6,
    pose: (t, o) => {
      const dt = t - lastT;
      lastT = t;
      const w = build(t);
      chase(st, w.pos, w.look, w.fov, dt || 1 / 60, rate);
      o.pos.copy(st.pos);
      o.look.copy(st.look);
      o.fov = st.fov;
    },
  });
}

function defFor(id) {
  const it = world.interactables().find((x) => x.id === id);
  const base = { id, stand: it.stand, face: it.face, approachDist: 0.3 };
  if (id === 'brazier') {
    if (lantern.lit) {
      return {
        ...base,
        engage: (c) => {
          const b = world.brazier.group.position;
          actionShot(() => ({ pos: tmpV.set(b.x + 2.2, 2.4, b.z + 3.4).clone(), look: tmpW.set(b.x - 1.5, 1.4, b.z - 1.2).clone(), fov: 46 }));
          player.act('Inspect', { events: { look: () => (c.looked = true) } }).finally(() => (c.done = true));
        },
        contact: (c) => c.looked,
        onCommit: () => caption(world.canyonWind > 0.4 ? '煙被吹得往西倒——峽谷正颳著風。' : world.shutterClosed ? '煙直直地往上飄，峽谷裡幾乎沒有風。' : '火盆燒得很旺。煙一陣一陣地被吹向西邊，又直直地飄起來。', 5),
        recover: (c) => c.done,
        cleanup: () => director.end('action'),
      };
    }
    return {
      ...base,
      engage: (c) => {
        const b = world.brazier.group.position;
        actionShot(() => ({ pos: tmpV.set(b.x + 1.8, 1.5, b.z + 2.6).clone(), look: tmpW.set(b.x, 0.95, b.z + 0.4).clone(), fov: 42 }), { rate: 4 });
        const fire = b.clone().setY(1.0);
        player.act('LightLantern', {
          hand: { R: { target: fire.clone().lerp(player.position.clone().setY(1.0), 0.35), weight: 1, envelope: [0.1, 0.36, 0.62, 0.92] } },
          look: fire,
          events: { ignite: () => (c.ignited = true) },
        }).finally(() => (c.done = true));
      },
      contact: (c) => c.ignited || c.done,
      onCommit: () => {
        // 點火：火焰從小火苗長大（火力由規則的恢復速度自然長回來）
        lantern.ignite();
        lantern.heat = 0.12;
        sfx.relight();
        world.burst('ignite', player.model.lantern.getWorldPosition(new Vector3()));
        progress.relights++;
        note('relight');
        caption('燈籠重新點亮了。');
      },
      recover: (c) => c.done,
      cleanup: () => director.end('action'),
    };
  }
  if (id === 'winch') {
    const closing = world.gate.open01 > 0.5;
    const first = !seenShots.has('winch');
    return {
      ...base,
      cancelDuringCommit: true,
      engage: (c) => {
        c.ik = 0;
        c.hold = player.hold('CrankWell', { timeScale: GATE.crankSpeed / (Math.PI * 2) });
        c.lastClick = world.gate.crank;
        const wp = world.winch.group.position;
        sfx.creak();
        c.shot = actionShot((t) => {
          const p = c.progress ?? 0;
          if (first && p < 0.3) return { pos: new Vector3(wp.x - 0.6, 2.0, wp.z - 2.9), look: new Vector3(wp.x - 0.65, 0.95, wp.z - 0.3), fov: 46 };
          if (first && p < 0.85) return { pos: new Vector3(1.6, 3.6, 5.2), look: new Vector3(L.shutterX, 2.6, -0.6), fov: 50 };
          if (first) return { pos: new Vector3(5.4, 4.2, 8.2), look: new Vector3(-2.2, 1.2, 1.5), fov: 54 };
          return { pos: new Vector3(3.6, 3.2, 8.4), look: new Vector3(7.2, 2.4, 1.6), fov: 50 };
        }, { rate: first ? 2.4 : 3.5 });
      },
      // 接觸：左手 IK 移到握把，誤差夠小才開始轉
      contact: (c, dt) => {
        c.ik = Math.min(1, c.ik + dt / 0.35);
        return c.ik >= 1;
      },
      commit: (c, dt) => {
        const step = GATE.crankSpeed * dt * (closing ? 1 : -1);
        world.gate.turn(step);
        if (Math.abs(world.gate.crank - c.lastClick) > 0.5) {
          c.lastClick = world.gate.crank;
          sfx.ratchet();
        }
        c.progress = closing ? 1 - world.gate.open01 : world.gate.open01;
        return c.progress;
      },
      onCommit: () => {
        seenShots.add('winch');
        world.gate.settle();
        progress.shutterClosed = world.shutterClosed;
        if (closing && progress.shutterClosedAt === null) progress.shutterClosedAt = clock.play;
        note(closing ? 'gate-close' : 'gate-open');
        caption(closing ? '擋板降下來，擋住了峽谷。風聲小了。' : '擋板拉上去了，峽谷的風又灌了進來。');
        if (closing) addJournal('gate', { title: '擋風閘門', text: '轉動絞盤，峽谷東邊的擋板會降下來。擋板越低，吹進峽谷的風越弱。' });
      },
      recover: (c, dt) => {
        c.ik = Math.max(0, c.ik - dt / 0.3);
        return c.ik <= 0;
      },
      cleanup: (c, result) => {
        c.hold?.stop();
        world.gate.settle();
        player.animator.handTargets = {};
        director.end('action');
        if (result === 'cancel') {
          seenShots.add('winch');
          caption(`停手了：擋板停在${Math.round((1 - world.gate.open01) * 100)}%的位置。`, 3);
        }
      },
      updateIk: (c) => {
        player.animator.handTargets = { L: { target: world.winch.handleWorld(new Vector3()), weight: c.ik ?? 0 } };
      },
    };
  }
  if (id.startsWith('stele')) {
    const s = world.steles.find((x) => x.id === id);
    return {
      ...base,
      approachDist: 0.45,
      engage: (c) => {
        mode = 'inspect';
        inspect.stele = s;
        inspect.u = 0.5;
        inspect.v = 0.55;
        inspect.yaw = 0;
        inspect.pitch = 0;
        inspect.zoom = 1;
        inspect.exit = false;
        inspect.dimNoted = false;
        if (s.seen) s.revealAll();
        $('inspect-ui').hidden = false;
        director.play({ kind: 'inspect', blendIn: 0.7, blendOut: 0.6, lockInput: true, pose: inspectPose, orbit: (dx, dy) => {
          inspect.yaw = Math.max(-0.45, Math.min(0.45, inspect.yaw - dx * 0.004));
          inspect.pitch = Math.max(-0.2, Math.min(0.3, inspect.pitch + dy * 0.003));
        }, zoomBy: (d) => {
          inspect.zoom = Math.max(0.7, Math.min(1.35, inspect.zoom * (1 + d * 1.5)));
        } });
        note(`inspect-${id}`);
        c.ok = true;
      },
      commit: () => (inspect.exit ? 1 : 0),
      cleanup: () => {
        inspect.stele = null;
        $('inspect-ui').hidden = true;
        director.end('inspect');
        player.animator.handTargets = {};
        if (mode === 'inspect') mode = 'playing';
      },
    };
  }
  if (id === 'lamp') {
    return {
      ...base,
      engage: (c) => {
        if (!lantern.lit) {
          c.fail = true;
          return;
        }
        const lp = world.lamp.group.position;
        actionShot(() => ({ pos: new Vector3(lp.x + 2.3, 1.7, lp.z + 2.6), look: new Vector3(lp.x, 1.35, lp.z + 0.3), fov: 40 }), { rate: 3 });
        const fire = world.lamp.group.localToWorld(new Vector3(0, world.lamp.fireY + 0.1, 0));
        player.act('LightLantern', {
          hand: { R: { target: fire.clone().lerp(player.position.clone().setY(fire.y), 0.3), weight: 1, envelope: [0.1, 0.36, 0.62, 0.92] } },
          look: fire,
          events: { ignite: () => (c.ignited = true) },
        }).finally(() => (c.done = true));
      },
      contact: (c) => c.fail || c.ignited || c.done,
      onCommit: (c) => {
        if (c.fail) {
          caption('燈籠的火熄了，沒辦法點燈。先回火盆點燈吧。', 4);
          sfx.deny();
          return;
        }
        world.lamp.setLit(true);
        sfx.lamp();
        note('lamp');
        c.finished = true;
      },
      recover: (c) => c.fail || c.done,
      cleanup: (c, result) => {
        if (result === 'complete' && c.finished) startEnding();
        else director.end('action');
      },
    };
  }
  return null;
}

function nearestInteractable() {
  const p = player.position;
  let best = null;
  for (const it of world.interactables()) {
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (d < it.radius && (!best || d < best.d)) best = { ...it, d };
  }
  return best;
}
function promptLabel(it) {
  return (
    {
      brazier: lantern.lit ? '看看 火盆' : '點燈',
      winch: world.gate.open01 > 0.5 ? '轉動絞盤（降下擋板）' : '轉動絞盤（拉起擋板）',
      lamp: world.lamp.lit ? '石燈' : '點亮 石燈',
    }[it.id] ?? `調查 ${it.label}`
  );
}

function interact(targetId = null) {
  if (mode === 'inspect') {
    inspect.exit = true;
    return;
  }
  if (mode !== 'playing' || ic.busy || preFall) return;
  const it = targetId ? world.interactables().find((x) => x.id === targetId) : nearestInteractable();
  if (!it) {
    progress.invalidInteractions++;
    caption('附近沒有可以互動的東西。', 2);
    return;
  }
  const def = defFor(it.id);
  if (!def) return;
  progress.interactions++;
  if (progress.firstInteractAt === null) progress.firstInteractAt = clock.play;
  ic.start(def, {});
}

// ---------- 石碑調查 ----------
const inspect = { stele: null, u: 0.5, v: 0.5, yaw: 0, pitch: 0, zoom: 1, exit: false };
/** 照過刻紋筆畫的六成就算看懂了（剩下的自動浮現）：要參與，但不用把每個角落都掃到 */
const REVEAL_COVERAGE = 0.6;
function steleFrame(s) {
  const center = s.group.localToWorld(s.carveCenter.clone());
  const normal = new Vector3(0, 0, 1).applyQuaternion(s.group.quaternion);
  const side = new Vector3(normal.z, 0, -normal.x); // 右手邊
  return { center, normal, side };
}
function inspectPose(t, o) {
  const s = inspect.stele;
  if (!s) return;
  const { center, normal, side } = steleFrame(s);
  const dist = 2.9 * inspect.zoom * (1 + 0.35 * (director.portraitFactor - 1));
  const dir = normal.clone().multiplyScalar(Math.cos(inspect.yaw)).addScaledVector(side, Math.sin(inspect.yaw));
  // 越過右肩看石碑：角色站在石碑左前方，鏡頭在右後上方，頭不會擋住刻紋
  o.pos.copy(center).addScaledVector(dir, dist).addScaledVector(side, 1.35).add(new Vector3(0, 0.9 + inspect.pitch * 2, 0));
  o.look.copy(center).addScaledVector(side, 0.12).add(new Vector3(0, -0.1, 0));
  o.fov = 40 + 6 * (director.portraitFactor - 1);
}
function updateInspect(dt, v) {
  const s = inspect.stele;
  if (!s) return;
  if (v && Math.hypot(v.x, v.y) > 0.05) {
    inspect.u = Math.max(0.05, Math.min(0.95, inspect.u + v.x * dt * 0.65));
    inspect.v = Math.max(0.05, Math.min(0.95, inspect.v - v.y * dt * 0.65));
  }
  const { center, normal, side } = steleFrame(s);
  const spot = center.clone().addScaledVector(side, (inspect.u - 0.5) * 1.0).add(new Vector3(0, (0.5 - inspect.v) * 1.0, 0));
  // 右手把燈籠舉到光點前方：燈真的照在石面上
  const handTarget = spot.clone().addScaledVector(normal, 0.42).add(new Vector3(0, 0.12, 0));
  player.animator.handTargets = { R: { target: handTarget, weight: Math.max(0.35, raiseBlend) } };
  player.animator.lookTarget = spot;
  const lit = lantern.lit;
  if (lit && lantern.raised) {
    s.reveal(inspect.u, inspect.v, 0.2, dt * 3.2);
  } else if (!inspect.dimNoted && clock.presentation > 0) {
    inspect.dimNoted = true;
    caption(lit ? `刻痕太淺了，光不夠亮。（${keyLabel('按住 F', '按「舉燈」')} 把燈籠舉近）` : '燈籠熄了，什麼也看不清楚。', 4);
  }
  s.coverageNow = s.coverage();
  s.glow = lit ? 0.35 + 1.4 * raiseBlend : 0.15;
  if (!s.seen && s.coverageNow > REVEAL_COVERAGE) steleRevealed(s);
}
function steleRevealed(s) {
  s.seen = true;
  s.revealAll();
  progress.revealed.add(s.id);
  progress.revealedAt[s.id] = clock.play;
  sfx.reveal();
  world.burst('reveal', s.group.localToWorld(s.carveCenter.clone()));
  note(`reveal-${s.id}`);
  if (s.picture === 'eye') {
    caption('石碑上浮現一隻眼睛，瞳孔是一彎新月。', 6);
    addJournal('stele-eye', { title: '石碑：眼', img: s.pictogramDataUrl(), text: '一隻眼睛，瞳孔是一彎新月。——像是在說：用燈籠看看「月亮的另一面」。' });
  } else {
    caption('上面：橋上的燈被風吹熄。下面：擋板降下，燈火直直地燒。', 7);
    addJournal('stele-wind', { title: '石碑：風', img: s.pictogramDataUrl(), text: '上：橋上的燈被風吹熄。下：擋板降下來，燈火直直地燒著。' });
  }
}

// ---------- 開場與結局 ----------
function cinematicPath(keys) {
  return (t, o) => {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    if (b.cut) {
      // 硬切之前停在前一個鏡頭（不會往下一個鏡頭的位置滑一格）
      const h = t >= b.t ? b : a;
      o.pos.set(...h.pos);
      o.look.set(...h.look);
      o.fov = h.fov;
      return;
    }
    const k = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    const e = k * k * (3 - 2 * k);
    o.pos.set(...a.pos).lerp(tmpV.set(...b.pos), e);
    o.look.set(...a.look).lerp(tmpW.set(...b.look), e);
    o.fov = a.fov + (b.fov - a.fov) * e;
  };
}
const INTRO = [
  { t: 0, pos: [10, 8.5, 19], look: [0, 0.5, -3], fov: 50 },
  { t: 3.6, pos: [3.5, 4.6, 6.4], look: [0, 1.4, -10], fov: 42 },
  { t: 6.6, pos: [1.2, 2.8, -4.6], look: [0, 1.3, -11], fov: 36 },
  { t: 6.61, pos: [4.2, 1.7, 19], look: [1.5, 1.05, 15.2], fov: 44, cut: true },
  { t: 10, pos: [3.4, 2.2, 18.4], look: [1.5, 1.0, 14.6], fov: 46 },
];
const INTRO_LINES = [
  [0.4, '月亮被偷走的那一夜，山寺小殿前的石燈也熄了。'],
  [3.8, '要點亮山寺的석등（石燈），得先過這座斷了的橋。'],
  [6.9, '提燈的孩子來到了峽谷邊。'],
];
let introLine = 0;
function startIntro() {
  mode = 'intro';
  $('title').hidden = true;
  document.body.classList.remove('title-screen');
  document.body.classList.add('cinematic');
  sound.start();
  player.setPosition(L.start.x, L.start.z + 1.9, Math.PI);
  introLine = 0;
  director.play({ kind: 'cinematic', blendIn: 0, lockInput: true, duration: 10, pose: cinematicPath(INTRO), onEnd: () => endIntro(false) });
  note('intro-start');
}
function endIntro(skipped) {
  if (mode !== 'intro') return;
  mode = 'playing';
  document.body.classList.remove('cinematic');
  if (director.shot?.kind === 'cinematic') director.end('cinematic', { blend: 0.9, yaw: 0 });
  player.stop();
  if (skipped) player.setPosition(L.start.x, L.start.z, Math.PI);
  director.yaw = 0;
  director.follow(player.position, null, true);
  caption('', 0.01);
  setObjective('到峽谷對面，點亮山寺的石燈');
  tip(touch ? '左下搖桿移動、右邊滑動轉鏡頭；靠近東西時會出現「互動」。' : 'WASD 移動（Shift 跑）、拖曳滑鼠轉鏡頭、滾輪縮放；靠近東西時按 E。', 7);
  note(skipped ? 'intro-skip' : 'intro-end');
}

const ENDING = () => {
  const lp = world.lamp.group.position;
  return [
    { t: 0, pos: [lp.x + 2.3, 1.7, lp.z + 2.6], look: [lp.x, 1.35, lp.z + 0.3], fov: 40 },
    { t: 2.2, pos: [lp.x + 3.6, 2.4, lp.z + 3.4], look: [0, 1.8, -12.6], fov: 44 },
    { t: 5.2, pos: [4.8, 4.6, -3.6], look: [0, 2.6, -12.4], fov: 46 },
    { t: 8.4, pos: [2.6, 7.2, 7.5], look: [-0.5, 0.6, -6], fov: 52 },
  ];
};
let endingT = 0;
function startEnding() {
  mode = 'ending';
  endingT = 0;
  document.body.classList.add('cinematic');
  sound.setMood('ending');
  setObjective('');
  // 直接從點燈的動作鏡頭接到結局鏡頭（不先回到自由鏡頭，避免跳一下）
  director.play({ kind: 'cinematic', blendIn: 0.8, lockInput: true, duration: FAST_ENDING ? 0.5 : 8.6, pose: cinematicPath(ENDING()), onEnd: () => showEnd() });
  note('ending');
}
function updateEnding(dt) {
  endingT += dt;
  const sh = world.shrine;
  // 石燈 → 山寺裡面 → 屋簷下的燈籠一盞一盞亮起來
  sh.inner.intensity = Math.min(5, Math.max(0, endingT - 1.5) * 2.5);
  sh.latMat.emissiveIntensity = Math.min(0.9, Math.max(0, endingT - 1.8) * 0.5);
  for (const [i, h] of sh.hanging.entries()) {
    const k = Math.max(0, Math.min(1, (endingT - 2.4 - i * 0.55) * 1.5));
    h.light.intensity = k * 3.5;
    for (const m of h.mats) m.emissiveIntensity = k * 1.4;
  }
  world.moon.userData.halo.material.opacity = Math.min(1, 0.45 + endingT * 0.06);
}
function showEnd() {
  mode = 'ended';
  document.body.classList.remove('cinematic');
  const p = progress;
  const fmt = (s) => (s == null ? '—' : `${Math.floor(s / 60)} 分 ${String(Math.round(s % 60)).padStart(2, '0')} 秒`);
  const rows = [
    ['遊玩時間', fmt(clock.play)],
    ['第一次舉燈', fmt(p.firstRaiseAt)],
    ['第一次靈視', fmt(p.firstSpiritAt)],
    ['過橋方式', p.crossedWith === 'gate' ? '降下擋板' : p.crossedWith === 'partial' ? '擋板降一半＋看時機' : p.crossedWith === 'timing' ? '看準風停的時機' : '—'],
    ['掉下去', `${p.falls} 次（風 ${p.fallReasons.wind}、自己收起靈視 ${p.fallReasons.manual}）`],
    ['重新點燈', `${p.relights} 次`],
    ['看到的提示', p.hints.length ? p.hints.map((h) => h.id).join('、') : '沒有'],
    ['記下的線索', `${journal.size} 條`],
  ];
  $('end-stats').innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
  $('end').hidden = false;
  note('end');
}

// ---------- 輸入 ----------
bus.on('input:action', () => {
  if (overlay) return;
  if (mode === 'intro') return endIntro(true);
  interact();
});
bus.on('input:zoom', (d) => !paused && director.zoomBy(d));
bus.on('input:cameraView', () => toggleView());
bus.on('input:journal', () => openOverlay('journal'));
bus.on('input:escape', () => {
  if (overlay) return closeOverlay();
  if (mode === 'intro') return endIntro(true);
  if (mode === 'inspect') {
    inspect.exit = true;
    return;
  }
  if (mode === 'ending') return director.end('cinematic', { blend: 0 });
  openOverlay('pause');
});
function toggleView() {
  if (mode !== 'playing' || paused) return;
  director.toggleUserMode();
  progress.cameraToggles++;
  $('btn-view').textContent = director.userMode === 'third' ? '遠景' : '近景';
  note(`view-${director.userMode}`);
}
const raiseMode = () => settings.get('raiseMode');
addEventListener('keydown', (e) => {
  sound.start();
  if (e.repeat || paused) return;
  if (e.code === 'KeyF') setRaise(raiseMode() === 'toggle' ? !raiseHeld : true);
  if (e.code === 'KeyQ') toggleSpirit();
  if (e.code === 'KeyC' && mode === 'playing') director.recenter(player.yaw);
  if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) startIntro();
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyF' && raiseMode() === 'hold') setRaise(false);
});
// 失焦或切換 App：清掉所有按住的輸入（角色不會自己一直走），遊玩中自動暫停
const onHidden = () => {
  setRaise(false);
  input.clear(true);
  if (PLAY_MODES.has(mode) && !overlay && !TEST) openOverlay('pause');
};
addEventListener('blur', onHidden);
document.addEventListener('visibilitychange', () => document.hidden && onHidden());
addEventListener('pointerdown', () => sound.start(), { capture: true });

// 手機按鈕：Pointer Capture，手指滑出按鈕不會意外取消
function holdButton(el, onDown, onUp) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    onDown();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => onUp());
}
holdButton(
  $('btn-raise'),
  () => setRaise(raiseMode() === 'toggle' ? !raiseHeld : true),
  () => raiseMode() === 'hold' && setRaise(false),
);
$('btn-spirit').addEventListener('click', () => toggleSpirit());
$('prompt').addEventListener('click', () => interact());
$('btn-exit-inspect').addEventListener('click', () => (inspect.exit = true));
$('btn-view').addEventListener('click', () => toggleView());
$('btn-center').addEventListener('click', () => mode === 'playing' && director.recenter(player.yaw));
$('btn-journal').addEventListener('click', () => openOverlay('journal'));
$('btn-pause').addEventListener('click', () => openOverlay('pause'));
$('btn-skip').addEventListener('click', () => (mode === 'intro' ? endIntro(true) : mode === 'ending' ? director.end('cinematic', { blend: 0 }) : null));
$('btn-start').addEventListener('click', () => startIntro());
$('btn-resume').addEventListener('click', () => closeOverlay());
$('btn-help').addEventListener('click', () => openOverlay('help'));
$('btn-help-back').addEventListener('click', () => openOverlay('pause'));
$('btn-journal-close').addEventListener('click', () => closeOverlay());
$('btn-restart').addEventListener('click', () => location.reload());
$('btn-again').addEventListener('click', () => location.reload());

// 設定（暫停選單裡）
function syncSettingsUi() {
  for (const el of document.querySelectorAll('[data-setting]')) {
    const key = el.dataset.setting;
    const v = settings.get(key);
    if (el.type === 'range') el.value = String(v);
    else if (el.tagName === 'SELECT') el.value = String(v);
    else if (el.type === 'checkbox') el.checked = !!v;
  }
}
for (const el of document.querySelectorAll('[data-setting]')) {
  el.addEventListener('input', () => {
    const key = el.dataset.setting;
    const v = el.type === 'range' ? Number(el.value) : el.type === 'checkbox' ? el.checked : el.value;
    settings.set(key, v);
  });
}
bus.on('settings:change', ({ key, value }) => {
  if (['quality', 'bloom', 'pixelRatio'].includes(key)) applyRender();
  if (key.endsWith('Volume')) audio.applyVolumes();
  if (key === 'reduceMotion') director.reduceMotion = value;
  if (key === 'raiseMode') setRaise(false);
});

// 鏡頭：拖曳旋轉（滑鼠任一鍵、手指單指），點一下是移動／互動
const drag = { id: null, x: 0, y: 0, moved: false, pointers: new Set() };
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  drag.pointers.add(e.pointerId);
  if (drag.id === null) Object.assign(drag, { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false });
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== drag.id || drag.pointers.size > 1 || paused) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 12) return;
  if (!drag.moved) progress.cameraOrbits++;
  drag.moved = true;
  director.orbit(dx * (touch ? 1.3 : 1), dy * (touch ? 1.3 : 1));
  drag.x = e.clientX;
  drag.y = e.clientY;
});
for (const ev of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(ev, (e) => {
    drag.pointers.delete(e.pointerId);
    if (e.pointerId === drag.id) drag.id = null;
  });
}

// 點擊：先看有沒有點到互動物件，再看實際可以走的地面（不是固定的 y=0 平面）
const raycaster = new Raycaster();
bus.on('input:tap', ({ x, y }) => {
  if (mode !== 'playing' || paused || ic.controlsLocked || preFall) return;
  raycaster.setFromCamera(new Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const hitsI = raycaster.intersectObjects([...world.interactMeshes.keys()], false);
  if (hitsI.length) {
    const id = world.interactMeshes.get(hitsI[0].object);
    note(`tap-interact-${id}`);
    return interact(id);
  }
  const walk = world.walkables.filter((m) => !m.userData.memory || world.memorySolid);
  const hits = raycaster.intersectObjects(walk, false);
  if (!hits.length) {
    // 點到深谷或天空
    const planeHit = raycaster.ray.origin.y > 0 ? raycaster.ray.at(-raycaster.ray.origin.y / raycaster.ray.direction.y, new Vector3()) : null;
    if (planeHit && (inRavine(planeHit.x, planeHit.z) || inTrench(planeHit.x, planeHit.z))) caption(world.memorySolid ? '那裡沒有東西可以踩。' : '那邊是深谷，走不過去。', 2);
    return;
  }
  const hit = hits[0].point;
  const res = player.walkTo(new Vector3(hit.x, 0, hit.z), null, 0.3, () => caption('走到一半被擋住了。', 2));
  if (!res.ok) {
    progress.pathFailures++;
    caption('這裡走不過去。', 2);
  } else {
    ic.cancel('tap');
    showTapMarker(hit);
  }
});
function showTapMarker(p) {
  world.burst('reveal', { x: p.x, y: 0.05, z: p.z }, { count: 6, life: 0.6, color: 0xf2bd68, spread: 0.1, speed: 0.2, up: 0.3 });
}

// ---------- 每一格 ----------
let lastPhase = 'calm';
let hintTimer = 0;
const wasOn = { bridge: false };
const lastMove = new Vector3();

function updatePlayer(dt, moveOverride) {
  const p = player.position;
  let move = null;
  const v = moveOverride ?? input.moveVector();
  const moving = v && Math.hypot(v.x, v.y) > 0.05;
  director.updateBasis(dt, moving);
  if (mode === 'inspect') {
    updateInspect(dt, v);
    ic.update(dt, { moving: false });
    player.update(dt, null, false);
    return;
  }
  ic.update(dt, { moving: moving && mode === 'playing' });
  const locked = mode !== 'playing' || ic.controlsLocked || director.inputLocked || !!preFall;
  if (moving && !locked) {
    const { forward, right } = director.groundAxes();
    move = { x: forward.x * v.y + right.x * v.x, z: forward.z * v.y + right.z * v.x };
    if (progress.firstMoveAt === null) progress.firstMoveAt = clock.play;
  }
  // 預設是快走，按住 Shift（手機：搖桿推到底）跑
  const run = input.walkHeld || (v && Math.hypot(v.x, v.y) > 0.97 && touch);
  const onMem = world.memorySolid && onMemory(p.x, p.z);
  player.speedLimit = onMem ? MEMORY_WALK_SPEED : run ? 0 : 3.4;
  if (ic.state === 'commit' && ic.def?.updateIk) ic.def.updateIk(ic.ctx);
  else if (ic.busy && ic.def?.updateIk) ic.def.updateIk(ic.ctx);
  else if (!ic.busy && mode === 'playing') {
    // 舉燈：右手把燈籠舉過頭（手部 IK）
    const yaw = player.yaw;
    const t = new Vector3(p.x + Math.sin(yaw) * 0.22, player.object.position.y + 1.42, p.z + Math.cos(yaw) * 0.22);
    player.animator.handTargets = raiseBlend > 0.01 ? { R: { target: t, weight: raiseBlend } } : {};
    player.animator.lookTarget = null;
  }
  player.update(dt, move, false);
  lastMove.set(player.vel.x, 0, player.vel.z);
}

function frame(dtReal, moveOverride = null) {
  clock.real += dtReal;
  const dt = Math.min(dtReal, 0.1); // 視窗恢復時不會因為很大的 dt 讓風、動畫瞬間跳進
  if (paused) {
    renderer.render(scene, camera);
    return;
  }
  clock.presentation += dt;
  if (PLAY_MODES.has(mode)) clock.play += dt;
  const p = player.position;

  // 舉燈（調查時一樣能舉）
  const canRaise = (mode === 'playing' || mode === 'inspect') && lantern.lit && !ic.controlsLocked;
  const raising = raiseHeld && (canRaise || mode === 'inspect');
  raiseBlend += ((raising ? 1 : 0) - raiseBlend) * damp(8, dt);
  lantern.raised = raiseBlend > 0.5;
  if (lantern.raised && progress.firstRaiseAt === null && PLAY_MODES.has(mode)) {
    progress.firstRaiseAt = clock.play;
    note('first-raise');
  }
  if (lantern.raised) progress.raisedSeconds += dt;
  if (lantern.spirit) progress.spiritSeconds += dt;

  // 角色
  if (mode === 'falling' && fall) {
    fall.t += dt;
    player.object.position.y = fall.y - 4.5 * fall.t * fall.t;
    fadeTarget = fall.t > 0.55 ? 1 : 0;
    player.update(dt, null, false);
    if (fall.t > 1.25) finishFall();
  } else if (mode === 'intro') {
    // 開場：角色提燈走進畫面
    const k = Math.min(1, Math.max(0, (director.shot?.t ?? 10) - 6.7) / 3);
    if (k > 0 && k < 1 && !player.target) player.walkTo(new Vector3(L.start.x, 0, L.start.z), null, 0.2);
    player.update(dt, null, false);
  } else updatePlayer(dt, moveOverride);

  // 風與燈火（規則）
  const res0 = world.update(dt, { heat: lantern.heat });
  const g = res0.gust;
  if (g.phase === 'warn' && lastPhase === 'calm' && Math.abs(p.z - (L.ravine.minZ + L.ravine.maxZ) / 2) < 10) sfx.gust();
  lastPhase = g.phase;
  const exposure = mode !== 'falling' && PLAY_MODES.has(mode) ? windExposure(p.x, p.z, world.gate.open01, g.strength) : 0;
  const ev = lantern.update(dt, exposure);
  if (ev.includes('out')) {
    sfx.out();
    world.burst('snuff', player.model.lantern.getWorldPosition(new Vector3()));
    note('lantern-out');
    if (!ev.includes('spiritOff')) caption('風把燈籠吹熄了。');
    setRaise(false);
  }
  if (ev.includes('spiritOff')) {
    world.setSpirit(false);
    spiritOffReason = 'wind';
  }
  // 記憶物件的狀態改變：碰撞與導航跟著重建；站在上面時先崩散，散完才掉
  if (res0.memoryEvent) {
    rebuildNav();
    note(`memory-${res0.memoryEvent}`);
    if (res0.memoryEvent === 'dissolving' && onMemory(p.x, p.z) && mode === 'playing') startPreFall(spiritOffReason);
    if (res0.memoryEvent === 'unstable' && onMemory(p.x, p.z)) caption('橋板在閃——燈火快撐不住了！', 2.5);
  }
  if (preFall && !world.memorySolid) startFall(preFall.reason);
  player.lanternState.heat = lantern.heat;
  player.lanternState.lit = lantern.lit;
  player.lanternState.raised = raiseBlend;

  // 過橋紀錄
  const onBridge = world.memorySolid && inBridgeGap(p.x, p.z);
  if (onBridge && !wasOn.bridge) {
    progress.bridgeAttempts++;
    note(`bridge-attempt-${g.phase}`);
  }
  wasOn.bridge = onBridge;
  if (p.z < L.remnantNorth.maxZ - 0.3 && progress.crossedAt === null && mode === 'playing') {
    progress.crossedAt = clock.play;
    progress.crossedWith = world.shutterClosed ? 'gate' : world.gate.open01 < 0.9 ? 'partial' : 'timing';
    note(`crossed-${progress.crossedWith}`);
    setObjective('點亮山寺的石燈');
  }
  if (world.memorySolid && onPlank(p.x, p.z) && progress.plankCrossedAt === null) progress.plankCrossedAt = clock.play;
  const eye = L.steles[0];
  if (Math.hypot(p.x - eye.x, p.z - eye.z) < 3.6 && !progress.revealed.has('stele-eye')) progress.nearSteleEye += dt;
  for (const s of world.steles) {
    if (s !== inspect.stele) s.glow += ((s.seen ? 0.5 : 0) - s.glow) * damp(3, dt);
    s.update(s.glow);
  }

  // 目標
  if (mode === 'playing' && progress.crossedAt === null) setObjective(!lantern.lit ? '到火盆重新點亮燈籠' : '到峽谷對面，點亮山寺的石燈');

  // 提示：依玩家做過的事，卡住才給
  hintTimer -= dt;
  if (hintTimer <= 0 && mode === 'playing') {
    hintTimer = 0.5;
    const h = nextHint(progress, clock.play, shownHints);
    if (h) {
      shownHints.add(h.id);
      progress.hints.push({ id: h.id, t: +clock.play.toFixed(1) });
      tip(h.text);
    }
  }

  // 鏡頭：過橋輔助（靠近或走在橋上時，構圖轉向橋的方向）
  const nearBridge = Math.abs(p.x) < 2.6 && p.z < L.ravine.maxZ + 2.5 && p.z > L.ravine.minZ - 1.5;
  if (nearBridge && mode === 'playing') {
    const heading = Math.abs(lastMove.z) > 0.3 ? Math.sign(lastMove.z) : player.yaw > Math.PI / 2 || player.yaw < -Math.PI / 2 ? -1 : 1;
    const onSpan = p.z < L.ravine.maxZ && p.z > L.ravine.minZ;
    director.setAssist({ yaw: heading < 0 ? 0 : Math.PI, weight: onSpan ? 1 : 0.45, pitch: director.userMode === 'third' ? 0.12 : -0.12 });
  } else director.setAssist(null);
  director.follow(player.position, lastMove);
  director.update(dt);
  if (mode === 'title') {
    // 標題畫面：鏡頭在峽谷上方緩慢環繞
    const a = clock.presentation * 0.05;
    camera.position.set(Math.sin(a) * 14, 7, 6 + Math.cos(a) * 10);
    camera.lookAt(0, 0, -4);
  }
  if (mode === 'intro') {
    const t = director.shot?.t ?? 0;
    while (introLine < INTRO_LINES.length && t >= INTRO_LINES[introLine][0]) caption(INTRO_LINES[introLine++][1], 3.2);
  }
  if (mode === 'ending') updateEnding(dt);

  // 聲音
  const fireDist = Math.hypot(p.x - L.brazier.x, p.z - L.brazier.z);
  sound.update(dt, { exposure, canyon: world.canyonWind, spirit: world.spiritBlend, fireDist });

  // 介面
  updateHud(dt, exposure, g);
  fade += (fadeTarget - fade) * damp(8, dt);
  $('fade').style.opacity = fade.toFixed(3);

  updatePointScale(world.pointMaterials, renderer.sceneHeight, camera.fov);
  renderer.render(scene, camera);
}

function updateHud(dt, exposure, g) {
  const it = mode === 'playing' && !ic.busy && !preFall ? nearestInteractable() : null;
  const prompt = $('prompt');
  const inspecting = mode === 'inspect';
  // 調查時不顯示互動提示（調查介面自己有「離開」），避免蓋住石碑
  prompt.hidden = !it || inspecting;
  if (it) prompt.textContent = touch ? promptLabel(it) : `[E] ${promptLabel(it)}`;
  const hud = $('lamp');
  hud.style.setProperty('--heat', lantern.heat.toFixed(3));
  hud.classList.toggle('out', !lantern.lit);
  hud.classList.toggle('spirit', lantern.spirit);
  hud.classList.toggle('weak', lantern.lit && lantern.heat < 0.45);
  hud.classList.toggle('windy', exposure > 0.3);
  // 風勢指示（聲音的視覺替代）：靠近峽谷才顯示
  const p = player.position;
  const nearCanyon = p.z < L.ravine.maxZ + 6 && p.z > L.ravine.minZ - 4;
  const w = $('wind');
  w.hidden = !nearCanyon || !PLAY_MODES.has(mode);
  w.dataset.phase = world.canyonWind < 0.3 ? 'calm' : g.phase === 'warn' ? 'warn' : 'gust';
  w.style.setProperty('--wind', world.canyonWind.toFixed(2));
  $('btn-spirit').classList.toggle('on', lantern.spirit);
  $('btn-raise').classList.toggle('on', raiseHeld);
  $('btn-raise').textContent = raiseMode() === 'toggle' ? (raiseHeld ? '放下' : '舉燈') : '舉燈';
  captionTimer -= dt;
  if (captionTimer <= 0) $('caption').hidden = true;
  tipTimer -= dt;
  if (tipTimer <= 0) $('tip').hidden = true;
  objectiveTimer -= dt;
  if (objectiveTimer <= 0) $('objective').classList.add('faded');
  $('inspect-hint').textContent = touch ? '按「舉燈」把燈籠舉近，用搖桿移動光；照過刻紋就會浮現' : '按住 F 舉燈，WASD 移動燈光；照過刻紋就會浮現　E／Esc 離開';
}

let frozen = false;
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  if (!frozen) frame(dt);
  if (!frozen && settings.get('quality') === 'auto' && !qualityParam && PLAY_MODES.has(mode) && !paused && adaptive.update(dt) !== null) applyRender();
});
if (mode === 'playing') {
  $('title').hidden = true;
  setObjective('到峽谷對面，點亮山寺的石燈');
} else document.body.classList.add('title-screen');

// ---------- 測試介面（?test）：只給自動化測試與錄影用 ----------
if (TEST) {
  window.__proto = {
    state: () => ({
      mode,
      paused,
      overlay,
      clock: { ...clock, world: world.time },
      player: { x: player.position.x, z: player.position.z, y: player.object.position.y, yaw: player.yaw },
      lantern: { lit: lantern.lit, heat: lantern.heat, raised: lantern.raised, spirit: lantern.spirit },
      memory: { state: world.memory.state, solid: world.memorySolid, form: world.memory.form },
      gust: gustAt(world.time),
      gate: { open01: world.gate.open01, state: world.gate.state, crank: world.gate.crank },
      shutterClosed: world.shutterClosed,
      lampLit: world.lamp.lit,
      interaction: { state: ic.state, id: ic.def?.id ?? null, last: ic.lastResult },
      inspect: inspect.stele ? { id: inspect.stele.id, coverage: inspect.stele.coverageNow, u: inspect.u, v: inspect.v } : null,
      prompt: $('prompt').hidden ? '' : $('prompt').textContent,
      caption: $('caption').hidden ? '' : $('caption').textContent,
      tip: $('tip').hidden ? '' : $('tip').textContent,
      objective: objectiveText,
      journal: [...journal.keys()],
      steles: world.steles.map((s) => ({ id: s.id, seen: s.seen, coverage: s.coverageNow })),
      camera: director.info(),
      handError: (() => {
        const h = player.model.bones?.['Hand.L'];
        if (!h) return null;
        const a = h.getWorldPosition(new Vector3());
        return a.distanceTo(world.winch.handleWorld(new Vector3()));
      })(),
      render: { ...renderer.layout },
      progress: { ...progress, revealed: [...progress.revealed] },
    }),
    teleport: (x, z, yaw = Math.PI) => {
      player.setPosition(x, z, yaw);
      director.follow(player.position, null, true);
      director.snap();
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
    interact: (id = null) => interact(id),
    setTime: (t) => {
      world.time = t;
    },
    setRender: (quality) => renderer.set({ quality }),
    setView: (v) => director.setUserMode(v, { instant: true }),
    orbit: (dx, dy) => director.orbit(dx, dy),
    setCamera: ({ yaw, pitch } = {}) => {
      if (yaw !== undefined) director.yaw = yaw;
      if (pitch !== undefined) director.pitch = pitch;
    },
    /** 世界座標 → 螢幕座標（CSS px），點擊測試用 */
    project: (x, y, z) => {
      const v = new Vector3(x, y, z).project(camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
    },
    startIntro: () => startIntro(),
    photo: (pos, look) => {
      frozen = true;
      camera.position.set(...pos);
      camera.lookAt(...look);
      updatePointScale(world.pointMaterials, renderer.sceneHeight, camera.fov);
      renderer.render(scene, camera);
    },
  };
}
