import { addPose, bump, makeClip, timeline } from './clips.js';

/**
 * 人形角色的動畫片段（姿勢以相對綁定姿勢的尤拉角描述）。
 *
 * 角度慣例（模型正面朝 +z，手腳在綁定姿勢中下垂）：
 *   Shoulder x < 0 手臂往前抬；Shoulder.L z > 0 往外張開（右邊鏡像）
 *   Elbow x < 0 手肘彎曲（前臂往前上）；Wrist x 手腕上下；Finger／Thumb 用 c() 表示握起來
 *   Hip x < 0 大腿往前；Knee x > 0 膝蓋彎曲；Ankle x > 0 腳尖往下；Toe x < 0 腳趾往上翹
 *   Spine／Chest／Neck／Head x > 0 往前彎；y 左右轉；z 側傾
 */

export const BODY_BONES = ['Pelvis', 'Spine', 'Chest', 'Neck', 'Head'];
const LIMBS = ['Clavicle', 'Shoulder', 'Elbow', 'Wrist', 'Hand', 'Finger', 'Thumb', 'Hip', 'Knee', 'Ankle', 'Foot', 'Toe'];
export const ANIMATED_BONES = [...BODY_BONES, ...LIMBS.flatMap((b) => [`${b}.L`, `${b}.R`])];

const TAU = Math.PI * 2;

/** 只寫左側的姿勢 → 自動鏡像到右側（y、z 反號） */
function mirror(pose) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) {
    if (k.endsWith('.L')) out[k.replace('.L', '.R')] = [v[0], -v[1], -v[2]];
    else if (k.endsWith('.R')) out[k.replace('.R', '.L')] = [v[0], -v[1], -v[2]];
    else out[k] = [v[0], -v[1], -v[2]];
  }
  return out;
}
const both = (pose) => addPose(pose, mirror(Object.fromEntries(Object.entries(pose).filter(([k]) => k.endsWith('.L')))));
/** 手指彎曲（0 張開 – 1 握拳）。手心朝身體內側，所以左手是 -z */
const grip = (side, k) => ({ [`Finger.${side}`]: [0, 0, (side === 'L' ? -1 : 1) * 1.5 * k], [`Thumb.${side}`]: [0.2 * k, 0, (side === 'L' ? -1 : 1) * 0.9 * k] });

/** 自然站姿：手臂微張、手肘微彎、手指放鬆 */
export const REST = both({
  'Shoulder.L': [0.05, 0, 0.12],
  'Elbow.L': [-0.18, 0, 0],
  'Wrist.L': [0, 0, 0],
  'Finger.L': [0, 0, -0.35],
  'Thumb.L': [0, 0, -0.2],
  'Hip.L': [0, 0, 0.015],
  'Ankle.L': [0, 0, -0.015],
});

/** 右手提燈籠：手肘彎、拳頭握著提把 */
export const HOLD_LANTERN = {
  'Shoulder.R': [-0.32, 0.1, -0.34],
  'Elbow.R': [-0.62, -0.15, 0],
  'Wrist.R': [0.28, 0, 0],
  'Finger.R': [0, 0, 1.4],
  'Thumb.R': [0.2, 0, 0.9],
};

/** 單腳的步態（phase 0 = 腳跟著地） */
function leg(side, phase, a) {
  const c = Math.cos(TAU * phase);
  const knee = a.kneeStance * bump(phase, 0.1, 0.12) + a.kneeSwing * bump(phase, 0.7, 0.24) + 0.04;
  return {
    [`Hip.${side}`]: [-a.hip * c - a.hipBias, 0, (side === 'L' ? 1 : -1) * 0.02],
    [`Knee.${side}`]: [knee, 0, 0],
    [`Ankle.${side}`]: [a.push * bump(phase, 0.6, 0.11) - a.clear * bump(phase, 0.8, 0.14) - 0.06 * bump(phase, 0.02, 0.06), 0, 0],
    [`Toe.${side}`]: [-a.toe * bump(phase, 0.58, 0.09), 0, 0],
  };
}

