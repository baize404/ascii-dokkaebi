import { Vector3 } from 'three';

const FOLLOW_OFFSET = new Vector3(11, 17, 13.5);
const FOCUS_ZOOM = 0.72; // 對話時鏡頭拉近的比例

/**
 * 相機控制：title（低角度環繞村子、看得到星空）、follow（跟著玩家）、shot（過場鏡頭）。
 * 另外支援對話時拉近（focus）與鏡頭震動（shake）。
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'title';
    this.base = new Vector3(); // 不含震動的鏡頭位置
    this.lookAt = new Vector3();
    this.shotPos = new Vector3();
    this.shotLook = new Vector3();
    this.zoom = 1;
    this.focusAmount = 0;
    this.focused = false;
    this.shakeTime = 0;
    this.shakeDuration = 1;
    this.shakeStrength = 0;
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
      this.base.copy(target).addScaledVector(FOLLOW_OFFSET, this.zoom);
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

  /** 對話、調查時把鏡頭拉近 */
  setFocus(on) {
    this.focused = on;
  }

  /** 鏡頭震動：strength 為最大位移（公尺），duration 秒內逐漸減弱 */
  shake(strength = 0.3, duration = 0.5) {
    this.shakeStrength = strength;
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  update(dt) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 4);
    this.focusAmount += ((this.focused ? 1 : 0) - this.focusAmount) * (1 - Math.exp(-dt * 3));

    if (this.mode === 'title') {
      const a = this.time * 0.07;
      const r = 28 * this.zoom;
      this.base.set(Math.sin(a) * r, 9 * this.zoom, Math.cos(a) * r);
      this.lookAt.set(0, 3, -2);
    } else if (this.mode === 'follow' && this.target) {
      const zoom = this.zoom * (1 - (1 - FOCUS_ZOOM) * this.focusAmount);
      const desired = this.target.clone().addScaledVector(FOLLOW_OFFSET, zoom);
      this.base.lerp(desired, k);
      this.lookAt.lerp(this.target.clone().setY(0.6 * this.focusAmount), k);
    } else if (this.mode === 'shot') {
      const ks = 1 - Math.exp(-dt * 2);
      this.base.lerp(this.shotPos, ks);
      this.lookAt.lerp(this.shotLook, ks);
    }

    this.camera.position.copy(this.base);
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const amp = this.shakeStrength * (this.shakeTime / this.shakeDuration);
      this.camera.position.x += (Math.random() - 0.5) * 2 * amp;
      this.camera.position.y += (Math.random() - 0.5) * 2 * amp;
      this.camera.position.z += (Math.random() - 0.5) * 2 * amp;
    }
    this.camera.lookAt(this.lookAt);
  }
}
