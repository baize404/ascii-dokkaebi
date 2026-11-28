import { MathUtils, Raycaster, Vector3 } from 'three';

/**
 * 鏡頭導演（Camera Director）：整個原型只有這裡能動攝影機。
 *
 * 兩層：
 * 1. 自由鏡頭（玩家控制）：探索視角 explore（高角度看路）與第三人稱 third（斜後方看動作）。
 *    玩家可以環繞（yaw／pitch）、縮放、置中；過橋時有「過橋輔助」（traversal）把構圖轉向橋的方向。
 * 2. 鏡頭演出（shot）：調查 inspect、動作 action、電影 cinematic、恢復 recovery。
 *    演出開始前保存玩家的鏡頭設定（模式、方位、俯仰、縮放），結束時平滑地回到原本的設定，不會重設成預設方位。
 *
 * 所有平滑都用 1 - e^(-rate·dt)，和幀率無關；轉場用 easeInOut，可以中途被新的轉場打斷（從目前位置接著走）。
 */

export const FREE_PROFILES = Object.freeze({
  explore: { pitch: 0.9, distance: 12, minDist: 7, maxDist: 18, fov: 50, lookHeight: 0.9, lead: 1.4, shoulder: 0 },
  third: { pitch: 0.3, distance: 4.6, minDist: 2.6, maxDist: 8, fov: 58, lookHeight: 1.25, lead: 0.4, shoulder: 0.42 },
});
export const PITCH_LIMITS = Object.freeze({ min: 0.08, max: 1.25 });
/** 遮擋處理：被擋住時快速拉近，障礙物消失後等一下再慢慢退回（遲滯，避免來回抖動） */
export const OCCLUSION = Object.freeze({ pullRate: 14, releaseRate: 2.4, releaseDelay: 0.35, margin: 0.35, minDist: 1.4 });
/** 玩家按著方向鍵時，移動方向的基準跟著鏡頭轉，但每秒最多轉這麼多（鏡頭突然轉時不會突然往反方向走） */
export const BASIS_TRACK_RATE = 1.4;

export const easeInOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
/** 角度差（-π～π） */
export const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * 移動基準：沒有按方向鍵時直接等於鏡頭方位；按著的時候以有限速率追上鏡頭方位。
 * 純函式，方便測試。
 */
export function trackBasis(basis, cameraYaw, moving, dt, rate = BASIS_TRACK_RATE) {
  if (!moving) return cameraYaw;
  const d = angleDelta(basis, cameraYaw);
  const max = rate * dt;
  return basis + Math.max(-max, Math.min(max, d));
}

/**
 * 遮擋距離的遲滯：被擋住就快速拉近到 hit；沒被擋時先等 releaseDelay 秒，再慢慢回到 wanted。
 * state = { dist, clearFor }
 */
export function occlusionStep(state, wanted, hit, dt, o = OCCLUSION) {
  const limit = hit === null ? wanted : Math.max(o.minDist, Math.min(wanted, hit - o.margin));
  if (limit < state.dist - 1e-4) {
    state.clearFor = 0;
    state.dist += (limit - state.dist) * damp(o.pullRate, dt);
  } else {
    state.clearFor += dt;
    if (state.clearFor >= o.releaseDelay) state.dist += (limit - state.dist) * damp(o.releaseRate, dt);
  }
  state.dist = Math.min(state.dist, wanted);
  return state.dist;
}

const tmp = { a: new Vector3(), b: new Vector3(), c: new Vector3(), dir: new Vector3() };

export class CameraDirector {
  /**
   * @param camera PerspectiveCamera
   * @param o.groundAt (x, z) => 地面高度（鏡頭不會鑽到地下）
   */
  constructor(camera, { groundAt = () => 0 } = {}) {
    this.camera = camera;
    this.groundAt = groundAt;
    this.userMode = 'explore';
    this.yaw = 0; // 鏡頭在目標的哪個方位（0 = 南方，看向北）
    this.pitch = FREE_PROFILES.explore.pitch;
    this.zoom = { explore: 1, third: 1 };
    this.pitchOffset = { explore: 0, third: 0 };
    this.aspect = camera.aspect || 16 / 9;
    this.reduceMotion = false;
    this.occluders = [];
    this.raycaster = new Raycaster();
    this.occ = { dist: Infinity, clearFor: 0 };
    this.target = new Vector3();
    this.velocity = new Vector3();
    this.followTarget = new Vector3();
    this.hasTarget = false;
    // 目前輸出的姿勢
    this.pose = { pos: new Vector3(0, 10, 10), look: new Vector3(), fov: 50 };
    // 轉場
    this.blend = null; // { from: pose, t, dur }
    this.shot = null;
    this.saved = null;
    this.lastManual = -Infinity;
    this.time = 0;
    this.basisYaw = 0;
    this.assist = null; // { yaw, weight, pitch }
    this.mode = 'explore';
    this.events = [];
    this.poseVel = { pos: new Vector3(), look: new Vector3() };
    this.prevPose = null;
  }

