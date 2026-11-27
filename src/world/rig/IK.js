import { Quaternion, Vector3 } from 'three';

const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const t = new Vector3();
const dir = new Vector3();
const pole = new Vector3();
const elbow = new Vector3();
const from = new Vector3();
const to = new Vector3();
const q = new Quaternion();
const wq = new Quaternion();
const pq = new Quaternion();

/** 旋轉骨頭，讓「骨頭原點 → fromPoint」的方向轉到「骨頭原點 → toPoint」（世界座標） */
export function aimBone(bone, fromPoint, toPoint, weight = 1) {
  bone.getWorldPosition(a);
  from.subVectors(fromPoint, a).normalize();
  to.subVectors(toPoint, a).normalize();
  if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
  q.setFromUnitVectors(from, to);
  if (weight < 1) q.slerp(new Quaternion(), 1 - weight);
  bone.getWorldQuaternion(wq);
  wq.premultiply(q);
  bone.parent.getWorldQuaternion(pq);
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateMatrixWorld(true);
}

/**
 * 解析式雙骨 IK（手臂：肩→肘→腕；腿：髖→膝→踝）。
 * @param upper 上段骨（肩／髖）
 * @param lower 下段骨（肘／膝）
 * @param end   末端骨（腕／踝）
 * @param target 末端要到達的世界座標
 * @param poleTarget 關節（肘／膝）要朝向的世界座標
 * @param weight 0–1，和動畫姿勢混合
 * @returns 末端和目標的距離（到不了時 > 0）
 */
export function solveTwoBone(upper, lower, end, target, poleTarget, weight = 1) {
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  const lenA = a.distanceTo(b);
  const lenB = b.distanceTo(c);
  t.copy(target);
  dir.subVectors(t, a);
  const dist = Math.min(Math.max(dir.length(), Math.abs(lenA - lenB) + 1e-4), lenA + lenB - 1e-4);
  dir.normalize();
  pole.subVectors(poleTarget, a);
  pole.addScaledVector(dir, -pole.dot(dir));
  if (pole.lengthSq() < 1e-8) pole.subVectors(b, a).addScaledVector(dir, -b.clone().sub(a).dot(dir));
  pole.normalize();
  const cos = (lenA * lenA + dist * dist - lenB * lenB) / (2 * lenA * dist);
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  elbow.copy(a).addScaledVector(dir, lenA * cos).addScaledVector(pole, lenA * sin);
  aimBone(upper, b, elbow, weight);
  end.getWorldPosition(c);
  lower.getWorldPosition(b);
  const goal = a.clone().addScaledVector(dir, dist);
  aimBone(lower, c, goal, weight);
  end.getWorldPosition(c);
  return c.distanceTo(target);
}
