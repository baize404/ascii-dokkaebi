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
  Object3D,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { blendAxis, createBones, place, SkinBuilder } from './SkinBuilder.js';
import { SpringChain } from './Spring.js';

/**
 * 程序化人形角色：完整骨架 + 單一 SkinnedMesh（頂點色）+ 掛在骨頭上的臉部零件。
 *
 * 骨架（L = 角色左側 = +x，R = -x；模型正面朝 +z）：
 *   Root → Pelvis → Spine → Chest → Neck → Head
 *   Chest → Clavicle → Shoulder（上臂）→ Elbow（前臂）→ Wrist（手腕）→ Hand（手掌）→ Finger、Thumb
 *   Pelvis → Hip（大腿）→ Knee（小腿）→ Ankle（腳）→ Foot（前腳掌）→ Toe
 *   次級骨：裙擺 Skirt.F/B/L/R、衣帶 Goreum1–2、辮子 Braid1–3 + 댕기 Ribbon、肚子 Belly
 * 綁定姿勢中手腳自然下垂、所有骨頭沒有旋轉，動畫只描述相對旋轉。
 */

const SIDES = [
  ['L', 1],
  ['R', -1],
];

/** 由下往上的高度帶：每段屬於一根骨頭，交界處 ±width 平滑過渡 */
function bandsY(bands, width) {
  return (p) => {
    let i = bands.findIndex((b) => p.y <= b.top);
    if (i < 0) i = bands.length - 1;
    const cur = bands[i];
    const below = bands[i - 1];
    const above = bands[i + 1];
    if (below && p.y < below.top + width) {
      const k = (p.y - (below.top - width)) / (2 * width);
      return [
        [cur.bone, k],
        [below.bone, 1 - k],
      ];
    }
    if (above && p.y > cur.top - width) {
      const k = (p.y - (cur.top - width)) / (2 * width);
      return [
        [cur.bone, 1 - k],
        [above.bone, k],
      ];
    }
    return [[cur.bone, 1]];
  };
}

/** 沿高度平滑地在多根骨頭之間過渡（脊椎彎曲用） */
function chainY(joints) {
  return (p) => {
    if (p.y <= joints[0][0]) return [[joints[0][1], 1]];
    for (let i = 0; i < joints.length - 1; i++) {
      const [y0, b0] = joints[i];
      const [y1, b1] = joints[i + 1];
      if (p.y <= y1) {
        let k = (p.y - y0) / (y1 - y0);
        k = k * k * (3 - 2 * k);
        return [
          [b0, 1 - k],
          [b1, k],
        ];
      }
    }
    return [[joints[joints.length - 1][1], 1]];
  };
}

/** 旋轉體（四肢、軀幹、裙子）：profile 是由下往上的 [y, 半徑] */
function lathe(profile, segments = 14, subdivide = 3) {
  // 在每兩個輪廓點之間插入平滑過渡的點：肌肉與布料的曲線比較圓順
  const pts = [];
  for (let i = 0; i < profile.length; i++) {
    const [y0, r0] = profile[i];
    pts.push(new Vector2(Math.max(r0, 0.0005), y0));
    const next = profile[i + 1];
    if (!next) break;
    for (let k = 1; k < subdivide; k++) {
      const t = k / subdivide;
      const e = 0.5 - 0.5 * Math.cos(Math.PI * t);
      pts.push(new Vector2(Math.max(r0 + (next[1] - r0) * e, 0.0005), y0 + (next[0] - y0) * t));
    }
  }
  return new LatheGeometry(pts, segments);
}

