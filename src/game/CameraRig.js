import { Vector3 } from 'three';

const FOLLOW_OFFSET = new Vector3(11, 17, 13.5);

/**
 * 相機控制：title（環繞村子）、follow（跟著玩家）、shot（過場鏡頭）。
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'title';
    this.lookAt = new Vector3();
    this.shotPos = new Vector3();
    this.shotLook = new Vector3();
    this.zoom = 1;
    this.time = 0;
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    // 直式手機畫面拉遠一點，才看得到周圍
    this.zoom = aspect < 1 ? 1.35 : 1;
    this.camera.updateProjectionMatrix();
  }

  /** 鏡頭視角下的「前方」與「右方」（XZ 平面），給鍵盤移動用 */
  groundAxes() {
    const f = new Vector3(-FOLLOW_OFFSET.x, 0, -FOLLOW_OFFSET.z).normalize();
    return { forward: f, right: new Vector3(-f.z, 0, f.x) };
  }

  follow(target, snap = false) {
    this.mode = 'follow';
    this.target = target;
    if (snap) {
      this.lookAt.copy(target);
      this.camera.position.copy(target).addScaledVector(FOLLOW_OFFSET, this.zoom);
    }
  }

  shot(position, lookAt) {
    this.mode = 'shot';
    this.shotPos.copy(position);
    this.shotLook.copy(lookAt);
  }

  title() {
    this.mode = 'title';
  }

  update(dt) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 4);
    if (this.mode === 'title') {
      const a = this.time * 0.08;
      const r = 30 * this.zoom;
      this.camera.position.set(Math.sin(a) * r, 17 * this.zoom, Math.cos(a) * r);
      this.lookAt.set(0, 0, -2);
    } else if (this.mode === 'follow' && this.target) {
      const desired = this.target.clone().addScaledVector(FOLLOW_OFFSET, this.zoom);
      this.camera.position.lerp(desired, k);
      this.lookAt.lerp(this.target, k);
    } else if (this.mode === 'shot') {
      const ks = 1 - Math.exp(-dt * 2);
      this.camera.position.lerp(this.shotPos, ks);
      this.lookAt.lerp(this.shotLook, ks);
    }
    this.camera.lookAt(this.lookAt);
  }
}
