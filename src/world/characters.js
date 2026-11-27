import {
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PointLight,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mats } from './materials.js';
import { CharacterAnimator } from './rig/CharacterAnimator.js';
import { addPose, bump, makeClip, timeline } from './rig/clips.js';
import { buildHumanoid, CHILD_SPEC } from './rig/humanoid.js';
import { dokkaebiClips, grandmaClips, playerClips } from './rig/poses.js';
import { createBones, place, SkinBuilder } from './rig/SkinBuilder.js';
import { SpringChain } from './rig/Spring.js';

/**
 * 角色模型：主角、할머니、도깨비 用同一套程序化人形骨架（rig/humanoid.js），黑貓是四足骨架。
 * 每個角色都有 AnimationMixer 驅動的 animator。模型正面朝 +z。
 */

const at = (mesh, x, y, z) => {
  mesh.position.set(x, y, z);
  return mesh;
};

// ---------- 主角：提著청사초롱的孩子 ----------

/** 燈籠（청사초롱）：木框、上藍下紅的紗、內部火焰、流蘇、提把 */
function makeLantern() {
  const pivot = new Group(); // 擺動支點（提把頂端，跟著手）
  pivot.name = 'LanternPivot';
  const body = new Group();
  body.position.y = -0.17;
  pivot.add(body);
  const wood = new MeshLambertMaterial({ color: 0x5a2a1c });
  // 提把：繩子＋半圓提環
  pivot.add(at(new Mesh(new CylinderGeometry(0.004, 0.004, 0.06, 4), mats.black), 0, -0.03, 0));
  const ring = new Mesh(new TorusGeometry(0.03, 0.005, 4, 10, Math.PI), wood);
  ring.position.y = -0.06;
  pivot.add(ring);
  // 上下木蓋與骨架
  body.add(at(new Mesh(new CylinderGeometry(0.07, 0.095, 0.03, 8), wood), 0, 0.12, 0));
  body.add(at(new Mesh(new CylinderGeometry(0.085, 0.07, 0.025, 8), wood), 0, -0.12, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    body.add(at(new Mesh(new CylinderGeometry(0.004, 0.004, 0.23, 3), wood), Math.cos(a) * 0.098, 0, Math.sin(a) * 0.098));
  }
  // 紗面：自己發光（燈火透出來），上藍下紅
  const silk = (color, glow) => new MeshLambertMaterial({ color, emissive: glow, emissiveIntensity: 1.2, side: DoubleSide });
  body.add(at(new Mesh(new CylinderGeometry(0.096, 0.1, 0.085, 12, 1, true), silk(0x3d63c9, 0x2a4fb8)), 0, 0.06, 0));
  body.add(at(new Mesh(new CylinderGeometry(0.1, 0.088, 0.13, 12, 1, true), silk(0xd8402e, 0xff6a32)), 0, -0.045, 0));
  // 流蘇
  const tassel = new Group();
  tassel.position.y = -0.135;
  tassel.add(at(new Mesh(new CylinderGeometry(0.012, 0.022, 0.08, 6), new MeshLambertMaterial({ color: 0xc8283a })), 0, -0.05, 0));
  body.add(tassel);
  // 內部火焰（火焰本體由 Fire 系統畫，這裡只是燭心的亮點）
  const flame = at(new Mesh(new ConeGeometry(0.02, 0.06, 6), new MeshBasicMaterial({ color: 0xffd27a })), 0, -0.02, 0);
  body.add(flame);
  const light = new PointLight(0xffb066, 4.5, 8, 1.3);
  light.position.set(0, -0.02, 0);
  body.add(light);
  return { pivot, body, flame, light, tassel };
}

export function makePlayerModel() {
  const model = buildHumanoid(CHILD_SPEC);
  const lantern = makeLantern();
  model.sockets.R.add(lantern.pivot);
  const animator = new CharacterAnimator(model, playerClips({ lantern: true, pelvisY: CHILD_SPEC.pelvisY }), {
    locomotion: { idle: 'Idle', walk: 'Walk', run: 'Run', walkSpeed: 2.2, runSpeed: 5.2, walkStride: 1.25, runStride: 2.3 },
  });
  return {
    ...model,
    animator,
    lantern: lantern.pivot,
    lanternBody: lantern.body,
    flame: lantern.flame,
    light: lantern.light,
    tassel: lantern.tassel,
    feet: [model.bones['Foot.L'], model.bones['Foot.R']],
    head: model.bones.Head,
  };
}

// ---------- 할머니 ----------

export const GRANDMA_SPEC = {
  name: 'grandma',
  pelvisY: 0.8,
  spineY: 0.93,
  chestY: 1.08,
  neckY: 1.27,
  headY: 1.32,
  headCenter: [0, 1.45, 0.025],
  headR: 0.13,
  shoulderX: 0.2,
  clavicleX: 0.05,
  shoulderY: 1.21,
  elbowY: 0.98,
  wristY: 0.77,
  hipX: 0.09,
  hipY: 0.77,
  kneeY: 0.43,
  ankleY: 0.07,
  footLen: 0.17,
  torso: [
    [0.7, 0.13],
    [0.8, 0.145],
    [0.93, 0.13],
    [1.05, 0.135],
    [1.16, 0.14],
    [1.22, 0.12],
    [1.27, 0.05],
    [1.34, 0.04],
  ],
  torsoScale: [1.12, 0.9],
  arm: { upper: 0.042, fore: 0.037, wrist: 0.028, sleeve: 0.062, cuffY: 0.82, sleeveEnd: 0.8 },
  leg: { thigh: 0.07, knee: 0.05, calf: 0.055, ankle: 0.035 },
  hand: { palm: [0.03, 0.062, 0.05], finger: 0.06, fingerR: 0.009 },
  colors: { skin: 0xe2b896, jacket: 0xd6cfbd, collar: 0x7c7466, dongjeong: 0xf7f4ee, cuff: 0xd6cfbd, skirt: 0x56667e, legs: 0xe8e8ec, shoe: 0x3a3a42, hair: 0xdcdce2, goreum: 0x7a5a3e, lip: 0x9a5060, brow: 0xd4d4da, cheek: 0xc8806e, eye: 0x221a18 },
  skirt: { top: 1.13, hem: 0.05, topR: 0.165, midR: 0.31, hemR: 0.41, pleats: 20, pleatDepth: 0.014, scale: [1.1, 0.95] },
  jacket: { bottom: 1.05, top: 1.27, flare: 0.016 },
  hair: 'bun',
  goreum: true,
  eyeShape: [0.95, 0.55],
};

export function makeGrandmaModel() {
  const model = buildHumanoid(GRANDMA_SPEC, (m) => {
    const head = m.bones.Head;
    const [hx, hy, hz] = GRANDMA_SPEC.headCenter;
    const r = GRANDMA_SPEC.headR;
    const local = (x, y, z) => new Vector3(x, y, z).sub(m.rig.world.Head);
    // 비녀（髮簪）橫穿髮髻
    const pin = new Mesh(new CylinderGeometry(0.008, 0.008, 0.26, 5), new MeshLambertMaterial({ color: 0xd9b24a }));
    pin.rotation.z = Math.PI / 2;
    pin.position.copy(local(hx, hy - r * 0.35, hz - r * 0.98));
    head.add(pin);
    // 皺紋：額頭與眼角的細線
    const line = new MeshLambertMaterial({ color: 0xa8805e });
    for (let i = 0; i < 3; i++) {
      const w = new Mesh(new CapsuleGeometry(0.0025, r * (0.5 - i * 0.08), 2, 3), line);
      w.rotation.z = Math.PI / 2;
      w.position.copy(local(hx, hy + r * (0.42 + i * 0.1), hz + r * 0.9 - i * 0.012));
      head.add(w);
    }
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const w = new Mesh(new CapsuleGeometry(0.002, r * 0.12, 2, 3), line);
        w.rotation.z = Math.PI / 2 + sx * (0.35 - i * 0.6);
        w.position.copy(local(hx + sx * r * 0.62, hy - r * (0.02 + i * 0.1), hz + r * 0.72));
        head.add(w);
      }
    }
  });
  const animator = new CharacterAnimator(model, grandmaClips(), {});
  animator.setBase('Sleep', 0.01);
  return { ...model, animator, head: model.bones.Head, body: model.root, arm: model.bones['Shoulder.L'] };
}

