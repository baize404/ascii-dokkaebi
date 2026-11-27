import { Euler, Quaternion, Vector3 } from 'three';
import { heightAt, LEVEL } from '../data/level.js';
import { clampToBounds, resolveCircle } from '../world/Collision.js';
import { makePlayerModel } from '../world/characters.js';

export const RUN_SPEED = 5.2;
export const WALK_SPEED = 2.2;
const RADIUS = 0.45;
const ARRIVE_DIST = 0.15;
/** 轉身的彈簧頻率（每秒）：約 0.3 秒轉到位 */
const TURN_OMEGA = 15;
/** 速度平滑（每秒的收斂率）：起步、轉彎與停下都有短暫的加減速，近景時不會抽動 */
const ACCEL = 9;
const DECEL = 12;
/** 點擊移動：目的地比這個近就用走的 */
const WALK_DISTANCE = 5;

/** 舊的動作名稱 → 動畫片段 */
const ACTION_CLIPS = { pickup: 'Pickup', interact: 'Inspect', startle: 'Startled', cheer: 'Cheer' };

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** 腳下的地面材質（決定腳步聲）：小路是石板，其他是草地 */
export function surfaceAt(x, z) {
  const onPath = LEVEL.paths.some(([px, pz, w, d]) => Math.abs(x - px) < w / 2 && Math.abs(z - pz) < d / 2);
  const m = LEVEL.mound;
  if (Math.hypot(x - m.x, z - m.z) < m.wallRadius) return 'stone';
  return onPath ? 'stone' : 'grass';
}

/**
 * 玩家：鍵盤／搖桿移動，或點擊目的地用 A* 尋路走過去；處理碰撞與地形高度，
 * 動畫交給骨架角色的 CharacterAnimator（走／跑混合、轉身、各種動作、腳部 IK、彈簧骨）。
 * 燈籠用單擺模擬：跟著手的加速度與風擺動，有阻尼、角度有限制，不會穿進身體。
 */
export class Player {
  constructor(world, start, nav) {
    this.world = world;
    this.nav = nav;
    this.waypoints = [];
    this.onStep = null;
    this.model = makePlayerModel();
    this.animator = this.model.animator;
    this.animator.heightAt = heightAt;
    this.animator.footIK = true;
    this.animator.wind = (p) => world.windAt?.(p) ?? null;
    this.object = this.model.root;
    this.object.position.set(start.x, heightAt(start.x, start.z), start.z);
    this.yaw = Math.PI; // 面向北方
    this.targetYaw = this.yaw;
    this.object.rotation.y = this.yaw;
    this.target = null;
    this.onArrive = null;
    this.onFail = null;
    this.speed = 0;
    this.vel = { x: 0, z: 0 };
    this.yawVel = 0;
    this.moveSpeed = RUN_SPEED;
    this.stuckTime = 0;
    this.lastPhase = 0;
    this.sparkTimer = 0;
    this.pendulum = { ax: 0, az: 0, wx: 0, wz: 0, prev: null, vel: new Vector3() };
    world.scene.add(this.object);
  }

  /** 是否正在播放動作（撿拾、操作等） */
  get acting() {
    return this.animator.busy;
  }

  get position() {
    return this.object.position;
  }

  setPosition(x, z, yaw) {
    this.object.position.set(x, heightAt(x, z), z);
    if (Number.isFinite(yaw)) this.yaw = this.targetYaw = yaw;
    this.yawVel = 0;
    this.pendulum.prev = null;
    for (const s of this.model.springs) s.reset();
    this.vel.x = this.vel.z = 0;
    this.stop();
  }