/** 小孩（玩家）的預設比例；其他角色覆寫需要的欄位 */
export const CHILD_SPEC = {
  name: 'child',
  pelvisY: 0.74,
  spineY: 0.87,
  chestY: 1.0,
  neckY: 1.2,
  headY: 1.27,
  headCenter: [0, 1.5, 0.01],
  headR: 0.255,
  shoulderX: 0.21,
  clavicleX: 0.05,
  shoulderY: 1.15,
  elbowY: 0.93,
  wristY: 0.72,
  hipX: 0.085,
  hipY: 0.71,
  kneeY: 0.39,
  ankleY: 0.08,
  footLen: 0.15,
  torso: [
    [0.66, 0.11],
    [0.74, 0.125],
    [0.86, 0.105],
    [0.98, 0.115],
    [1.1, 0.125],
    [1.16, 0.115],
    [1.2, 0.05],
    [1.28, 0.046],
  ],
  torsoScale: [1.15, 0.85],
  arm: { upper: 0.04, fore: 0.035, wrist: 0.026, sleeve: 0.056, cuffY: 0.765, sleeveEnd: 0.745 },
  leg: { thigh: 0.064, knee: 0.044, calf: 0.05, ankle: 0.032 },
  hand: { palm: [0.028, 0.055, 0.046], finger: 0.055, fingerR: 0.0085 },
  colors: {
    skin: 0xf2c9a6,
    jacket: 0xb8283a,
    collar: 0x1f2f5c,
    dongjeong: 0xf4f1ea,
    cuff: 0x1f2f5c,
    skirt: 0xf1ece2,
    legs: 0xf4f1ea,
    shoe: 0x8a1f2e,
    hair: 0x2c2838,
    goreum: 0x3a5fc8,
    ribbon: 0xd42e40,
    lip: 0xb65060,
    eye: 0x1a1012,
    cheek: 0xe89a90,
  },
  skirt: { top: 1.05, hem: 0.3, topR: 0.155, midR: 0.27, hemR: 0.36, pleats: 16, pleatDepth: 0.012, scale: [1.08, 0.95] },
  jacket: { bottom: 0.97, top: 1.2, flare: 0.012 },
  hair: 'braid',
  goreum: true,
  belly: false,
  eyeGlow: false,
};

/** 建立骨頭定義（綁定姿勢的世界座標） */
function boneDefs(s) {
  const defs = [
    { name: 'Root', pos: [0, 0, 0] },
    { name: 'Pelvis', parent: 'Root', pos: [0, s.pelvisY, 0] },
    { name: 'Spine', parent: 'Pelvis', pos: [0, s.spineY, 0] },
    { name: 'Chest', parent: 'Spine', pos: [0, s.chestY, 0] },
    { name: 'Neck', parent: 'Chest', pos: [0, s.neckY, 0] },
    { name: 'Head', parent: 'Neck', pos: [0, s.headY, 0] },
  ];
  if (s.belly) defs.push({ name: 'Belly', parent: 'Spine', pos: [0, (s.pelvisY + s.chestY) / 2, s.belly.z] });
  const handLen = s.hand.palm[1];
  for (const [side, sx] of SIDES) {
    const x = sx * s.shoulderX;
    defs.push(
      { name: `Clavicle.${side}`, parent: 'Chest', pos: [sx * s.clavicleX, s.shoulderY, 0] },
      { name: `Shoulder.${side}`, parent: `Clavicle.${side}`, pos: [x, s.shoulderY, 0] },
      { name: `Elbow.${side}`, parent: `Shoulder.${side}`, pos: [x, s.elbowY, 0] },
      { name: `Wrist.${side}`, parent: `Elbow.${side}`, pos: [x, s.wristY, 0] },
      { name: `Hand.${side}`, parent: `Wrist.${side}`, pos: [x, s.wristY - handLen * 0.45, 0] },
      { name: `Finger.${side}`, parent: `Hand.${side}`, pos: [x, s.wristY - handLen * 0.95, 0.004] },
      { name: `Thumb.${side}`, parent: `Hand.${side}`, pos: [x - sx * 0.006, s.wristY - handLen * 0.25, s.hand.palm[2] * 0.45] },
      { name: `Hip.${side}`, parent: 'Pelvis', pos: [sx * s.hipX, s.hipY, 0] },
      { name: `Knee.${side}`, parent: `Hip.${side}`, pos: [sx * s.hipX * 1.05, s.kneeY, 0.01] },
      { name: `Ankle.${side}`, parent: `Knee.${side}`, pos: [sx * s.hipX * 1.05, s.ankleY, 0] },
      { name: `Foot.${side}`, parent: `Ankle.${side}`, pos: [sx * s.hipX * 1.05, s.ankleY * 0.4, s.footLen * 0.55] },
      { name: `Toe.${side}`, parent: `Foot.${side}`, pos: [sx * s.hipX * 1.05, s.ankleY * 0.35, s.footLen * 0.82] },
    );
  }
  if (s.skirt) {
    const y = s.skirt.top - 0.08 * (s.scaleRef ?? 1);
    for (const [name, dx, dz] of [
      ['F', 0, 1],
      ['B', 0, -1],
      ['L', 1, 0],
      ['R', -1, 0],
    ])
      defs.push({ name: `Skirt.${name}`, parent: 'Pelvis', pos: [dx * s.skirt.topR * 0.6, y, dz * s.skirt.topR * 0.6] });
  }
  if (s.goreum) {
    defs.push({ name: 'Goreum1', parent: 'Chest', pos: [-0.035, s.chestY + 0.06, 0.12] });
    defs.push({ name: 'Goreum2', parent: 'Goreum1', pos: [-0.04, s.chestY - 0.06, 0.135] });
  }
  if (s.hair === 'braid') {
    const [, hy, hz] = s.headCenter;
    defs.push(
      { name: 'Braid1', parent: 'Head', pos: [0, hy - 0.14, hz - 0.25] },
      { name: 'Braid2', parent: 'Braid1', pos: [0, hy - 0.3, hz - 0.255] },
      { name: 'Braid3', parent: 'Braid2', pos: [0, hy - 0.46, hz - 0.235] },
      { name: 'Ribbon', parent: 'Braid3', pos: [0, hy - 0.6, hz - 0.215] },
    );
  }
  return defs;
}