// ---------- 도깨비 ----------

export const DOKKAEBI_SPEC = {
  name: 'dokkaebi',
  pelvisY: 1.15,
  spineY: 1.45,
  chestY: 1.85,
  neckY: 2.18,
  headY: 2.28,
  headCenter: [0, 2.72, 0.1],
  headR: 0.56,
  shoulderX: 0.86,
  clavicleX: 0.22,
  shoulderY: 2.06,
  elbowY: 1.55,
  wristY: 1.08,
  hipX: 0.36,
  hipY: 1.08,
  kneeY: 0.6,
  ankleY: 0.14,
  footLen: 0.45,
  torso: [
    [0.98, 0.5],
    [1.15, 0.62],
    [1.45, 0.7],
    [1.8, 0.72],
    [2.0, 0.7],
    [2.12, 0.56],
    [2.2, 0.3],
    [2.36, 0.28],
  ],
  torsoScale: [1.05, 0.85],
  arm: { upper: 0.19, fore: 0.17, wrist: 0.12, sleeve: 0.2, cuffY: 1.22, sleeveEnd: 1.2 },
  bareArms: true,
  bareChest: true,
  bareLegs: true,
  leg: { thigh: 0.27, knee: 0.18, calf: 0.22, ankle: 0.13 },
  hand: { palm: [0.1, 0.2, 0.2], finger: 0.14, fingerR: 0.038 },
  colors: { skin: 0x4d79c2, jacket: 0x4d79c2, skirt: 0xe0a030, stripe: 0x2a1b10, legs: 0x4d79c2, shoe: 0x3b5d99, hair: 0x15141c, lip: 0x1a1020, eye: 0xfff27a, brow: 0x0f0f16, cuff: 0x4d79c2 },
  skirt: { top: 1.33, hem: 0.74, topR: 0.74, midR: 0.82, hemR: 0.9, pleats: 9, pleatDepth: 0.025, scale: [1.05, 0.92] },
  stripes: true,
  jacket: null,
  hair: 'wild',
  goreum: false,
  belly: { z: 0.36, r: 0.56, h: 0.44 },
  eyeGlow: true,
  eyeShape: [1.05, 1.05],
  mouthWidth: 2.4,
  browWeight: 2.8,
};