/** 走路／跑步循環：腳步、骨盆上下與旋轉、脊椎反向扭轉、手臂反向擺動 */
function gait(a, { lantern = false } = {}) {
  return (t) => {
    const c = Math.cos(TAU * t);
    const pose = addPose(
      leg('L', t, a),
      leg('R', (t + 0.5) % 1, a),
      {
        'Pelvis@': [0, -a.bob * Math.cos(4 * Math.PI * (t - a.bobPhase)) - a.lower, 0],
        Pelvis: [a.lean * 0.3, a.twist * c, a.roll * Math.sin(TAU * t)],
        Spine: [a.lean * 0.5, -a.twist * 0.5 * c, -a.roll * 0.5 * Math.sin(TAU * t)],
        Chest: [a.lean * 0.4, -a.twist * 0.7 * c, 0],
        Neck: [-a.lean * 0.4, a.twist * 0.4 * c, 0],
        Head: [-a.lean * 0.3 + a.bob * 1.5 * Math.cos(4 * Math.PI * t), a.twist * 0.3 * c, 0],
        'Shoulder.L': [a.arm * c, 0, 0.12 + a.armOut],
        'Elbow.L': [-a.elbow - a.elbowSwing * (0.5 + 0.5 * c), 0, 0],
        'Shoulder.R': [-a.arm * c, 0, -0.12 - a.armOut],
        'Elbow.R': [-a.elbow - a.elbowSwing * (0.5 - 0.5 * c), 0, 0],
        'Clavicle.L': [0, 0, 0.03 * c],
        'Clavicle.R': [0, 0, 0.03 * c],
      },
      grip('L', a.fist),
      grip('R', a.fist),
    );
    if (lantern) {
      // 提燈籠的右手：維持提的姿勢，只跟著步伐小幅擺動
      Object.assign(pose, addPose(HOLD_LANTERN, { 'Shoulder.R': [-0.12 * c * a.arm, 0, 0], 'Elbow.R': [-0.15 * a.elbowSwing, 0, 0] }));
    }
    return pose;
  };
}

export const WALK = { hip: 0.42, hipBias: 0.03, kneeStance: 0.18, kneeSwing: 0.95, push: 0.35, clear: 0.18, toe: 0.45, bob: 0.018, bobPhase: 0, lower: 0.005, lean: 0.06, twist: 0.1, roll: 0.04, arm: 0.42, armOut: 0.04, elbow: 0.25, elbowSwing: 0.25, fist: 0.35 };
export const RUN = { hip: 0.72, hipBias: 0.12, kneeStance: 0.35, kneeSwing: 1.75, push: 0.55, clear: 0.15, toe: 0.6, bob: 0.04, bobPhase: 0.15, lower: 0.03, lean: 0.24, twist: 0.16, roll: 0.03, arm: 0.75, armOut: 0.08, elbow: 1.25, elbowSwing: 0.35, fist: 0.85 };

const L_ARM_REACH = { 'Shoulder.L': [-1.35, 0.15, 0.08], 'Elbow.L': [-0.15, 0, 0], 'Wrist.L': [-0.15, 0, 0] };

/**
 * 主角的全部動畫片段。lantern=true 時右手一直提著燈籠（除了需要雙手的動作）。
 * 事件（events）：動作的接觸時間點，例如撿起道具的瞬間、鑰匙轉動、點火。
 */