  /**
   * 用尋路走到 point；最後距離小於 arriveDist 就算抵達並呼叫 onArrive。
   * 回傳 { ok, reached }：ok=false 代表完全走不到；reached=false 代表只能走到附近。
   * onFail(reason) 會在途中被擋住而放棄時呼叫（reason = 'blocked'），讓遊戲給玩家明確回饋。
   */
  walkTo(point, onArrive = null, arriveDist = ARRIVE_DIST, onFail = null) {
    const path = this.nav ? this.nav.findPath(this.position, point) : { points: [point], reached: true, unreachable: false };
    if (path.unreachable || path.points.length === 0) {
      if (Math.hypot(point.x - this.position.x, point.z - this.position.z) < arriveDist) {
        onArrive?.();
        return { ok: true, reached: true };
      }
      this.stop();
      return { ok: false, reached: false };
    }
    this.waypoints = path.points.map((p) => new Vector3(p.x, 0, p.z));
    this.target = this.waypoints[this.waypoints.length - 1];
    this.finalPoint = new Vector3(point.x, 0, point.z);
    this.onArrive = onArrive;
    this.onFail = onFail;
    this.arriveDist = arriveDist;
    this.stuckTime = 0;
    // 近的地方用走的，遠的地方用跑的
    let length = 0;
    let prev = this.position;
    for (const p of this.waypoints) {
      length += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
    }
    this.moveSpeed = length < WALK_DISTANCE ? WALK_SPEED : RUN_SPEED;
    this.animator.cancel();
    return { ok: true, reached: path.reached };
  }

  stop() {
    this.target = null;
    this.waypoints = [];
    this.onArrive = null;
    this.onFail = null;
  }

  /** 目前的尋路路徑（測試與除錯用） */
  get path() {
    return this.waypoints.map((p) => ({ x: p.x, z: p.z }));
  }

  /** 慢慢轉身面向某個點 */
  faceTowards(point) {
    if (!point) return;
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    if (Math.hypot(dx, dz) > 0.01) this.targetYaw = Math.atan2(dx, dz);
  }

  /** 播放舊名稱的動作（pickup、interact、startle、cheer），結束時 resolve */
  play(kind, opts = {}) {
    return this.act(ACTION_CLIPS[kind] ?? kind, { cancelable: kind !== 'cheer', ...opts });
  }

  /**
   * 播放動作片段。@param o.events 動畫事件 { contact() {...} }；o.hand 手部 IK 目標
   */
  async act(clip, { events = {}, cancelable = false, hand = null, look = null, timeScale = 1 } = {}) {
    if (hand) this.animator.handTargets = hand;
    if (look) this.animator.lookTarget = look;
    try {
      return await this.animator.play(clip, { events, cancelable, timeScale });
    } finally {
      if (hand) this.animator.handTargets = {};
      if (look) this.animator.lookTarget = null;
    }
  }

  /** 循環動作（說話、蹲著、轉轆轤）；回傳 { done, stop } */
  hold(clip, opts = {}) {
    const done = this.animator.play(clip, opts);
    return { done, stop: () => this.animator.stop(clip) };
  }

  /**
   * @param dt 秒
   * @param move 鏡頭座標系換算後的移動方向 {x, z}（長度 0–1），null 代表沒按鍵
   * @param walk 是否用走的（按住 Shift）
   */
  update(dt, move, walk = false) {
    let dir = null;
    let speed = this.moveSpeed;
    if (move) {
      this.stop();
      this.animator.cancel();
      const m = Math.hypot(move.x, move.z);
      dir = { x: move.x / m, z: move.z / m };
      // 搖桿推一點點是走、推到底是跑；鍵盤按住 Shift 是走
      speed = walk ? WALK_SPEED : WALK_SPEED + (RUN_SPEED - WALK_SPEED) * Math.min(1, Math.max(0, (m - 0.55) / 0.4));
    } else if (this.target) {
      const fx = this.finalPoint.x - this.position.x;
      const fz = this.finalPoint.z - this.position.z;
      if (Math.hypot(fx, fz) < this.arriveDist) {
        const cb = this.onArrive;
        this.stop();
        cb?.();
      } else {
        let wp = this.waypoints[0];
        while (wp && this.waypoints.length > 1 && Math.hypot(wp.x - this.position.x, wp.z - this.position.z) < 0.25) {
          this.waypoints.shift();
          wp = this.waypoints[0];
        }
        const dx = wp.x - this.position.x;
        const dz = wp.z - this.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < ARRIVE_DIST && this.waypoints.length <= 1) {
          const cb = this.onArrive;
          this.stop();
          cb?.();
        } else if (dist > 1e-4) {
          dir = { x: dx / dist, z: dz / dist };
          // 快到終點時放慢，停下來比較自然
          const remain = Math.hypot(fx, fz);
          speed = Math.min(speed, Math.max(WALK_SPEED * 0.6, remain * 3));
        }
      }
    }