export function makeDokkaebiModel() {
  const club = new Group();
  const model = buildHumanoid(DOKKAEBI_SPEC, (m) => {
    const head = m.bones.Head;
    const [hx, hy, hz] = DOKKAEBI_SPEC.headCenter;
    const r = DOKKAEBI_SPEC.headR;
    const local = (x, y, z) => new Vector3(x, y, z).sub(m.rig.world.Head);
    const ivory = new MeshLambertMaterial({ color: 0xf2e6c8 });
    // 獨角
    const horn = new Mesh(new ConeGeometry(0.15, 0.62, 10), ivory);
    horn.position.copy(local(hx, hy + r * 1.15, hz + 0.05));
    horn.rotation.x = 0.15;
    head.add(horn);
    // 獠牙
    for (const sx of [-1, 1]) {
      const tusk = new Mesh(new ConeGeometry(0.05, 0.2, 6), ivory);
      tusk.rotation.x = Math.PI - 0.2;
      tusk.position.copy(local(hx + sx * r * 0.3, hy - r * 0.42, hz + r * 0.92));
      head.add(tusk);
    }
    // 방망이（狼牙棒）握在右手
    club.add(at(new Mesh(new CylinderGeometry(0.26, 0.11, 1.45, 10), mats.wood), 0, 0.62, 0));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      club.add(at(new Mesh(new SphereGeometry(0.065, 6, 4), ivory), Math.cos(a) * 0.24, 0.85 + (i % 3) * 0.16, Math.sin(a) * 0.24));
    }
    club.rotation.x = Math.PI / 2 - 0.2;
    club.position.set(0, -0.05, 0.05);
    m.sockets.R.add(club);
    const glow = new PointLight(0x6fb7ff, 6, 9, 1.3);
    glow.position.set(0, 2.5, 1.4);
    m.root.add(glow);
  });
  const animator = new CharacterAnimator(model, dokkaebiClips(), {});
  return { ...model, animator, head: model.bones.Head, club };
}