  // ---------- 玩家操作 ----------

  setAspect(aspect) {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** 直式畫面（寬 < 高）：拉遠、視角加寬，避免切掉重要物件 */
  get portraitFactor() {
    return MathUtils.clamp(1 / this.aspect, 1, 2.2);
  }

  setUserMode(mode, { instant = false } = {}) {
    if (!FREE_PROFILES[mode] || mode === this.userMode) return;
    this.userMode = mode;
    if (mode === 'explore') this.pitch = FREE_PROFILES.explore.pitch + this.pitchOffset.explore;
    else this.pitch = FREE_PROFILES.third.pitch + this.pitchOffset.third;
    if (!this.shot) this.#startBlend(instant ? 0 : 0.55);
    this.events.push({ type: 'userMode', mode });
  }

  toggleUserMode() {
    this.setUserMode(this.userMode === 'explore' ? 'third' : 'explore');
  }

  /** 環繞：dx、dy 是螢幕像素（滑鼠拖曳或手指滑動） */
  orbit(dx, dy) {
    if (this.shot) {
      this.shot.orbit?.(dx, dy);
      return;
    }
    this.yaw -= dx * 0.0062;
    const p = FREE_PROFILES[this.userMode];
    this.pitch = MathUtils.clamp(this.pitch + dy * 0.0042, PITCH_LIMITS.min, PITCH_LIMITS.max);
    this.pitchOffset[this.userMode] = this.pitch - p.pitch;
    this.lastManual = this.time;
  }

  zoomBy(delta) {
    if (this.shot) {
      this.shot.zoomBy?.(delta);
      return;
    }
    const m = this.userMode;
    const p = FREE_PROFILES[m];
    const z = MathUtils.clamp(this.zoom[m] * (1 + delta * 1.6), p.minDist / p.distance, p.maxDist / p.distance);
    this.zoom[m] = z;
  }

  /** 鏡頭置中：轉到角色背後（平滑） */
  recenter(facingYaw) {
    if (this.shot) return;
    this.recenterTo = facingYaw + Math.PI;
    this.lastManual = this.time;
  }

  setOccluders(list) {
    this.occluders = list;
  }

  /** 每格告訴導演追蹤目標（玩家腳下位置與速度） */
  follow(position, velocity = null, snap = false) {
    this.followTarget.copy(position);
    if (velocity) this.velocity.copy(velocity);
    if (snap || !this.hasTarget) {
      this.target.copy(position);
      this.hasTarget = true;
    }
  }

  /** 過橋輔助：由場景提供想要的方位與權重（0 = 不輔助） */
  setAssist(assist) {
    this.assist = assist;
  }

  /** 鏡頭目前的水平朝向（看過去的方向，弧度；0 = 北 / -z） */
  get cameraYaw() {
    const d = tmp.dir.subVectors(this.pose.look, this.pose.pos);
    return Math.atan2(-d.x, -d.z);
  }

  /** 移動用的地面座標軸（依移動基準，而不是鏡頭的瞬間朝向） */
  groundAxes() {
    const y = this.basisYaw;
    return { forward: { x: -Math.sin(y), z: -Math.cos(y) }, right: { x: Math.cos(y), z: -Math.sin(y) } };
  }

  // ---------- 演出 ----------

  /**
   * 開始一段鏡頭演出。shot：
   *   kind：inspect | action | cinematic | recovery
   *   pose(t, out, ctx)：寫入 out.pos、out.look、out.fov
   *   duration：秒（Infinity = 直到 end()）；blendIn、blendOut：轉場秒數（0 = 硬切）
   *   lockInput：演出期間是否鎖住移動
   */
  play(shot) {
    if (!this.shot) this.saved = { userMode: this.userMode, yaw: this.yaw, pitch: this.pitch, zoom: { ...this.zoom } };
    this.shot = { t: 0, duration: Infinity, blendIn: 0.6, blendOut: 0.6, lockInput: true, ...shot };
    this.#startBlend(this.reduceMotion ? Math.min(this.shot.blendIn, 0.25) : this.shot.blendIn);
    this.mode = this.shot.kind;
    this.events.push({ type: 'shot', kind: this.shot.kind });
    return this.shot;
  }

  /** 結束演出並恢復玩家原本的鏡頭；kind 指定時只結束那一種 */
  end(kind = null, { blend = null, yaw = null } = {}) {
    if (!this.shot || (kind && this.shot.kind !== kind)) return false;
    const out = blend ?? this.shot.blendOut;
    const onEnd = this.shot.onEnd;
    this.shot = null;
    if (this.saved) {
      this.userMode = this.saved.userMode;
      this.yaw = yaw ?? this.saved.yaw;
      this.pitch = this.saved.pitch;
      this.zoom = { ...this.saved.zoom };
      this.saved = null;
    }
    this.mode = this.userMode;
    this.#startBlend(this.reduceMotion ? Math.min(out, 0.25) : out);
    this.events.push({ type: 'restore', mode: this.userMode });
    onEnd?.();
    return true;
  }

  get inputLocked() {
    return !!this.shot?.lockInput;
  }

  get transitioning() {
    return !!this.blend;
  }

  #startBlend(dur) {
    if (dur <= 0) {
      this.blend = null;
      this.snapNext = true;
      return;
    }
    // 帶著目前的速度（被打斷時鏡頭不會突然停住再起步）：起點沿原本的速度方向慢慢滑出、逐漸停下
    this.blend = {
      from: { pos: this.pose.pos.clone(), look: this.pose.look.clone(), fov: this.pose.fov },
      vel: { pos: this.poseVel.pos.clone(), look: this.poseVel.look.clone() },
      t: 0,
      dur,
    };
  }