    // 速度平滑：實際速度朝「想要的速度」收斂，起步、停下、轉彎都不會瞬間改變
    const wantX = dir ? dir.x * speed : 0;
    const wantZ = dir ? dir.z * speed : 0;
    const a = 1 - Math.exp(-dt * (dir ? ACCEL : DECEL));
    this.vel.x += (wantX - this.vel.x) * a;
    this.vel.z += (wantZ - this.vel.z) * a;
    let vmag = Math.hypot(this.vel.x, this.vel.z);
    if (!dir && vmag < 0.05) {
      this.vel.x = this.vel.z = 0;
      vmag = 0;
    }

    let moved = 0;
    if (vmag > 0 && dt > 0) {
      const wp = this.waypoints[0];
      // 跟著路徑走時不要衝過路徑點
      const limit = wp && !move && dir ? Math.hypot(wp.x - this.position.x, wp.z - this.position.z) : Infinity;
      const step = Math.min(vmag * dt, limit);
      const before = { x: this.position.x, z: this.position.z };
      let next = { x: before.x + (this.vel.x / vmag) * step, z: before.z + (this.vel.z / vmag) * step };
      next = resolveCircle(next, RADIUS, this.world.colliders);
      next = clampToBounds(next, RADIUS, this.world.bounds);
      this.position.x = next.x;
      this.position.z = next.z;
      if (dir) this.targetYaw = Math.atan2(dir.x, dir.z);
      moved = Math.hypot(next.x - before.x, next.z - before.z);
      // 撞到東西時，速度跟著實際位移下降（不會一直往牆裡推）
      if (moved < step * 0.98) {
        this.vel.x = (next.x - before.x) / dt;
        this.vel.z = (next.z - before.z) / dt;
      }
    }
    if (dir) {
      const progressed = moved > Math.min(speed, Math.max(vmag, 0.5)) * dt * 0.2;
      // 點擊移動時被擋住太久就放棄並告訴玩家，避免卡在牆邊抖動
      if (this.target && !progressed) {
        this.stuckTime += dt;
        if (this.stuckTime > 0.6) {
          const fail = this.onFail;
          this.stop();
          fail?.('blocked');
        }
      } else {
        this.stuckTime = 0;
      }
    }

    // 轉身：原地大角度轉身時播放轉身步伐
    const turn = wrapAngle(this.targetYaw - this.yaw);
    if (!dir) this.animator.turn(turn);
    // 臨界阻尼的轉身：角速度從 0 平順加速再減速（原本角速度在第一格就跳到最大，手和燈籠會被甩一下）
    if (dt > 0) {
      const n = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = Math.min(dt, 0.1) / n;
      for (let i = 0; i < n; i++) {
        const d = wrapAngle(this.targetYaw - this.yaw);
        this.yawVel += (TURN_OMEGA * TURN_OMEGA * d - 2 * TURN_OMEGA * this.yawVel) * h;
        this.yaw += this.yawVel * h;
      }
    }
    this.object.rotation.y = this.yaw;
    this.object.position.y = heightAt(this.position.x, this.position.z);

