import { Vector3 } from 'three';
import { clampToBounds, resolveCircle } from '../world/Collision.js';
import { makePlayerModel } from '../world/characters.js';

const SPEED = 5.2;
const RADIUS = 0.45;
const ARRIVE_DIST = 0.15;
const TURN_RATE = 12;

/** 各種動作的長度（秒） */
const ACTIONS = { pickup: 0.8, interact: 0.6, startle: 0.6, cheer: 1.6 };

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * 玩家：鍵盤移動或點擊目的地自動走過去，處理碰撞、走路動畫與各種動作。
 */
export class Player {
  constructor(world, start) {
    this.world = world;
    this.model = makePlayerModel();
    this.object = this.model.root;
    this.object.position.set(start.x, 0, start.z);
    this.yaw = Math.PI; // 面向北方
    this.targetYaw = this.yaw;
    this.object.rotation.y = this.yaw;
    this.target = null;
    this.onArrive = null;
    this.walkPhase = 0;
    this.stepSign = 1;
    this.moveBlend = 0;
    this.stuckTime = 0;
    this.action = null;
    this.sparkTimer = 0;
    world.scene.add(this.object);
  }

  get position() {
    return this.object.position;
  }

  setPosition(x, z) {
    this.object.position.set(x, 0, z);
    this.stop();
  }

  /** 走到 point；距離小於 arriveDist 就算抵達並呼叫 onArrive。 */
  walkTo(point, onArrive = null, arriveDist = ARRIVE_DIST) {
    this.target = new Vector3(point.x, 0, point.z);
    this.onArrive = onArrive;
    this.arriveDist = arriveDist;
    this.stuckTime = 0;
  }

  stop() {
    this.target = null;
    this.onArrive = null;
  }

  /** 慢慢轉身面向某個點 */
  faceTowards(point) {
    if (!point) return;
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    if (Math.hypot(dx, dz) > 0.01) this.targetYaw = Math.atan2(dx, dz);
  }

  /** 播放一個動作（pickup、interact、startle、cheer），動作結束時 resolve */
  play(kind) {
    this.action?.resolve();
    return new Promise((resolve) => {
      this.action = { kind, t: 0, duration: ACTIONS[kind] ?? 0.6, resolve };
    });
  }

  /**
   * @param dt 秒
   * @param move 鏡頭座標系換算後的移動方向 {x, z}（已正規化），null 代表沒按鍵
   */
  update(dt, move) {
    let dir = null;
    if (move) {
      this.stop();
      dir = move;
    } else if (this.target) {
      const dx = this.target.x - this.position.x;
      const dz = this.target.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < this.arriveDist) {
        const cb = this.onArrive;
        this.stop();
        cb?.();
      } else {
        dir = { x: dx / dist, z: dz / dist };
      }
    }

    let moving = false;
    if (dir) {
      const step = Math.min(SPEED * dt, this.target && !move ? this.position.distanceTo(this.target) : Infinity);
      const before = { x: this.position.x, z: this.position.z };
      let next = { x: before.x + dir.x * step, z: before.z + dir.z * step };
      next = resolveCircle(next, RADIUS, this.world.colliders);
      next = clampToBounds(next, RADIUS, this.world.bounds);
      this.position.x = next.x;
      this.position.z = next.z;
      this.targetYaw = Math.atan2(dir.x, dir.z);

      const progressed = Math.hypot(next.x - before.x, next.z - before.z);
      moving = progressed > step * 0.2;
      // 點擊移動時被擋住太久就放棄，避免卡在牆邊抖動
      if (this.target && !moving) {
        this.stuckTime += dt;
        if (this.stuckTime > 0.35) this.stop();
      } else {
        this.stuckTime = 0;
      }
    }

    // 平滑轉身
    this.yaw += wrapAngle(this.targetYaw - this.yaw) * Math.min(1, dt * TURN_RATE);
    this.object.rotation.y = this.yaw;