  // ---------- 每一格 ----------

  /** 自由鏡頭想要的姿勢 */
  #freePose(dt, out) {
    const m = this.userMode;
    const p = FREE_PROFILES[m];
    const pf = this.portraitFactor;
    // 目標平滑跟隨（加上朝移動方向的前視量，探索視角看得到前面的路）
    const lead = tmp.a.copy(this.velocity).setY(0).multiplyScalar(p.lead / 5);
    const want = tmp.b.copy(this.followTarget).add(lead);
    this.target.lerp(want, damp(9, dt));
    // 過橋輔助與置中
    const manualRecent = this.time - this.lastManual < 3;
    if (this.recenterTo !== undefined && this.recenterTo !== null) {
      const d = angleDelta(this.yaw, this.recenterTo);
      this.yaw += d * damp(7, dt);
      if (Math.abs(d) < 0.01) this.recenterTo = null;
    } else if (this.assist && this.assist.weight > 0 && !manualRecent) {
      this.yaw += angleDelta(this.yaw, this.assist.yaw) * damp(2.2 * this.assist.weight, dt);
    }
    const assistPitch = this.assist && !manualRecent ? (this.assist.pitch ?? 0) * this.assist.weight : 0;
    const pitch = MathUtils.clamp(this.pitch + assistPitch, PITCH_LIMITS.min, PITCH_LIMITS.max);
    const wanted = p.distance * this.zoom[m] * (1 + 0.32 * (pf - 1));
    const look = out.look.copy(this.target).setY(this.target.y + p.lookHeight);
    // 第三人稱：鏡頭在角色右肩後方
    if (p.shoulder) {
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      look.x += rx * p.shoulder;
      look.z += rz * p.shoulder;
    }
    const dir = tmp.dir.set(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch));
    const dist = this.#occlusion(look, dir, wanted, dt);
    out.pos.copy(look).addScaledVector(dir, dist);
    out.fov = p.fov + 7 * (pf - 1);
  }

  #occlusion(look, dir, wanted, dt) {
    if (this.occ.dist === Infinity || this.snapNext) this.occ.dist = wanted;
    let hit = null;
    if (this.occluders.length) {
      this.raycaster.set(look, dir);
      this.raycaster.far = wanted + 0.5;
      const hits = this.raycaster.intersectObjects(this.occluders, true);
      if (hits.length) hit = hits[0].distance;
    }
    this.lastOcclusionHit = hit;
    return occlusionStep(this.occ, wanted, hit, dt);
  }

  update(dt) {
    this.time += dt;
    const want = { pos: tmp.c, look: new Vector3(), fov: 50 };
    if (this.shot) {
      this.shot.t += dt;
      // 演出期間目標也要跟著角色，結束時自由鏡頭不用從很遠的地方追回來
      this.target.lerp(this.followTarget, damp(9, dt));
      this.shot.pose(this.shot.t, want, this.shot);
      if (this.shot.t >= this.shot.duration) this.end();
    } else {
      this.#freePose(dt, want);
    }
    // 地形：鏡頭不鑽進地面
    const floor = this.groundAt(want.pos.x, want.pos.z) + 0.45;
    if (want.pos.y < floor) want.pos.y = floor;

    if (this.snapNext) {
      this.pose.pos.copy(want.pos);
      this.pose.look.copy(want.look);
      this.pose.fov = want.fov;
      this.snapNext = false;
    } else if (this.blend) {
      this.blend.t += dt;
      const k = easeInOut(this.blend.t / this.blend.dur);
      const f = this.blend.from;
      const tau = 0.15;
      const carry = tau * (1 - Math.exp(-this.blend.t / tau));
      const fromPos = tmp.a.copy(f.pos).addScaledVector(this.blend.vel.pos, carry);
      const fromLook = tmp.b.copy(f.look).addScaledVector(this.blend.vel.look, carry);
      this.pose.pos.lerpVectors(fromPos, want.pos, k);
      this.pose.look.lerpVectors(fromLook, want.look, k);
      this.pose.fov = f.fov + (want.fov - f.fov) * k;
      if (this.blend.t >= this.blend.dur) this.blend = null;
    } else {
      // 自由鏡頭本身已經平滑，這裡直接套用（避免兩層平滑造成拖影）
      this.pose.pos.copy(want.pos);
      this.pose.look.copy(want.look);
      this.pose.fov = want.fov;
    }
    if (this.prevPose && dt > 0) {
      this.poseVel.pos.subVectors(this.pose.pos, this.prevPose.pos).divideScalar(dt);
      this.poseVel.look.subVectors(this.pose.look, this.prevPose.look).divideScalar(dt);
    } else this.prevPose = { pos: new Vector3(), look: new Vector3() };
    this.prevPose.pos.copy(this.pose.pos);
    this.prevPose.look.copy(this.pose.look);
    const prev = tmp.a.copy(this.camera.position);
    this.camera.position.copy(this.pose.pos);
    this.camera.lookAt(this.pose.look);
    if (Math.abs(this.camera.fov - this.pose.fov) > 1e-3) {
      this.camera.fov = this.pose.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camSpeed = dt > 0 ? prev.distanceTo(this.camera.position) / dt : 0;
  }

  /** 更新移動基準（主迴圈在讀取輸入前呼叫） */
  updateBasis(dt, moving) {
    this.basisYaw = trackBasis(this.basisYaw, this.cameraYaw, moving && !this.shot, dt);
    return this.basisYaw;
  }

  /** 立即把鏡頭放到目前的自由姿勢（載入、重生後） */
  snap() {
    this.blend = null;
    this.prevPose = null;
    this.poseVel.pos.set(0, 0, 0);
    this.poseVel.look.set(0, 0, 0);
    this.snapNext = true;
    this.target.copy(this.followTarget);
    this.occ.dist = Infinity;
  }

  /** 測試與除錯用的狀態 */
  info() {
    const v = (x) => [x.x, x.y, x.z];
    return {
      mode: this.mode,
      userMode: this.userMode,
      shot: this.shot?.kind ?? null,
      yaw: this.yaw,
      pitch: this.pitch,
      zoom: { ...this.zoom },
      fov: this.pose.fov,
      pos: v(this.pose.pos),
      look: v(this.pose.look),
      cameraYaw: this.cameraYaw,
      basisYaw: this.basisYaw,
      blending: !!this.blend,
      occlusion: this.lastOcclusionHit ?? null,
      occDist: this.occ.dist,
      inputLocked: this.inputLocked,
    };
  }
}