export function playerClips(opts = {}) {
  const lantern = opts.lantern ?? true;
  const bones = ANIMATED_BONES;
  const base = addPose(REST, lantern ? HOLD_LANTERN : {});
  const withBase = (p) => addPose(REST, lantern ? HOLD_LANTERN : {}, p);
  const kf = (keys) => timeline(keys.map(([t, p]) => [t, withBase(p)]));
  const crouch = { 'Pelvis@': [0, -0.3, -0.04], Pelvis: [0.15, 0, 0], Spine: [0.35, 0, 0], Chest: [0.2, 0, 0], Neck: [-0.2, 0, 0], Head: [0.1, 0, 0], ...both({ 'Hip.L': [-1.35, 0, 0.12], 'Knee.L': [1.75, 0, 0], 'Ankle.L': [-0.45, 0, 0], 'Toe.L': [-0.3, 0, 0] }) };
  const clip = (name, duration, poseAt, o = {}) => makeClip(name, duration, poseAt, { bones, loop: o.loop, rest: { pelvis: [0, opts.pelvisY ?? 0.74, 0] }, events: o.events, fps: o.fps });

  return {
    Idle: clip(
      'Idle',
      4,
      (t) =>
        addPose(base, {
          Chest: [0.025 * Math.sin(TAU * t * 2), 0, 0],
          Spine: [0, 0, 0.015 * Math.sin(TAU * t)],
          'Pelvis@': [0.012 * Math.sin(TAU * t), -0.004 + 0.003 * Math.sin(TAU * t * 2), 0],
          Neck: [0, 0.35 * bump(t, 0.35, 0.15) - 0.3 * bump(t, 0.75, 0.12), 0],
          Head: [-0.05 * bump(t, 0.35, 0.15), 0.15 * bump(t, 0.35, 0.15) - 0.12 * bump(t, 0.75, 0.12), 0],
          'Shoulder.L': [0.03 * Math.sin(TAU * t * 2), 0, 0],
        }),
      { loop: true },
    ),
    Walk: clip('Walk', 1, gait(WALK, { lantern }), { loop: true }),
    Run: clip('Run', 1, gait(RUN, { lantern }), { loop: true }),
    StartMoving: clip('StartMoving', 0.3, kf([
      [0, {}],
      [0.4, { Spine: [0.22, 0, 0], Chest: [0.1, 0, 0], 'Hip.L': [-0.5, 0, 0], 'Knee.L': [0.8, 0, 0], 'Pelvis@': [0, -0.03, 0], 'Shoulder.L': [0.35, 0, 0.1] }],
      [1, { Spine: [0.12, 0, 0], 'Hip.L': [-0.3, 0, 0], 'Knee.L': [0.3, 0, 0] }],
    ])),
    StopMoving: clip('StopMoving', 0.45, kf([
      [0, { Spine: [0.15, 0, 0], 'Hip.L': [-0.35, 0, 0], 'Hip.R': [0.25, 0, 0], 'Knee.R': [0.4, 0, 0] }],
      [0.45, { Spine: [-0.06, 0, 0], Chest: [-0.04, 0, 0], 'Pelvis@': [0, -0.025, 0], 'Knee.L': [0.15, 0, 0], 'Knee.R': [0.15, 0, 0] }],
      [1, {}],
    ])),
    TurnLeft: clip('TurnLeft', 0.45, kf([
      [0, {}],
      [0.35, { Pelvis: [0, 0.3, 0], Spine: [0, 0.15, 0], Head: [0, 0.25, 0], 'Hip.L': [-0.35, 0.25, 0], 'Knee.L': [0.6, 0, 0], 'Pelvis@': [0, -0.02, 0] }],
      [0.7, { Pelvis: [0, 0.1, 0], 'Hip.R': [-0.3, 0.2, 0], 'Knee.R': [0.55, 0, 0] }],
      [1, {}],
    ])),
    TurnRight: clip('TurnRight', 0.45, kf([
      [0, {}],
      [0.35, { Pelvis: [0, -0.3, 0], Spine: [0, -0.15, 0], Head: [0, -0.25, 0], 'Hip.R': [-0.35, -0.25, 0], 'Knee.R': [0.6, 0, 0], 'Pelvis@': [0, -0.02, 0] }],
      [0.7, { Pelvis: [0, -0.1, 0], 'Hip.L': [-0.3, -0.2, 0], 'Knee.L': [0.55, 0, 0] }],
      [1, {}],
    ])),
    Crouch: clip('Crouch', 2, (t) => withBase(addPose(crouch, { Chest: [0.03 * Math.sin(TAU * t), 0, 0] })), { loop: true }),
    // 撿拾：彎腰屈膝 → 左手伸到地面 → 握住（contact）→ 起身、拿到胸前
    Pickup: clip('Pickup', 1.2, kf([
      [0, {}],
      [0.35, { ...crouch, 'Shoulder.L': [-0.9, 0, 0.1], 'Elbow.L': [-0.1, 0, 0], 'Wrist.L': [-0.3, 0, 0], ...grip('L', 0) }],
      [0.5, { ...crouch, 'Shoulder.L': [-0.85, 0, 0.1], 'Elbow.L': [-0.15, 0, 0], ...grip('L', 1) }],
      [0.8, { Spine: [0.1, 0, 0], 'Shoulder.L': [-0.35, 0, 0.05], 'Elbow.L': [-1.6, 0.3, 0], ...grip('L', 1) }],
      [1, { 'Shoulder.L': [-0.2, 0, 0.05], 'Elbow.L': [-1.2, 0.2, 0], ...grip('L', 0.8) }],
    ]), { events: [{ t: 0.52, name: 'contact' }, { t: 0.95, name: 'stow' }] }),
    // 調查：身體前傾、歪頭靠近看，手指著物件
    Inspect: clip('Inspect', 1.6, kf([
      [0, {}],
      [0.3, { Spine: [0.25, 0, 0], Chest: [0.12, 0, 0], Neck: [0.1, 0, 0.1], Head: [0.2, 0.1, 0.15], 'Shoulder.L': [-0.5, 0, 0.05], 'Elbow.L': [-1.5, 0.2, 0], 'Wrist.L': [0.2, 0, 0], ...grip('L', 0.6) }],
      [0.65, { Spine: [0.3, 0, 0], Chest: [0.12, 0, 0], Head: [0.25, -0.1, -0.12], 'Shoulder.L': [-1.1, 0.1, 0.05], 'Elbow.L': [-0.3, 0, 0], ...grip('L', 0.5), 'Finger.L': [0, 0, -0.1] }],
      [1, {}],
    ]), { events: [{ t: 0.5, name: 'look' }] }),
    Reach: clip('Reach', 0.5, kf([
      [0, {}],
      [1, { Spine: [0.12, 0, 0], ...L_ARM_REACH, ...grip('L', 0) }],
    ])),
    Grab: clip('Grab', 0.45, kf([
      [0, { Spine: [0.12, 0, 0], ...L_ARM_REACH, ...grip('L', 0) }],
      [1, { Spine: [0.12, 0, 0], ...L_ARM_REACH, 'Elbow.L': [-0.35, 0, 0], ...grip('L', 1) }],
    ]), { events: [{ t: 0.6, name: 'contact' }] }),
    Release: clip('Release', 0.5, kf([
      [0, { Spine: [0.12, 0, 0], ...L_ARM_REACH, ...grip('L', 1) }],
      [0.4, { Spine: [0.12, 0, 0], ...L_ARM_REACH, ...grip('L', 0) }],
      [1, {}],
    ]), { events: [{ t: 0.35, name: 'release' }] }),
    // 開門：伸手 → 握住門把（grab）→ 轉動手腕解鎖（unlock）→ 往後拉、退半步（swing）→ 放手
    OpenDoor: clip('OpenDoor', 1.5, kf([
      [0, {}],
      [0.25, { Spine: [0.12, 0, 0], ...L_ARM_REACH, 'Shoulder.L': [-1.2, 0.1, 0.1], ...grip('L', 0) }],
      [0.35, { Spine: [0.12, 0, 0], ...L_ARM_REACH, 'Shoulder.L': [-1.2, 0.1, 0.1], ...grip('L', 1) }],
      [0.5, { Spine: [0.12, 0, 0], ...L_ARM_REACH, 'Shoulder.L': [-1.2, 0.1, 0.1], 'Elbow.L': [-0.2, 0.9, 0], 'Wrist.L': [0, 0.6, 0], ...grip('L', 1) }],
      [0.8, { Spine: [-0.05, 0.15, 0], 'Pelvis@': [0, -0.02, -0.12], 'Hip.R': [0.3, 0, 0], 'Knee.R': [0.3, 0, 0], 'Shoulder.L': [-0.8, 0.3, 0.25], 'Elbow.L': [-0.9, 0.4, 0], ...grip('L', 1) }],
      [0.92, { 'Shoulder.L': [-0.6, 0.2, 0.2], 'Elbow.L': [-0.6, 0, 0], ...grip('L', 0) }],
      [1, {}],
    ]), { events: [{ t: 0.33, name: 'grab' }, { t: 0.48, name: 'unlock' }, { t: 0.6, name: 'swing' }, { t: 0.9, name: 'release' }] }),
    CloseDoor: clip('CloseDoor', 1.2, kf([
      [0, {}],
      [0.3, { Spine: [0.1, 0, 0], 'Shoulder.L': [-1.1, 0.3, 0.3], 'Elbow.L': [-0.8, 0, 0], ...grip('L', 0) }],
      [0.65, { Spine: [0.2, 0, 0], 'Pelvis@': [0, -0.02, 0.08], 'Hip.L': [-0.3, 0, 0], 'Knee.L': [0.3, 0, 0], ...L_ARM_REACH, ...grip('L', 0) }],
      [1, {}],
    ]), { events: [{ t: 0.4, name: 'swing' }, { t: 0.7, name: 'shut' }] }),
    // 用鑰匙：手伸到鎖的高度 → 插入（insert）→ 手腕轉兩下（turn）
    UseKey: clip('UseKey', 1.3, kf([
      [0, {}],
      [0.25, { Spine: [0.15, 0, 0], 'Shoulder.L': [-1.05, 0.15, 0.05], 'Elbow.L': [-0.35, 0, 0], ...grip('L', 0.9) }],
      [0.45, { Spine: [0.18, 0, 0], 'Shoulder.L': [-1.15, 0.15, 0.05], 'Elbow.L': [-0.2, 0, 0], ...grip('L', 1) }],
      [0.6, { Spine: [0.18, 0, 0], 'Shoulder.L': [-1.15, 0.15, 0.05], 'Elbow.L': [-0.2, 1.0, 0], 'Wrist.L': [0, 0.5, 0], ...grip('L', 1) }],
      [0.75, { Spine: [0.18, 0, 0], 'Shoulder.L': [-1.15, 0.15, 0.05], 'Elbow.L': [-0.2, 0.2, 0], ...grip('L', 1) }],
      [0.85, { Spine: [0.18, 0, 0], 'Shoulder.L': [-1.15, 0.15, 0.05], 'Elbow.L': [-0.2, 1.0, 0], 'Wrist.L': [0, 0.5, 0], ...grip('L', 1) }],
      [1, {}],
    ]), { events: [{ t: 0.45, name: 'insert' }, { t: 0.85, name: 'turn' }] }),
    // 轉轆轤：雙手往前，左手由 IK 沿著把手的圓周移動
    CrankWell: clip('CrankWell', 1, (t) => withBase({ 'Pelvis@': [0, -0.04, 0], Spine: [0.22 + 0.06 * Math.sin(TAU * t), 0.05 * Math.cos(TAU * t), 0], Chest: [0.08, 0, 0], 'Hip.L': [-0.25, 0, 0.05], 'Knee.L': [0.35, 0, 0], 'Knee.R': [0.15, 0, 0], 'Shoulder.L': [-1.0, 0, 0.05], 'Elbow.L': [-0.5, 0, 0], ...grip('L', 1) }), { loop: true, events: [{ t: 0.99, name: 'turn' }] }),
    // 點燈：把燈籠舉到石燈的火口（右手由 IK 對準），點火（ignite）
    LightLantern: clip('LightLantern', 1.6, kf([
      [0, {}],
      [0.35, { Spine: [0.15, -0.15, 0], Chest: [0.08, -0.1, 0], 'Shoulder.R': [-1.15, 0.1, -0.2], 'Elbow.R': [-0.35, 0, 0], 'Wrist.R': [0.3, 0, 0], 'Shoulder.L': [-0.3, 0, 0.2], 'Elbow.L': [-0.8, 0, 0] }],
      [0.6, { Spine: [0.2, -0.15, 0], Chest: [0.1, -0.1, 0], 'Shoulder.R': [-1.25, 0.1, -0.15], 'Elbow.R': [-0.25, 0, 0], 'Wrist.R': [0.35, 0, 0], 'Shoulder.L': [-0.3, 0, 0.2], 'Elbow.L': [-0.8, 0, 0] }],
      [1, {}],
    ]), { events: [{ t: 0.55, name: 'ignite' }] }),
    // 獻上供品：雙手捧在胸前、鞠躬、放下（place）
    OfferItem: clip('OfferItem', 1.8, kf([
      [0, {}],
      [0.3, { 'Shoulder.L': [-0.75, -0.3, 0.05], 'Elbow.L': [-1.0, 0, 0], 'Shoulder.R': [-0.75, 0.3, -0.05], 'Elbow.R': [-1.0, 0, 0], 'Wrist.L': [0.3, 0, 0], 'Wrist.R': [0.3, 0, 0], ...grip('L', 0.3), ...grip('R', 0.6) }],
      [0.55, { Spine: [0.35, 0, 0], Chest: [0.2, 0, 0], Head: [0.2, 0, 0], 'Pelvis@': [0, -0.02, -0.03], 'Shoulder.L': [-1.1, -0.3, 0.05], 'Elbow.L': [-0.4, 0, 0], 'Shoulder.R': [-1.1, 0.3, -0.05], 'Elbow.R': [-0.4, 0, 0], ...grip('L', 0), ...grip('R', 0.6) }],
      [0.8, { Spine: [0.15, 0, 0], Head: [0.1, 0, 0] }],
      [1, {}],
    ]), { events: [{ t: 0.55, name: 'place' }] }),
    Talk: clip('Talk', 2.4, (t) => addPose(base, { Head: [0.06 * Math.sin(TAU * t * 2), 0.08 * Math.sin(TAU * t), 0.04 * Math.sin(TAU * t)], Neck: [0, 0.05 * Math.sin(TAU * t), 0], 'Shoulder.L': [-0.25 * bump(t, 0.4, 0.25), 0, 0.15 * bump(t, 0.4, 0.25)], 'Elbow.L': [-0.9 * bump(t, 0.4, 0.25), 0.3 * bump(t, 0.4, 0.25), 0] }), { loop: true }),
    Startled: clip('Startled', 0.8, kf([
      [0, {}],
      [0.2, { 'Pelvis@': [0, 0.06, -0.12], Spine: [-0.25, 0, 0], Chest: [-0.15, 0, 0], Head: [-0.25, 0, 0], ...both({ 'Shoulder.L': [-0.6, 0, 0.6], 'Elbow.L': [-1.2, 0, 0], ...grip('L', 0) }), 'Hip.R': [0.35, 0, 0], 'Knee.R': [0.5, 0, 0] }],
      [0.55, { 'Pelvis@': [0, -0.02, -0.15], Spine: [-0.1, 0, 0], 'Shoulder.L': [-0.4, 0, 0.3], 'Elbow.L': [-1.0, 0, 0] }],
      [1, {}],
    ])),
    Cheer: clip('Cheer', 1.6, (t) => {
      const jump = Math.max(0, Math.sin(TAU * t * 2)) * (1 - t * 0.3);
      const up = bump(t, 0.5, 0.48);
      return withBase({
        'Pelvis@': [0, jump * 0.18 - (1 - jump) * 0.04 * up, 0],
        Spine: [-0.1 * up, 0, 0],
        Head: [-0.2 * up, 0, 0],
        ...both({ 'Hip.L': [-0.3 * (1 - jump) * up, 0, 0], 'Knee.L': [0.6 * (1 - jump) * up, 0, 0], 'Ankle.L': [0.4 * jump, 0, 0] }),
        'Shoulder.L': [-2.6 * up, 0, 0.3 * up],
        'Elbow.L': [-0.3 * up, 0, 0],
        ...grip('L', 0.9 * up),
      });
    }),
    // 掉落：腳下一空，手往上抓、身體後仰（循環，直到畫面淡出）
    Fall: clip('Fall', 0.7, (t) => withBase({
      'Pelvis@': [0, 0, 0],
      Spine: [-0.35, 0.08 * Math.sin(TAU * t), 0],
      Chest: [-0.15, 0, 0],
      Head: [-0.35, 0, 0],
      ...both({ 'Hip.L': [-0.5, 0, 0.1], 'Knee.L': [0.9, 0, 0] }),
      'Shoulder.L': [-2.4 + 0.3 * Math.sin(TAU * t), 0, 0.5],
      'Elbow.L': [-0.4, 0, 0],
      ...grip('L', 0.2),
    }), { loop: true }),
    // 回到安全的地方後起身：半蹲 → 站直、甩甩頭
    Recover: clip('Recover', 1.1, kf([
      [0, { 'Pelvis@': [0, -0.28, 0], Spine: [0.45, 0, 0], Chest: [0.15, 0, 0], Head: [0.2, 0, 0], ...both({ 'Hip.L': [-1.2, 0, 0.1], 'Knee.L': [1.6, 0, 0], 'Ankle.L': [-0.3, 0, 0] }), 'Shoulder.L': [-0.4, 0, 0.2], 'Elbow.L': [-0.6, 0, 0] }],
      [0.45, { 'Pelvis@': [0, -0.1, 0], Spine: [0.2, 0, 0], Head: [0.05, 0.25, 0], ...both({ 'Hip.L': [-0.45, 0, 0.05], 'Knee.L': [0.6, 0, 0] }) }],
      [0.7, { Head: [0, -0.25, 0] }],
      [1, {}],
    ])),
  };
}