// ---------- 黑貓（四足骨架） ----------

const CAT_BONES = [
  { name: 'Root', pos: [0, 0, 0] },
  { name: 'Hips', parent: 'Root', pos: [0, 0.25, -0.13] },
  { name: 'Spine', parent: 'Hips', pos: [0, 0.26, 0.01] },
  { name: 'Chest', parent: 'Spine', pos: [0, 0.26, 0.12] },
  { name: 'Neck', parent: 'Chest', pos: [0, 0.31, 0.19] },
  { name: 'Head', parent: 'Neck', pos: [0, 0.38, 0.23] },
  { name: 'Ear.L', parent: 'Head', pos: [0.045, 0.47, 0.24] },
  { name: 'Ear.R', parent: 'Head', pos: [-0.045, 0.47, 0.24] },
  ...['L', 'R'].flatMap((s) => {
    const x = s === 'L' ? 0.055 : -0.055;
    return [
      { name: `FrontUpper.${s}`, parent: 'Chest', pos: [x, 0.23, 0.14] },
      { name: `FrontLower.${s}`, parent: `FrontUpper.${s}`, pos: [x, 0.13, 0.15] },
      { name: `FrontPaw.${s}`, parent: `FrontLower.${s}`, pos: [x, 0.025, 0.155] },
      { name: `BackUpper.${s}`, parent: 'Hips', pos: [x, 0.22, -0.13] },
      { name: `BackLower.${s}`, parent: `BackUpper.${s}`, pos: [x, 0.13, -0.09] },
      { name: `BackHock.${s}`, parent: `BackLower.${s}`, pos: [x, 0.07, -0.15] },
      { name: `BackPaw.${s}`, parent: `BackHock.${s}`, pos: [x, 0.02, -0.13] },
    ];
  }),
  { name: 'Tail1', parent: 'Hips', pos: [0, 0.27, -0.21] },
  { name: 'Tail2', parent: 'Tail1', pos: [0, 0.31, -0.3] },
  { name: 'Tail3', parent: 'Tail2', pos: [0, 0.37, -0.37] },
  { name: 'Tail4', parent: 'Tail3', pos: [0, 0.44, -0.41] },
  { name: 'Tail5', parent: 'Tail4', pos: [0, 0.51, -0.42] },
];
const CAT_ANIMATED = CAT_BONES.map((b) => b.name).filter((n) => n !== 'Root');

