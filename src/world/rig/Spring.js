import { Matrix4, Quaternion, Vector3 } from 'three';

const origin = new Vector3();
const restTip = new Vector3();
const vel = new Vector3();
const childOffset = new Vector3();
const tmpCenter = new Vector3();
const tmpFrom = new Vector3();
const curM = new Matrix4();
const wq = new Quaternion();
const wscale = new Vector3();
const aimF = new Vector3();
const aimT = new Vector3();
const aimP = new Vector3();
const aimS = new Vector3();
const aimQ = new Quaternion();
const aimWQ = new Quaternion();
const aimPQ = new Quaternion();
const pp = new Vector3();
const cp = new Vector3();
const ip = new Vector3();
const ps = new Vector3();
const cs = new Vector3();
const pq = new Quaternion();
const cq = new Quaternion();
const iq = new Quaternion();
/** 物理的最長步長（秒） */
const MAX_STEP = 1 / 120;

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
    this.lastH = 0;
    this.hasPrev = false;
  }

  /**
   * 時間修正的 Verlet：每一格的 dt 平均切成等長的小步（最長 1/120 秒），
   * 剛性、阻尼依步長換算，上一步的速度依「這一步 ÷ 上一步」的長度比例縮放。
   * 每一格剛好模擬它經過的時間，所以 60／120／144 Hz 或偶爾掉格時，擺動都一樣平順。
   * @param wind 世界座標的風力向量（m/s² 左右的量級）
   */
  update(dt, wind = null) {
    if (dt <= 0) return;
    const total = Math.min(dt, 0.1);
    const n = Math.max(1, Math.ceil(total / MAX_STEP));
    const h = total / n;
    // 錨點（鏈的父骨頭，例如頭）在這幾個小步之間從上一格的位置平滑移到這一格：
    // 掉格時身體一次移動很多，辮子的根部也不會一次跳過去
    const parent = this.links[0].bone.parent;
    curM.copy(parent.matrixWorld);
    this.prevM ??= new Matrix4();
    if (!this.hasPrev) {
      this.prevM.copy(curM);
      this.hasPrev = true;
    }
    if (n > 1) {
      this.prevM.decompose(pp, pq, ps);
      curM.decompose(cp, cq, cs);
    }
    for (let i = 0; i < n; i++) {
      if (i < n - 1) {
        const a = (i + 1) / n;
        parent.matrixWorld.compose(ip.lerpVectors(pp, cp, a), iq.slerpQuaternions(pq, cq, a), cs);
      } else parent.matrixWorld.copy(curM);
      this.#solve(h, wind);
    }
    this.prevM.copy(curM);
  }

  #solve(h, wind) {
    // 原本的參數是以「每 1/60 秒一格」調出來的，換算成每一步
    const frames = h * 60;
    const damping = Math.pow(this.damping, frames);
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      const bone = l.bone;
      // 彈簧骨不在動畫片段裡：先回到綁定姿勢，再依物理轉向（避免旋轉累積）
      if (!bone.userData.animated) bone.quaternion.copy(l.rest);
      // 注意：不要用 getWorldPosition／getWorldQuaternion，它們會重算父骨頭的矩陣，蓋掉插值的錨點
      bone.updateMatrixWorld(true);
      bone.matrixWorld.decompose(origin, wq, wscale);
      // 動畫姿勢下尾端應該在的位置
      childOffset.copy(l.local).applyQuaternion(wq);
      restTip.copy(origin).add(childOffset);
      if (!l.pos) {
        l.pos = restTip.clone();
        l.prev = restTip.clone();
      }
      if (h > 0) {
        // 上一步的位移換算成這一步的長度（步長改變時速度不變）
        const ratio = this.lastH > 0 ? h / this.lastH : 1;
        vel.subVectors(l.pos, l.prev).multiplyScalar(damping * ratio);
        l.prev.copy(l.pos);
        l.pos.add(vel);
        // 剛性可以是陣列：靠近根部比較硬、末端比較軟（辮子、緞帶）
        const k = Array.isArray(this.stiffness) ? this.stiffness[i] ?? 0.05 : this.stiffness;
        l.pos.lerp(restTip, 1 - Math.pow(1 - k, frames));
        // 重力與風：原本每格位移 g/60，相當於加速度 60g
        l.pos.y -= this.gravity * 60 * h * h;
        if (wind) l.pos.addScaledVector(wind, this.windScale * 60 * h * h);
      }
      for (const c of this.colliders) {
        const center = tmpCenter.setFromMatrixPosition(c.object.matrixWorld);
        if (c.offset) center.add(c.offset);
        const d = l.pos.distanceTo(center);
        if (d < c.radius) l.pos.sub(center).setLength(c.radius).add(center);
      }
      // 固定長度
      l.pos.sub(origin).setLength(l.length).add(origin);
      // 把骨頭轉向質點
      const from = tmpFrom.copy(childOffset).add(origin);
      aim(bone, origin, from, l.pos);
    }
    if (h > 0) this.lastH = h;
  }
}

function aim(bone, o, from, to) {
  const f = aimF.copy(from).sub(o).normalize();
  const t = aimT.copy(to).sub(o).normalize();
  const q = aimQ.setFromUnitVectors(f, t);
  bone.matrixWorld.decompose(aimP, aimWQ, aimS);
  aimWQ.premultiply(q);
  bone.parent.matrixWorld.decompose(aimP, aimPQ, aimS);
  bone.quaternion.copy(aimPQ.invert().multiply(aimWQ));
  bone.updateMatrixWorld(true);
}