/** 老奶奶：打盹、揉眼睛、起身、招手、點頭、縫補（坐在마루上） */
export function grandmaClips() {
  const bones = ANIMATED_BONES;
  const seat = { 'Pelvis@': [0, -0.33, -0.05], ...both({ 'Hip.L': [-1.5, 0, 0.18], 'Knee.L': [1.5, 0, 0], 'Ankle.L': [0.05, 0, 0] }), Spine: [0.25, 0, 0], Chest: [0.18, 0, 0], Neck: [0.05, 0, 0] };
  const hands = both({ 'Shoulder.L': [-0.45, 0, 0.12], 'Elbow.L': [-1.1, -0.4, 0], 'Wrist.L': [0.3, 0, 0], ...grip('L', 0.4) });
  const clip = (name, duration, f, o = {}) => makeClip(name, duration, f, { bones, loop: o.loop, rest: { pelvis: [0, 0.8, 0] }, events: o.events });
  const sit = (p) => addPose(REST, seat, hands, p);
  return {
    Sleep: clip('Sleep', 3.2, (t) => sit({ Head: [0.45 + 0.1 * Math.sin(TAU * t), 0, 0.12], Neck: [0.25, 0, 0], Chest: [0.03 * Math.sin(TAU * t), 0, 0] }), { loop: true }),
    RubEyes: clip('RubEyes', 1.6, timeline([
      [0, sit({ Head: [0.45, 0, 0.1] })],
      [0.3, sit({ Head: [0.1, 0, 0], ...both({ 'Shoulder.L': [-1.3, -0.3, 0.1], 'Elbow.L': [-2.0, 0, 0], 'Wrist.L': [0.4, 0, 0] }) })],
      [0.5, sit({ Head: [0.15, 0.1, 0], ...both({ 'Shoulder.L': [-1.35, -0.3, 0.1], 'Elbow.L': [-2.1, 0.2, 0], 'Wrist.L': [0.2, 0.3, 0] }) })],
      [0.7, sit({ Head: [0.1, -0.1, 0], ...both({ 'Shoulder.L': [-1.3, -0.3, 0.1], 'Elbow.L': [-2.0, -0.2, 0], 'Wrist.L': [0.4, 0, 0] }) })],
      [1, sit({ Head: [-0.05, 0, 0] })],
    ])),
    StandUp: clip('StandUp', 1.6, timeline([
      [0, sit({})],
      [0.45, addPose(REST, { 'Pelvis@': [0, -0.22, 0.05], Spine: [0.6, 0, 0], Chest: [0.2, 0, 0], ...both({ 'Hip.L': [-1.1, 0, 0.1], 'Knee.L': [1.2, 0, 0], 'Shoulder.L': [-0.5, 0, 0.1], 'Elbow.L': [-0.3, 0, 0] }) })],
      [1, addPose(REST, { Spine: [0.22, 0, 0], Chest: [0.12, 0, 0], Neck: [-0.1, 0, 0] })],
    ])),
    Idle: clip('Idle', 3, (t) => addPose(REST, { Spine: [0.22, 0, 0], Chest: [0.12 + 0.02 * Math.sin(TAU * t), 0, 0], Neck: [-0.1, 0, 0], Head: [0, 0.1 * Math.sin(TAU * t), 0] }), { loop: true }),
    Wave: clip('Wave', 1.6, (t) => addPose(REST, { Spine: [0.18, 0, 0], Chest: [0.1, 0, 0], Head: [-0.05, 0, 0.1], 'Shoulder.L': [-0.4, 0, 1.4 * bump(t, 0.5, 0.5)], 'Elbow.L': [-1.2 * bump(t, 0.5, 0.5), 0, 0], 'Wrist.L': [0, 0, 0.5 * Math.sin(TAU * t * 3) * bump(t, 0.5, 0.4)], ...grip('L', 0) }), { loop: true }),
    Nod: clip('Nod', 1.2, (t) => addPose(REST, { Spine: [0.2, 0, 0], Head: [0.3 * bump(t, 0.3, 0.2) + 0.25 * bump(t, 0.7, 0.2), 0, 0] })),
    Sew: clip('Sew', 1.4, (t) => sit({ Head: [0.35, 0, 0], 'Shoulder.L': [-0.6, 0, 0.1], 'Elbow.L': [-1.3 - 0.4 * Math.sin(TAU * t), 0.3, 0], 'Wrist.L': [0.2 * Math.sin(TAU * t), 0, 0], ...grip('L', 0.8) }), { loop: true }),
    Talk: clip('Talk', 2.4, (t) => addPose(REST, { Spine: [0.2, 0, 0], Chest: [0.1, 0, 0], Head: [0.05 * Math.sin(TAU * t * 2), 0.1 * Math.sin(TAU * t), 0], 'Shoulder.L': [-0.3 * bump(t, 0.5, 0.3), 0, 0.1], 'Elbow.L': [-1.0 * bump(t, 0.5, 0.3), 0, 0] }), { loop: true }),
  };
}