/**
 * @param spec 角色比例與外觀（以 CHILD_SPEC 為預設）
 * @param extras(ctx) 可選：加上角、狼牙棒等額外零件
 */
export function buildHumanoid(specOverrides = {}, extras = null) {
  const s = { ...CHILD_SPEC, ...specOverrides, colors: { ...CHILD_SPEC.colors, ...(specOverrides.colors ?? {}) } };
  const rig = createBones(boneDefs(s));
  const B = new SkinBuilder(rig.index);
  const c = s.colors;
  const [tsx, tsz] = s.torsoScale;

  // ---- 軀幹：沿脊椎平滑過渡，彎腰時自然變形 ----
  const torsoWeights = chainY([
    [s.pelvisY + 0.02, 'Pelvis'],
    [s.spineY, 'Spine'],
    [s.chestY + 0.06, 'Chest'],
    [s.neckY + 0.01, 'Neck'],
    [s.headY + 0.03, 'Head'],
  ]);
  const bellyWeights = s.belly
    ? (p) => {
        const w = torsoWeights(p);
        const d = Math.hypot((p.y - rig.world.Belly.y) / s.belly.h, p.x / (s.belly.r * 1.2));
        const k = Math.max(0, 1 - d) * (p.z > 0 ? 1 : 0.3);
        return k > 0 ? [...w.map(([b, v]) => [b, v * (1 - k)]), ['Belly', k]] : w;
      }
    : torsoWeights;
  const jacket = s.jacket;
  B.add(lathe(s.torso, 26), {
    matrix: place(0, 0, 0, tsx, 1, tsz),
    weights: bellyWeights,
    color: (p) => {
      if (p.y > s.neckY - 0.01) return c.skin;
      if (!jacket) return s.bareChest ? c.skin : c.jacket;
      // V 字領（깃）：正面中央往下的深藍色帶，上緣一條白色동정
      const fromNeck = s.neckY - p.y;
      if (p.z > 0 && p.y > jacket.top - 0.14 && Math.abs(Math.abs(p.x) - fromNeck * 0.55) < 0.018) return fromNeck < 0.03 ? c.dongjeong : c.collar;
      return p.y >= jacket.bottom ? c.jacket : c.skirt;
    },
  });
  // 肚子（도깨비）
  if (s.belly) {
    B.add(new SphereGeometry(1, 18, 14), {
      matrix: place(0, rig.world.Belly.y, s.belly.z * 0.6, s.belly.r, s.belly.h, s.belly.r * 0.9),
      weights: bellyWeights,
      color: c.skin,
    });
  }
  // 上衣下擺（저고리）：比軀幹大一點的外殼，看得出布料厚度
  if (jacket) {
    B.add(
      lathe(
        [
          [jacket.bottom - 0.005, 0.0],
          [jacket.bottom, s.torso[3][1] + jacket.flare + 0.01],
          [jacket.bottom + 0.06, s.torso[3][1] + jacket.flare],
          [jacket.top - 0.04, s.torso[5][1] + 0.008],
          [jacket.top, 0.06],
        ],
        18,
      ),
      { matrix: place(0, 0, 0, tsx * 1.02, 1, tsz * 1.05), weights: torsoWeights, color: c.jacket },
    );
  }

  // ---- 手臂（袖子、袖口끝동、手腕、手掌、手指） ----
  for (const [side, sx] of SIDES) {
    const x = sx * s.shoulderX;
    const a = s.arm;
    const profile = [
      [s.wristY - 0.02, a.wrist * 0.9],
      [s.wristY + 0.01, a.wrist],
      [a.sleeveEnd - 0.003, a.wrist + 0.004],
      [a.sleeveEnd, a.sleeve * 0.92],
      [(a.sleeveEnd + s.elbowY) / 2, a.sleeve * 1.06],
      [s.elbowY, a.sleeve * 0.98],
      [(s.elbowY + s.shoulderY) / 2, a.sleeve],
      [s.shoulderY - 0.02, a.sleeve * 0.95],
      [s.shoulderY + 0.035, a.sleeve * 0.6],
    ];
    const armBands = bandsY(
      [
        { bone: `Wrist.${side}`, top: s.wristY },
        { bone: `Elbow.${side}`, top: s.elbowY },
        { bone: `Shoulder.${side}`, top: s.shoulderY + 0.01 },
        { bone: `Clavicle.${side}`, top: 99 },
      ],
      0.035,
    );
    B.add(lathe(profile, 16), {
      matrix: place(x, 0, 0),
      weights: armBands,
      color: (p) => (p.y < a.sleeveEnd - 0.001 ? c.skin : p.y < a.cuffY ? c.cuff : s.bareArms ? c.skin : c.jacket),
      // 袖子的布料摺痕：靠近手肘有幾道淺淺的皺褶
      displace: (p) => (p.y > a.sleeveEnd && p.y < s.shoulderY - 0.03 ? 0.004 * Math.sin(p.y * 140) * Math.exp(-(((p.y - s.elbowY) / 0.07) ** 2)) : 0),
    });
    // 手掌：拇指那側朝前
    const [pw, pl, pd] = s.hand.palm;
    const handY = s.wristY - pl * 0.5;
    B.add(new SphereGeometry(1, 10, 8), {
      matrix: place(x, handY, 0.004, pw, pl * 0.55, pd * 0.55),
      weights: (p) => (p.y > s.wristY - 0.012 ? [[`Wrist.${side}`, 1]] : [[`Hand.${side}`, 1]]),
      color: c.skin,
    });
    // 四根手指（一起彎曲）與拇指
    for (let f = 0; f < 4; f++) {
      const len = s.hand.finger * [0.85, 1, 0.95, 0.78][f];
      const g = new CapsuleGeometry(s.hand.fingerR, len, 3, 6);
      B.add(g, {
        matrix: place(x - sx * 0.002, handY - pl * 0.42 - len / 2, (f - 1.5) * pd * 0.24, 1, 1, 1),
        weights: `Finger.${side}`,
        color: c.skin,
      });
    }
    const thumb = new CapsuleGeometry(s.hand.fingerR * 1.15, s.hand.finger * 0.55, 3, 6);
    B.add(thumb, {
      matrix: place(x - sx * 0.008, handY - 0.004, pd * 0.62, 1, 1, 1, -0.5, 0, sx * 0.2),
      weights: `Thumb.${side}`,
      color: c.skin,
    });

    // ---- 腿（襪子、膝蓋、小腿肚、腳踝）與鞋（꽃신，鞋尖上翹） ----
    const lx = sx * s.hipX * 1.05;
    const l = s.leg;
    B.add(
      lathe(
        [
          [s.ankleY - 0.03, l.ankle * 0.9],
          [s.ankleY, l.ankle],
          [(s.ankleY + s.kneeY) * 0.55, l.calf],
          [s.kneeY, l.knee],
          [(s.kneeY + s.hipY) / 2, l.thigh],
          [s.hipY, l.thigh * 1.05],
          [s.hipY + 0.06, l.thigh * 0.8],
        ],
        16,
      ),
      {
        matrix: place(lx, 0, 0),
        weights: bandsY(
          [
            { bone: `Ankle.${side}`, top: s.ankleY },
            { bone: `Knee.${side}`, top: s.kneeY },
            { bone: `Hip.${side}`, top: s.hipY },
            { bone: 'Pelvis', top: 99 },
          ],
          0.03,
        ),
        color: s.bareLegs ? c.skin : c.legs,
      },
    );
    const fl = s.footLen;
    B.add(new SphereGeometry(1, 12, 8), {
      matrix: place(lx, s.ankleY * 0.45, fl * 0.32, l.ankle * 1.4, s.ankleY * 0.5, fl * 0.62),
      weights: blendAxis('z', `Ankle.${side}`, `Foot.${side}`, fl * 0.5, fl * 0.12),
      color: c.shoe,
    });
    const tip = new ConeGeometry(l.ankle * 0.55, fl * 0.3, 8);
    B.add(tip, { matrix: place(lx, s.ankleY * 0.62, fl * 0.86, 1, 1, 1, 1.15, 0, 0), weights: `Toe.${side}`, color: c.shoe });
  }

  // ---- 裙子（치마）：有摺痕，由四根裙擺骨帶動 ----
  if (s.skirt) {
    const k = s.skirt;
    const [kx, kz] = k.scale;
    const dirs = { 'Skirt.F': [0, 1], 'Skirt.B': [0, -1], 'Skirt.L': [1, 0], 'Skirt.R': [-1, 0] };
    B.add(
      lathe(
        [
          [k.hem, k.hemR],
          [k.hem + 0.02, k.hemR * 0.995],
          [(k.hem + k.top) * 0.45, k.midR],
          [k.top - 0.06, k.topR * 1.08],
          [k.top, k.topR],
          [k.top + 0.012, k.topR * 0.85],
        ],
        44,
      ),
      {
        matrix: place(0, 0, 0, kx, 1, kz),
        weights: (p) => {
          const h = Math.min(1, Math.max(0, (k.top - 0.06 - p.y) / (k.top - k.hem - 0.06)));
          const ang = Math.atan2(p.z, p.x);
          const w = Object.entries(dirs).map(([bone, [dx, dz]]) => [bone, Math.max(0, Math.cos(ang - Math.atan2(dz, dx))) ** 2]);
          const sum = w.reduce((t, [, v]) => t + v, 0) || 1;
          return [['Spine', (1 - h) * 0.5], ['Pelvis', (1 - h) * 0.5], ...w.map(([b, v]) => [b, (v / sum) * h])];
        },
        color: (p) => {
          if (s.stripes && Math.sin(Math.atan2(p.z, p.x) * 7 + p.y * 9) > 0.55) return c.stripe;
          if (s.skirtBand && p.y < k.hem + 0.05) return c.skirtBand;
          return c.skirt;
        },
        // 主름（摺痕）：越往下越深
        displace: (p) => {
          const h = Math.min(1, Math.max(0, (k.top - p.y) / (k.top - k.hem)));
          return k.pleatDepth * Math.sin(Math.atan2(p.z, p.x) * k.pleats) * h;
        },
      },
    );
  }

  // ---- 衣帶（고름）：兩條長短不一的布條 ----
  if (s.goreum) {
    for (const [len, dx] of [
      [0.24, 0],
      [0.17, 0.025],
    ]) {
      B.add(new CylinderGeometry(0.014, 0.012, len, 4, 6), {
        matrix: place(-0.045 + dx, s.chestY + 0.04 - len / 2, 0.14, 1.6, 1, 0.3),
        weights: (p) => (p.y > s.chestY ? [['Goreum1', 1]] : [['Goreum2', 1]]),
        color: c.goreum,
      });
    }
    B.add(new SphereGeometry(0.022, 8, 6), { matrix: place(-0.04, s.chestY + 0.05, 0.135, 1.3, 0.8, 0.6), weights: 'Chest', color: c.goreum });
  }

  // ---- 頭：臉型（額頭、下巴）、耳朵 ----
  const [hx, hy, hz] = s.headCenter;
  const r = s.headR;
  B.add(new SphereGeometry(r, 30, 24), { matrix: place(hx, hy, hz, 0.95, 1.02, 0.97), weights: 'Head', color: c.skin });
  B.add(new SphereGeometry(r * 0.68, 14, 10), { matrix: place(hx, hy - r * 0.38, hz + r * 0.2, 1, 0.9, 0.95), weights: 'Head', color: c.skin });
  for (const [, sx] of SIDES) {
    B.add(new SphereGeometry(r * 0.17, 8, 6), { matrix: place(sx * r * 0.95, hy - r * 0.08, hz - r * 0.02, 0.5, 1, 0.75), weights: 'Head', color: c.skin });
  }

  // ---- 頭髮 ----
  if (s.hair === 'braid' || s.hair === 'bun') {
    // 中分、往後梳的髮型；髮線中央露出一條頭皮
    const cap = new SphereGeometry(r * 1.06, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
    B.add(cap, {
      matrix: place(hx, hy + r * 0.04, hz - r * 0.06, 0.98, 1.0, 1.0, -0.62, 0, 0),
      weights: 'Head',
      color: (p) => (Math.abs(p.x) < 0.006 && p.z > hz - r * 0.2 && p.y > hy + r * 0.5 ? c.skin : c.hair),
      displace: (p) => 0.003 * Math.sin(Math.atan2(p.z - hz, p.x) * 40),
    });
    B.add(new SphereGeometry(r * 0.72, 14, 10), { matrix: place(hx, hy - r * 0.2, hz - r * 0.45, 1.05, 1, 0.7), weights: 'Head', color: c.hair });
  }
  if (s.hair === 'braid') {
    // 辮子：交錯的髮束，由三根辮子骨帶動；尾端是紅色댕기
    const top = hy - 0.16;
    const bottom = hy - 0.6;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const y = top - (i / (n - 1)) * (top - bottom);
      const zz = hz - 0.25 + (i / n) * 0.035;
      const rr = 0.045 * (1 - (i / n) * 0.35);
      B.add(new SphereGeometry(rr, 8, 6), {
        matrix: place((i % 2 ? 1 : -1) * rr * 0.35, y, zz, 1, 1.35, 0.85, 0, 0, (i % 2 ? 1 : -1) * 0.35),
        weights: bandsY(
          [
            { bone: 'Braid3', top: hy - 0.46 },
            { bone: 'Braid2', top: hy - 0.3 },
            { bone: 'Braid1', top: 99 },
          ],
          0.05,
        ),
        color: c.hair,
      });
    }
    B.add(new CylinderGeometry(0.035, 0.03, 0.2, 4, 4), {
      matrix: place(0, hy - 0.69, hz - 0.21, 1.4, 1, 0.25),
      weights: 'Ribbon',
      color: c.ribbon,
    });
  }
  if (s.hair === 'bun') {
    B.add(new SphereGeometry(r * 0.42, 12, 10), { matrix: place(hx, hy - r * 0.35, hz - r * 0.95, 1.2, 0.9, 0.9), weights: 'Head', color: c.hair });
  }
  if (s.hair === 'wild') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const g = new ConeGeometry(r * 0.22, r * 0.55, 5);
      B.add(g, {
        matrix: place(hx + Math.cos(a) * r * 0.55, hy + r * 0.62, hz - 0.15 * r + Math.sin(a) * r * 0.55, 1, 1, 1, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9),
        weights: 'Head',
        color: c.hair,
      });
    }
  }

  const geometry = B.build();
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = `${s.name}-mesh`;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const root = new Group();
  root.name = s.name;
  root.add(rig.root);
  root.add(mesh);
  // 綁定前先更新骨頭的世界矩陣，反綁定矩陣才會正確
  root.updateMatrixWorld(true);
  mesh.bind(rig.skeleton);

  // ---- 臉部零件：掛在 Head 骨頭上（剛體），可以眨眼、開口、挑眉 ----
  const head = rig.byName.Head;
  const local = (x, y, z) => new Vector3(x, y, z).sub(rig.world.Head);
  const face = { eyes: [], brows: [], mouth: null, lids: [] };
  const eyeMat = s.eyeGlow ? new MeshBasicMaterial({ color: c.eye }) : new MeshLambertMaterial({ color: c.eye });
  const white = new MeshBasicMaterial({ color: 0xffffff });
  for (const [, sx] of SIDES) {
    const eye = new Mesh(new SphereGeometry(r * 0.12, 10, 8), eyeMat);
    eye.position.copy(local(hx + sx * r * 0.36, hy - r * 0.02, hz + r * 0.88));
    eye.scale.set(s.eyeShape?.[0] ?? 0.85, s.eyeShape?.[1] ?? 1.25, 0.55);
    head.add(eye);
    face.eyes.push(eye);
    if (!s.eyeGlow) {
      const glint = new Mesh(new SphereGeometry(r * 0.03, 6, 4), white);
      glint.position.set(sx * r * 0.03, r * 0.05, r * 0.06);
      eye.add(glint);
    }
    const brow = new Mesh(new CapsuleGeometry(r * 0.025 * (s.browWeight ?? 1), r * 0.16, 2, 4), new MeshLambertMaterial({ color: c.brow ?? c.hair }));
    brow.rotation.z = Math.PI / 2 + sx * 0.12;
    brow.position.copy(local(hx + sx * r * 0.36, hy + r * 0.22, hz + r * 0.88));
    head.add(brow);
    face.brows.push(brow);
    if (!s.eyeGlow) {
      const cheek = new Mesh(new SphereGeometry(r * 0.11, 8, 6), new MeshLambertMaterial({ color: c.cheek, transparent: true, opacity: 0.55 }));
      cheek.scale.set(1, 0.6, 0.3);
      cheek.position.copy(local(hx + sx * r * 0.55, hy - r * 0.28, hz + r * 0.78));
      head.add(cheek);
    }
  }
  const nose = new Mesh(new SphereGeometry(r * 0.07, 8, 6), new MeshLambertMaterial({ color: c.skin }));
  nose.scale.set(0.9, 0.8, 0.8);
  nose.position.copy(local(hx, hy - r * 0.2, hz + r * 1.0));
  head.add(nose);
  const mouth = new Mesh(new SphereGeometry(r * 0.1, 10, 6), new MeshLambertMaterial({ color: c.lip }));
  mouth.scale.set(s.mouthWidth ?? 1.1, 0.35, 0.4);
  mouth.position.copy(local(hx, hy - r * 0.48, hz + r * 0.88));
  head.add(mouth);
  face.mouth = mouth;
  face.mouthBase = mouth.scale.clone();
  face.eyeBase = face.eyes[0].scale.clone();
  face.browBase = face.brows.map((b) => b.position.clone());

  // ---- 掛點（Hand Socket）：道具跟著手掌動 ----
  const sockets = {};
  for (const [side, sx] of SIDES) {
    const socket = new Object3D();
    socket.name = `Socket.${side}`;
    socket.position.copy(new Vector3(sx * s.shoulderX - sx * 0.004, s.wristY - s.hand.palm[1] * 0.72, 0.01).sub(rig.world[`Hand.${side}`]));
    rig.byName[`Hand.${side}`].add(socket);
    sockets[side] = socket;
  }

  // ---- 次級動態 ----
  const colliders = SIDES.flatMap(([side]) => [
    { object: rig.byName[`Knee.${side}`], radius: s.leg.knee * 2.4, offset: null },
    { object: rig.byName[`Hip.${side}`], radius: s.leg.thigh * 1.9, offset: new Vector3(0, -(s.hipY - s.kneeY) * 0.5, 0) },
  ]);
  const springs = [];
  if (s.skirt) {
    for (const [name, dx, dz] of [
      ['F', 0, 1],
      ['B', 0, -1],
      ['L', 1, 0],
      ['R', -1, 0],
    ]) {
      const bone = rig.byName[`Skirt.${name}`];
      bone.userData.tip = new Vector3(dx * 0.14, -(s.skirt.top - s.skirt.hem - 0.08), dz * 0.14);
      springs.push(new SpringChain([bone], { stiffness: 0.2, damping: 0.78, gravity: 0.15, windScale: 0.25, colliders }));
    }
  }
  if (s.goreum) springs.push(new SpringChain([rig.byName.Goreum1, rig.byName.Goreum2], { stiffness: 0.1, damping: 0.85, gravity: 0.5, windScale: 1.2, tipLength: 0.12 }));
  if (s.hair === 'braid') {
    rig.byName.Ribbon.userData.tip = new Vector3(0, -0.16, 0.01);
    springs.push(
      new SpringChain([rig.byName.Braid1, rig.byName.Braid2, rig.byName.Braid3, rig.byName.Ribbon], {
        stiffness: [0.3, 0.08, 0.04, 0.025],
        damping: 0.86,
        gravity: 1.6,
        windScale: 1,
        colliders: [{ object: rig.byName.Chest, radius: 0.16, offset: new Vector3(0, 0.05, -0.02) }],
      }),
    );
  }

  const model = { root, mesh, rig, bones: rig.byName, face, sockets, springs, spec: s, head };
  extras?.(model);
  return model;
}

/** 模型三角面數（效能紀錄用） */
export function triangleCount(model) {
  let n = 0;
  model.root.traverse((o) => {
    if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return Math.round(n);
}

export { TorusGeometry };
