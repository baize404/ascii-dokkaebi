import { AnimationClip, Euler, NumberKeyframeTrack, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';

/**
 * 用「姿勢函式」產生 three 的 AnimationClip：在時間軸上取樣，每根骨頭一條四元數軌道。
 * 姿勢是相對綁定姿勢的尤拉角 { 骨頭名稱: [x, y, z] }；'Pelvis@' 是骨盆的位移 [x, y, z]。
 * 產生的是標準 AnimationClip，交給 AnimationMixer 播放與 crossfade。
 */
export function makeClip(name, duration, poseAt, { bones, fps = 30, loop = false, rest = {}, events = [] }) {
  const n = Math.max(2, Math.round(duration * fps) + (loop ? 1 : 1));
  const times = [];
  const quats = Object.fromEntries(bones.map((b) => [b, []]));
  const pelvis = [];
  const e = new Euler();
  const q = new Quaternion();
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    times.push(k * duration);
    const pose = poseAt(loop ? k % 1 : k);
    for (const b of bones) {
      const r = pose[b] ?? [0, 0, 0];
      e.set(r[0], r[1], r[2], 'YXZ');
      q.setFromEuler(e);
      quats[b].push(q.x, q.y, q.z, q.w);
    }
    const off = pose['Pelvis@'] ?? [0, 0, 0];
    const base = rest.pelvis ?? [0, 0, 0];
    pelvis.push(base[0] + off[0], base[1] + off[1], base[2] + off[2]);
  }
  const tracks = bones.map((b) => new QuaternionKeyframeTrack(`${b}.quaternion`, times, quats[b]));
  if (rest.pelvis) tracks.push(new VectorKeyframeTrack('Pelvis.position', times, pelvis));
  const clip = new AnimationClip(name, duration, tracks);
  clip.userData = { loop, events: [...events].sort((a, b) => a.t - b.t) };
  return clip;
}

/** 0–1 之間的平滑步進 */
export const smooth = (k) => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};
/** 以 center 為中心、半寬 width 的平滑凸起（0–1） */
export const bump = (t, center, width) => {
  let d = Math.abs(t - center);
  d = Math.min(d, 1 - d); // 循環
  return d >= width ? 0 : 0.5 + 0.5 * Math.cos((d / width) * Math.PI);
};

/**
 * 關鍵姿勢時間軸：[[t, pose], ...]，兩個關鍵姿勢之間用平滑步進內插（每根骨頭各自內插）。
 */
export function timeline(keys) {
  return (t) => {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [t0, p0] = keys[i];
    const [t1, p1] = keys[i + 1];
    const k = smooth((t - t0) / Math.max(1e-6, t1 - t0));
    return mixPose(p0, p1, k);
  };
}

export function mixPose(a, b, k) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key] ?? [0, 0, 0];
    const y = b[key] ?? [0, 0, 0];
    out[key] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
  }
  return out;
}

/** 把多個姿勢相加（例如基本姿勢＋呼吸） */
export function addPose(...poses) {
  const out = {};
  for (const p of poses) for (const [k, v] of Object.entries(p)) out[k] = out[k] ? [out[k][0] + v[0], out[k][1] + v[1], out[k][2] + v[2]] : [...v];
  return out;
}

export { NumberKeyframeTrack };