    this.speed = dt > 0 ? moved / dt : 0;
    this.animator.setMove(this.speed, moved, dt);
    this.object.updateMatrixWorld(true);
    this.animator.update(dt);
    this.#footsteps();
    this.#lantern(dt);
  }

  /** 腳步：左腳在步伐相位 0 落地、右腳在 0.5；落地時揚起灰塵並發出腳步聲 */
  #footsteps() {
    const a = this.animator;
    const phase = a.phase;
    const wrapped = phase < this.lastPhase;
    const crossed = (mark) => (mark === 0 ? wrapped : this.lastPhase < mark && phase >= mark);
    if (a.speed > 0.6) {
      for (const [mark, foot] of [
        [0, this.model.feet[0]],
        [0.5, this.model.feet[1]],
      ]) {
        if (crossed(mark)) {
          this.world.burst('dust', foot.getWorldPosition(new Vector3()));
          this.onStep?.(surfaceAt(this.position.x, this.position.z));
        }
      }
    }
    this.lastPhase = phase;
  }

  /** 燈籠單擺：手的加速度、風、阻尼；角度限制避免穿過身體 */
  #lantern(dt) {
    const m = this.model;
    const pivot = m.lantern;
    const socket = pivot.parent;
    const p = this.pendulum;
    const pos = socket.getWorldPosition(new Vector3());
    if (!p.prev || dt <= 0) {
      p.prev = pos.clone();
      p.vel.set(0, 0, 0);
    }
    const step = Math.max(dt, 1e-3);
    const vel = pos.clone().sub(p.prev).divideScalar(step);
    const acc = vel.clone().sub(p.vel).divideScalar(step).clampLength(0, 25);
    p.prev.copy(pos);
    p.vel.copy(vel);
    const wind = this.world.windAt?.(pos) ?? new Vector3();
    const len = 0.2;
    const g = 9.8;
    const h = Math.min(dt, 1 / 30);
    // ax：繞世界 X 軸（前後擺），az：繞世界 Z 軸（左右擺）
    p.wx += (-(g / len) * Math.sin(p.ax) - 4 * p.wx + ((acc.z - wind.z * 0.6) / len) * Math.cos(p.ax)) * h;
    p.wz += (-(g / len) * Math.sin(p.az) - 4 * p.wz - ((acc.x - wind.x * 0.6) / len) * Math.cos(p.az)) * h;
    p.ax = Math.max(-0.75, Math.min(0.75, p.ax + p.wx * h));
    p.az = Math.max(-0.75, Math.min(0.75, p.az + p.wz * h));
    // 世界座標下的懸掛方向 → 換算成掛點的區域旋轉
    const worldQ = new Quaternion().setFromEuler(new Euler(p.ax, 0, p.az, 'XZY'));
    const socketQ = socket.getWorldQuaternion(new Quaternion());
    pivot.quaternion.copy(socketQ.invert().multiply(worldQ));
    m.tassel.rotation.x = -p.ax * 0.6;
    m.tassel.rotation.z = -p.az * 0.6;
    // 火光閃爍、火焰受擺動與風影響而傾斜
    const t = this.world.time;
    m.light.intensity = 4.3 + Math.sin(t * 8) * 0.3 + Math.sin(t * 13.7) * 0.2;
    m.flame.scale.set(1 - Math.abs(p.az) * 0.3, 0.85 + 0.25 * Math.abs(Math.sin(t * 11.3)), 1 - Math.abs(p.ax) * 0.3);
    m.flame.rotation.set(-p.ax * 0.8 - wind.z * 0.08, 0, p.az * 0.8 + wind.x * 0.08);
    this.sparkTimer -= dt;
    if (this.sparkTimer <= 0) {
      this.sparkTimer = 0.25 + Math.random() * 0.5;
      this.world.burst('spark', m.flame.getWorldPosition(new Vector3()));
    }
  }

  dispose() {
    this.animator.dispose();
  }
}
