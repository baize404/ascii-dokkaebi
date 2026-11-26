import { Vector3 } from 'three';
import { clampToBounds, resolveCircle } from '../world/Collision.js';
import { makePlayerModel } from '../world/characters.js';

const SPEED = 5.2;
const RADIUS = 0.45;
const ARRIVE_DIST = 0.15;

/**
 * 玩家：鍵盤移動或點擊目的地自動走過去，處理碰撞與走路動畫。
 */
export class Player {
  constructor(world, start) {
    this.world = world;
    this.model = makePlayerModel();
    this.object = this.model.root;
    this.object.position.set(start.x, 0, start.z);
    this.object.rotation.y = Math.PI; // 面向北方
    this.target = null;
    this.onArrive = null;
    this.walkPhase = 0;
    this.stuckTime = 0;
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

  /**
   * @param dt 秒
   * @param move 相機座標系下的移動方向 {x, z}（世界座標，已正規化），null 代表沒按鍵
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

    const moving = Boolean(dir);
    if (dir) {
      const step = Math.min(SPEED * dt, this.target && !move ? this.position.distanceTo(this.target) : Infinity);
      const before = { x: this.position.x, z: this.position.z };
      let next = { x: before.x + dir.x * step, z: before.z + dir.z * step };
      next = resolveCircle(next, RADIUS, this.world.colliders);
      next = clampToBounds(next, RADIUS, this.world.bounds);
      this.position.x = next.x;
      this.position.z = next.z;
      this.object.rotation.y = Math.atan2(dir.x, dir.z);

      // 點擊移動時被擋住太久就放棄，避免卡在牆邊抖動
      const progressed = Math.hypot(next.x - before.x, next.z - before.z);
      if (this.target && progressed < step * 0.2) {
        this.stuckTime += dt;
        if (this.stuckTime > 0.35) this.stop();
      } else {
        this.stuckTime = 0;
      }
    }

    // 走路時上下晃動、燈籠擺動
    this.walkPhase = moving ? this.walkPhase + dt * 11 : this.walkPhase * 0.85;
    this.model.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.08 : 0;
    this.model.lantern.rotation.z = Math.sin(this.walkPhase * 0.5) * (moving ? 0.25 : 0.05);
    this.model.light.intensity = 4.3 + Math.sin(this.world.time * 8) * 0.3;
  }
}