/** 도깨비：呼吸、大笑（肩膀抖動、仰頭）、說話手勢、吃驚、揮棒歡呼 */
export function dokkaebiClips() {
  const bones = ANIMATED_BONES;
  const stance = addPose(REST, both({ 'Shoulder.L': [0, 0, 0.35], 'Hip.L': [-0.05, 0, 0.12], 'Knee.L': [0.12, 0, 0], 'Ankle.L': [-0.05, 0, -0.1] }), { 'Pelvis@': [0, -0.04, 0], 'Shoulder.R': [-0.5, 0, -0.45], 'Elbow.R': [-0.8, 0, 0], ...grip('R', 1) });
  const clip = (name, duration, f, o = {}) => makeClip(name, duration, f, { bones, loop: o.loop, rest: { pelvis: [0, 1.15, 0] }, events: o.events });
  return {
    Idle: clip('Idle', 3, (t) => addPose(stance, { Chest: [0.04 * Math.sin(TAU * t), 0, 0], 'Clavicle.L': [0, 0, 0.04 * Math.sin(TAU * t)], 'Clavicle.R': [0, 0, -0.04 * Math.sin(TAU * t)], Head: [0, 0.15 * Math.sin(TAU * t * 0.5), 0.05 * Math.sin(TAU * t)] }), { loop: true }),
    Laugh: clip('Laugh', 1.8, (t) => {
      const shake = Math.sin(TAU * t * 7) * bump(t, 0.5, 0.48);
      return addPose(stance, { Spine: [-0.2 * bump(t, 0.5, 0.45), 0, 0], Chest: [-0.15 * bump(t, 0.5, 0.45) + 0.05 * shake, 0, 0], Head: [-0.45 * bump(t, 0.5, 0.45), 0, 0.08 * shake], 'Clavicle.L': [0, 0, 0.12 * shake], 'Clavicle.R': [0, 0, -0.12 * shake], 'Shoulder.L': [-0.3, 0, 0.3], 'Elbow.L': [-1.6 * bump(t, 0.5, 0.45), 0, 0], 'Pelvis@': [0, 0.02 * shake, 0] });
    }),
    Talk: clip('Talk', 2, (t) => addPose(stance, { Head: [0.08 * Math.sin(TAU * t * 2), 0.12 * Math.sin(TAU * t), 0], 'Shoulder.L': [-0.6 * bump(t, 0.4, 0.3), 0, 0.4], 'Elbow.L': [-1.2 * bump(t, 0.4, 0.3), 0.4, 0], ...grip('L', 0.2) }), { loop: true }),
    Startled: clip('Startled', 0.8, timeline([
      [0, stance],
      [0.25, addPose(stance, { 'Pelvis@': [0, 0.15, -0.3], Spine: [-0.3, 0, 0], Head: [-0.3, 0, 0], ...both({ 'Shoulder.L': [-0.8, 0, 0.9], 'Elbow.L': [-0.6, 0, 0] }) })],
      [1, stance],
    ])),
    Cheer: clip('Cheer', 1.4, (t) => addPose(stance, { 'Pelvis@': [0, 0.25 * Math.max(0, Math.sin(TAU * t * 2)), 0], 'Shoulder.R': [-2.8 * bump(t, 0.5, 0.48), 0, -0.2], 'Elbow.R': [-0.2, 0, 0], 'Shoulder.L': [-2.2 * bump(t, 0.5, 0.48), 0, 0.3], Head: [-0.3 * bump(t, 0.5, 0.45), 0, 0] })),
    Sulk: clip('Sulk', 2, (t) => addPose(stance, { Spine: [0.25, 0, 0], Head: [0.35, 0.2 * Math.sin(TAU * t * 0.5), 0], both: [0, 0, 0], 'Shoulder.L': [-0.6, -0.6, 0.2], 'Elbow.L': [-1.8, 0, 0] }), { loop: true }),
  };
}

/** 主角需要的全部動作（計畫規格） */
export const PLAYER_STATES = ['Idle', 'Walk', 'Run', 'StartMoving', 'StopMoving', 'TurnLeft', 'TurnRight', 'Crouch', 'Pickup', 'Inspect', 'Reach', 'Grab', 'Release', 'OpenDoor', 'CloseDoor', 'UseKey', 'CrankWell', 'LightLantern', 'OfferItem', 'Talk', 'Startled', 'Cheer', 'Fall', 'Recover'];