    this.#animate(dt, moving);
  }

  #animate(dt, moving) {
    const m = this.model;
    const t = this.world.time;
    this.moveBlend = lerp(this.moveBlend, moving ? 1 : 0, Math.min(1, dt * 10));
    const mb = this.moveBlend;

    // ---- 走路循環 ----
    if (moving) this.walkPhase += dt * 11;
    const swing = Math.sin(this.walkPhase) * mb;
    // 每一步落地時揚起一點灰塵
    const sign = Math.sign(Math.sin(this.walkPhase));
    if (moving && sign !== this.stepSign && sign !== 0) {
      this.stepSign = sign;
      const foot = m.feet[sign > 0 ? 0 : 1].getWorldPosition(new Vector3());
      this.world.burst('dust', foot);
    }

    // ---- 基本姿勢（走路 + 待機呼吸） ----
    let bodyY = Math.abs(swing) * 0.07;
    let lean = 0.1 * mb;
    let scaleY = 1 + Math.sin(t * 2.2) * 0.012 * (1 - mb);
    let leftArm = -swing * 0.75;
    let rightArm = swing * 0.3;
    let armSpread = 0;
    let lift = 0;
    let headPitch = 0;
    const headYaw = Math.sin(t * 0.5) * 0.35 * (1 - mb) * Math.max(0, Math.sin(t * 0.21));

    m.feet[0].position.z = 0.05 + swing * 0.17;
    m.feet[1].position.z = 0.05 - swing * 0.17;
    m.feet[0].position.y = 0.06 + Math.max(0, swing) * 0.08;
    m.feet[1].position.y = 0.06 + Math.max(0, -swing) * 0.08;

    // ---- 動作覆蓋 ----
    const a = this.action;
    if (a) {
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      const bell = Math.sin(Math.PI * k);
      if (a.kind === 'pickup') {
        bodyY -= 0.2 * bell;
        scaleY *= 1 - 0.12 * bell;
        lean += 0.35 * bell;
        leftArm = -1.3 * bell;
        headPitch = 0.4 * bell;
      } else if (a.kind === 'interact') {
        lean += 0.22 * bell;
        rightArm = -1.1 * bell;
        headPitch = -0.15 * bell;
      } else if (a.kind === 'startle') {
        lift = 0.35 * bell;
        lean -= 0.3 * bell;
        armSpread = 1.0 * bell;
        headPitch = -0.3 * bell;
      } else if (a.kind === 'cheer') {
        lift = Math.abs(Math.sin(Math.PI * 2 * k)) * 0.45 * (1 - k * 0.3);
        leftArm = -2.7 * bell;
        rightArm = -2.4 * bell;
      }
      if (k >= 1) {
        this.action = null;
        a.resolve();
      }
    }

    m.body.position.y = bodyY;
    m.body.rotation.x = lean;
    m.body.scale.y = scaleY;
    m.leftArm.rotation.x = leftArm;
    m.rightArm.rotation.x = rightArm;
    m.leftArm.rotation.z = -armSpread;
    m.rightArm.rotation.z = armSpread;
    m.head.rotation.set(headPitch, headYaw, 0);
    this.object.position.y = lift;

    // 緞帶跟著動作飄，燈籠搖晃
    m.ribbon.rotation.x = 0.15 + mb * 0.55 + Math.sin(this.walkPhase * 2) * 0.12 * mb + Math.sin(t * 1.8) * 0.05 + lift;
    m.lantern.rotation.z = Math.sin(this.walkPhase * 0.5) * (0.06 + 0.22 * mb);
    m.lantern.rotation.x = -swing * 0.15;
    m.light.intensity = 4.3 + Math.sin(t * 8) * 0.3 + Math.sin(t * 13.7) * 0.2;

    // 燈籠偶爾飄出一點火星
    this.sparkTimer -= dt;
    if (this.sparkTimer <= 0) {
      this.sparkTimer = 0.25 + Math.random() * 0.5;
      this.world.burst('spark', m.lantern.getWorldPosition(new Vector3()));
    }
  }
}