function catClips() {
  const bones = CAT_ANIMATED;
  const TAU = Math.PI * 2;
  const clip = (name, d, f, o = {}) => makeClip(name, d, f, { bones, loop: o.loop, events: o.events });
  const tail = (t, amp = 0.35, lift = 0) => Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`Tail${i}`, [lift * (i === 1 ? 1 : 0.2), amp * Math.sin(TAU * t - i * 0.7), 0]]));
  const sit = {
    Hips: [0.55, 0, 0],
    Spine: [-0.25, 0, 0],
    Chest: [-0.35, 0, 0],
    Neck: [0.1, 0, 0],
    Head: [0.05, 0, 0],
    'BackUpper.L': [-1.35, 0, 0],
    'BackUpper.R': [-1.35, 0, 0],
    'BackLower.L': [1.2, 0, 0],
    'BackLower.R': [1.2, 0, 0],
    'BackHock.L': [-1.0, 0, 0],
    'BackHock.R': [-1.0, 0, 0],
    'FrontUpper.L': [0.35, 0, 0],
    'FrontUpper.R': [0.35, 0, 0],
  };
  const leg = (front, side, ph, amp) => {
    const c = Math.cos(TAU * ph);
    const lift = bump(ph, 0.7, 0.25);
    return front
      ? { [`FrontUpper.${side}`]: [-amp * c, 0, 0], [`FrontLower.${side}`]: [-0.9 * lift, 0, 0], [`FrontPaw.${side}`]: [0.4 * lift, 0, 0] }
      : { [`BackUpper.${side}`]: [-amp * c, 0, 0], [`BackLower.${side}`]: [0.8 * lift, 0, 0], [`BackHock.${side}`]: [-0.6 * lift, 0, 0] };
  };
  return {
    Idle: clip('Idle', 4, (t) => addPose(sit, tail(t, 0.3), { Chest: [0.03 * Math.sin(TAU * t * 2), 0, 0], 'Ear.L': [0, 0, 0.5 * bump(t, 0.3, 0.04)], 'Ear.R': [0, 0, -0.4 * bump(t, 0.72, 0.04)], Head: [0, 0.2 * Math.sin(TAU * t * 0.5), 0.08 * bump(t, 0.5, 0.1)] }), { loop: true }),
    // 對角步態：左前＋右後一組、右前＋左後一組
    Walk: clip('Walk', 0.8, (t) => addPose(leg(true, 'L', t, 0.45), leg(false, 'R', t, 0.45), leg(true, 'R', (t + 0.5) % 1, 0.45), leg(false, 'L', (t + 0.5) % 1, 0.45), tail(t * 2, 0.2, -0.6), { Spine: [0, 0.08 * Math.sin(TAU * t), 0], Head: [0.05 * Math.sin(TAU * t * 2), 0, 0] }), { loop: true }),
    // 跳躍：蹲低蓄力 → 後腿蹬直 → 空中收腿 → 前腳落地緩衝
    Jump: clip('Jump', 0.95, timeline([
      [0, sit],
      [0.3, { Hips: [-0.1, 0, 0], Spine: [0.15, 0, 0], Chest: [0.2, 0, 0], Head: [-0.2, 0, 0], 'BackUpper.L': [-1.0, 0, 0], 'BackUpper.R': [-1.0, 0, 0], 'BackLower.L': [1.1, 0, 0], 'BackLower.R': [1.1, 0, 0], 'BackHock.L': [-1.1, 0, 0], 'BackHock.R': [-1.1, 0, 0], 'FrontUpper.L': [0.4, 0, 0], 'FrontUpper.R': [0.4, 0, 0], 'FrontLower.L': [-0.6, 0, 0], 'FrontLower.R': [-0.6, 0, 0], ...tail(0.1, 0.1, -0.3) }],
      [0.45, { Spine: [-0.1, 0, 0], 'BackUpper.L': [0.7, 0, 0], 'BackUpper.R': [0.7, 0, 0], 'BackHock.L': [0.4, 0, 0], 'BackHock.R': [0.4, 0, 0], 'FrontUpper.L': [-1.0, 0, 0], 'FrontUpper.R': [-1.0, 0, 0], ...tail(0.3, 0.05, -0.8) }],
      [0.65, { Spine: [0.1, 0, 0], 'BackUpper.L': [-0.6, 0, 0], 'BackUpper.R': [-0.6, 0, 0], 'BackLower.L': [0.9, 0, 0], 'BackLower.R': [0.9, 0, 0], 'FrontUpper.L': [-0.7, 0, 0], 'FrontUpper.R': [-0.7, 0, 0], 'FrontLower.L': [-0.7, 0, 0], 'FrontLower.R': [-0.7, 0, 0], ...tail(0.5, 0.1, -0.5) }],
      [0.8, { Chest: [0.3, 0, 0], Head: [-0.25, 0, 0], 'FrontUpper.L': [0.3, 0, 0], 'FrontUpper.R': [0.3, 0, 0], 'FrontLower.L': [-0.8, 0, 0], 'FrontLower.R': [-0.8, 0, 0], ...tail(0.7, 0.15, -0.3) }],
      [1, sit],
    ]), { events: [{ t: 0.4, name: 'takeoff' }, { t: 0.78, name: 'land' }] }),
    Lick: clip('Lick', 2.4, (t) => addPose(sit, tail(t, 0.2), { Neck: [0.6, 0, 0], Head: [0.5 + 0.15 * Math.sin(TAU * t * 4), -0.4, 0.2], 'FrontUpper.L': [-0.9, 0, 0], 'FrontLower.L': [-1.6, 0, 0], 'FrontPaw.L': [-0.4 + 0.2 * Math.sin(TAU * t * 4), 0, 0] }), { loop: true }),
    Stretch: clip('Stretch', 2.2, timeline([
      [0, sit],
      [0.4, { Hips: [-0.3, 0, 0], Spine: [0.25, 0, 0], Chest: [0.45, 0, 0], Neck: [-0.5, 0, 0], Head: [-0.3, 0, 0], 'FrontUpper.L': [-1.3, 0, 0], 'FrontUpper.R': [-1.3, 0, 0], 'BackUpper.L': [0.2, 0, 0], 'BackUpper.R': [0.2, 0, 0], ...tail(0.2, 0.05, -1.0) }],
      [0.7, { Hips: [-0.3, 0, 0], Spine: [0.25, 0, 0], Chest: [0.5, 0, 0], Neck: [-0.6, 0, 0], Head: [-0.4, 0, 0], 'FrontUpper.L': [-1.4, 0, 0], 'FrontUpper.R': [-1.4, 0, 0], ...tail(0.4, 0.1, -1.1) }],
      [1, sit],
    ])),
  };
}

