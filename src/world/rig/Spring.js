import { Vector3 } from 'three';

const origin = new Vector3();
const restTip = new Vector3();
const vel = new Vector3();
const childOffset = new Vector3();

/**
 * 彈簧骨（次級動態）：辮子、緞帶、衣帶、裙擺、燈籠。
 * 每根骨頭的尾端是一個質點：慣性（Verlet）＋回到動畫姿勢的彈力＋重力＋風，再固定長度。
 * 然後把骨頭轉向質點。依序從根部處理到末端，所以整條鏈會自然地拖曳、擺盪。
 *
 * colliders：[{ object, radius, offset }] 球形碰撞體（腿、身體），避免裙擺、燈籠穿進身體。
 */
export class SpringChain {
  constructor(bones, { stiffness = 0.12, damping = 0.86, gravity = 0.6, windScale = 1, tipLength = 0.15, colliders = [] } = {}) {
    this.links = bones.map((bone, i) => {
      const next = bones[i + 1];
      const local = next ? next.position.clone() : bone.userData.tip?.clone() ?? new Vector3(0, -tipLength, 0);
      return { bone, local, length: local.length(), pos: null, prev: null, rest: bone.quaternion.clone() };
    });
    Object.assign(this, { stiffness, damping, gravity, windScale, colliders });
  }

  reset() {
    for (const l of this.links) l.pos = null;
  }

  /** @param wind 世界座標的風力向量（m/s² 左右的量級） */
  update(dt, wind = null) {
    if (dt <= 0) return;
    const step = Math.min(dt, 1 / 30);
    for (const l of this.links) {
      const bone = l.bone;
      // 彈簧骨不在動畫片段裡：每幀先回到綁定姿勢，再依物理轉向（避免上一幀的旋轉累積）
      if (!bone.userData.animated) bone.quaternion.copy(l.rest);
      bone.updateMatrixWorld(true);
      bone.getWorldPosition(origin);
      // 動畫姿勢下尾端應該在的位置
      childOffset.copy(l.local).applyQuaternion(bone.getWorldQuaternion(bone.userData._wq ??= bone.quaternion.clone()));
      restTip.copy(origin).add(childOffset);
      if (!l.pos) {
        l.pos = restTip.clone();
        l.prev = restTip.clone();
      }
      vel.subVectors(l.pos, l.prev).multiplyScalar(this.damping);
      l.prev.copy(l.pos);
      l.pos.add(vel);
      // 剛性可以是陣列：靠近根部比較硬、末端比較軟（辮子、緞帶）
      l.pos.lerp(restTip, Array.isArray(this.stiffness) ? this.stiffness[this.links.indexOf(l)] ?? 0.05 : this.stiffness);
      l.pos.y -= this.gravity * step * step * 60;
      if (wind) l.pos.addScaledVector(wind, this.windScale * step * step * 60);
      for (const c of this.colliders) {
        const center = c.object.getWorldPosition(new Vector3());
        if (c.offset) center.add(c.offset);
        const d = l.pos.distanceTo(center);
        if (d < c.radius) l.pos.sub(center).setLength(c.radius).add(center);
      }
      // 固定長度
      l.pos.sub(origin).setLength(l.length).add(origin);
      // 把骨頭轉向質點
      const from = childOffset.clone().add(origin);
      aim(bone, origin, from, l.pos);
    }
  }
}

function aim(bone, o, from, to) {
  const f = from.clone().sub(o).normalize();
  const t = to.clone().sub(o).normalize();
  const q = bone.userData._q ?? (bone.userData._q = bone.quaternion.clone());
  q.setFromUnitVectors(f, t);
  const wq = bone.getWorldQuaternion(bone.userData._wq2 ??= bone.quaternion.clone()).premultiply(q);
  const pq = bone.parent.getWorldQuaternion(bone.userData._pq ??= bone.quaternion.clone()).invert();
  bone.quaternion.copy(pq.multiply(wq));
  bone.updateMatrixWorld(true);
}