export function makeCatModel() {
  const rig = createBones(CAT_BONES);
  const B = new SkinBuilder(rig.index);
  const fur = 0x16161e;
  const along = (zs) => (p) => {
    for (let i = 0; i < zs.length - 1; i++) {
      const [z0, b0] = zs[i];
      const [z1, b1] = zs[i + 1];
      if (p.z <= z1) {
        const k = Math.min(1, Math.max(0, (p.z - z0) / (z1 - z0)));
        return [
          [b0, 1 - k],
          [b1, k],
        ];
      }
    }
    return [[zs[zs.length - 1][1], 1]];
  };
  // 身體：沿 z 軸的旋轉體，臀部 → 背 → 胸
  const body = new LatheGeometry(
    [
      [-0.24, 0.02],
      [-0.2, 0.075],
      [-0.1, 0.085],
      [0.02, 0.08],
      [0.12, 0.085],
      [0.19, 0.07],
      [0.23, 0.03],
    ].map(([z, r]) => new Vector2(r, z)),
    14,
  );
  B.add(body, { matrix: place(0, 0.255, 0, 1, 1, 1.05, Math.PI / 2, 0, 0).premultiply(place(0, 0, 0)), weights: along([[-0.12, 'Hips'], [0.01, 'Spine'], [0.12, 'Chest'], [0.2, 'Neck']]), color: fur });
  // 頭、口鼻、耳朵
  B.add(new SphereGeometry(0.075, 14, 10), { matrix: place(0, 0.39, 0.25, 1.05, 0.95, 1), weights: 'Head', color: fur });
  B.add(new SphereGeometry(0.04, 10, 8), { matrix: place(0, 0.37, 0.31, 1, 0.8, 0.9), weights: 'Head', color: 0x24242c });
  for (const [s, sx] of [
    ['L', 1],
    ['R', -1],
  ]) {
    B.add(new ConeGeometry(0.032, 0.07, 4), { matrix: place(sx * 0.045, 0.47, 0.24, 1, 1, 0.5, 0, Math.PI / 4, -sx * 0.25), weights: `Ear.${s}`, color: fur });
    // 腿
    for (const [up, low, paw, x, z0, z1] of [
      ['FrontUpper', 'FrontLower', 'FrontPaw', sx * 0.055, 0.14, 0.155],
      ['BackUpper', 'BackLower', 'BackPaw', sx * 0.055, -0.13, -0.13],
    ]) {
      const front = up === 'FrontUpper';
      const leg = new CapsuleGeometry(front ? 0.022 : 0.026, 0.2, 3, 8);
      B.add(leg, {
        matrix: place(x, 0.135, (z0 + z1) / 2),
        weights: front
          ? (p) => (p.y > 0.14 ? [[`${up}.${s}`, 1]] : p.y > 0.035 ? [[`${low}.${s}`, 1]] : [[`${paw}.${s}`, 1]])
          : (p) => (p.y > 0.14 ? [[`${up}.${s}`, 1]] : p.y > 0.075 ? [[`${low}.${s}`, 1]] : p.y > 0.03 ? [[`BackHock.${s}`, 1]] : [[`${paw}.${s}`, 1]]),
        color: fur,
      });
      B.add(new SphereGeometry(0.03, 8, 6), { matrix: place(x, 0.02, z1 + 0.01, 1, 0.6, 1.3), weights: `${paw}.${s}`, color: fur });
    }
  }
  // 尾巴
  const tailPts = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5'].map((n) => rig.world[n]);
  for (let i = 0; i < tailPts.length; i++) {
    const p = tailPts[i];
    const next = tailPts[i + 1] ?? p.clone().add(new Vector3(0, 0.06, 0));
    const mid = p.clone().lerp(next, 0.5);
    const len = p.distanceTo(next);
    const seg = new CapsuleGeometry(0.02 - i * 0.002, len, 2, 6);
    const dir = next.clone().sub(p).normalize();
    const angle = Math.atan2(dir.z, dir.y);
    B.add(seg, { matrix: place(mid.x, mid.y, mid.z, 1, 1, 1, angle, 0, 0), weights: `Tail${i + 1}`, color: fur });
  }
  const mesh = new SkinnedMesh(B.build(), new MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const root = new Group();
  root.name = 'cat';
  root.add(rig.root);
  root.add(mesh);
  // 綁定前先更新骨頭的世界矩陣，反綁定矩陣才會正確
  root.updateMatrixWorld(true);
  mesh.bind(rig.skeleton);

  // 發光的金色眼睛與叼著的破감투（剛體，掛在頭上）
  const head = rig.byName.Head;
  const local = (x, y, z) => new Vector3(x, y, z).sub(rig.world.Head);
  const eyeMat = new MeshBasicMaterial({ color: 0xf2bd68 });
  const eyes = [-1, 1].map((sx) => {
    const e = new Mesh(new SphereGeometry(0.017, 8, 6), eyeMat);
    e.scale.set(1, 1.2, 0.6);
    e.position.copy(local(sx * 0.033, 0.405, 0.312));
    head.add(e);
    return e;
  });
  const hat = new Group();
  const hatMat = new MeshLambertMaterial({ color: 0x0c0c10 });
  hat.add(at(new Mesh(new CylinderGeometry(0.07, 0.085, 0.06, 10), hatMat), 0, 0.03, 0));
  hat.add(at(new Mesh(new SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), hatMat), 0, 0.06, 0));
  hat.position.copy(local(0, 0.33, 0.34));
  head.add(hat);

  const model = {
    root,
    mesh,
    rig,
    bones: rig.byName,
    springs: [],
    face: { eyes, brows: [], browBase: [], eyeBase: eyes[0].scale.clone(), mouth: null },
  };
  const animator = new CharacterAnimator(model, catClips(), {});
  animator.setBase('Idle', 0.01);
  return { ...model, animator, head, tail: rig.byName.Tail1, hat };
}

export { SpringChain };
