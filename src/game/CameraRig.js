import { Raycaster, Vector3 } from 'three';

const FOLLOW_OFFSET = new Vector3(11, 17, 13.5);
const FOCUS_ZOOM = 0.72;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.5;

/**
 * 鏡頭：title（低角度環繞村子）、follow（跟著玩家）、shot（過場鏡頭）。
 * - 玩家可以用滾輪／雙指縮放（setUserZoom）
 * - 對話時自動拉近（setFocus），可設定震動（shake）
 * - 遮擋處理：角色被屋頂或樹擋住時，鏡頭自動拉近並升高
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'title';
    this.base = new Vector3(0, 10, 30);
    this.lookAt = new Vector3();
    this.shotPos = new Vector3();
    this.shotLook = new Vector3();
    this.aspectZoom = 1;
    this.userZoom = 1;
    this.focusAmount = 0;
    this.focused = false;
    this.occlusion = 0;
    this.occluders = [];
    this.raycaster = new Raycaster();
    this.occlusionTimer = 0;
    this.shakeTime = 0;
    this.shakeDuration = 1;
    this.shakeStrength = 0;
    this.shakeEnabled = true;
    this.time = 0;
    this.cellRows = 0;
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    // 直式手機畫面拉遠一點，才看得到周圍
    this.aspectZoom = aspect < 1 ? 1.35 : 1;
    this.camera.updateProjectionMatrix();
  }

  /** 鏡頭視角下的「前方」與「右方」（XZ 平面），讓按鍵方向和畫面一致 */
  groundAxes() {
    const f = new Vector3(-FOLLOW_OFFSET.x, 0, -FOLLOW_OFFSET.z).normalize();
    return { forward: f, right: new Vector3(-f.z, 0, f.x) };
  }

  follow(target, snap = false) {
    this.mode = 'follow';
    this.target = target;
    if (snap) {
      this.lookAt.copy(target);
      this.base.copy(target).addScaledVector(FOLLOW_OFFSET, this.#zoom());
    }
  }

  shot(position, lookAt) {
    this.mode = 'shot';
    this.shotPos.copy(position);
    this.shotLook.copy(lookAt);
  }

  /** 立刻切到固定鏡頭（測試比較截圖用，不經過補間） */
  snapShot(position, lookAt) {
    this.shot(position, lookAt);
    this.base.copy(position);
    this.lookAt.copy(lookAt);
  }

  title() {
    this.mode = 'title';
  }

  setFocus(on) {
    this.focused = on;
  }

  setUserZoom(z) {
    this.userZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }

  zoomBy(delta) {
    this.setUserZoom(this.userZoom + delta);
  }

  shake(strength = 0.3, duration = 0.5) {
    if (!this.shakeEnabled) return;
    this.shakeStrength = strength;
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  #zoom() {
    return this.aspectZoom * this.userZoom * (1 - (1 - FOCUS_ZOOM) * this.focusAmount) * (1 - 0.35 * this.occlusion);
  }

  /** 角色是否被擋住：從鏡頭往角色打一條射線 */
  #checkOcclusion(dt) {
    this.occlusionTimer -= dt;
    if (this.occlusionTimer > 0 || !this.target || !this.occluders.length) return;
    this.occlusionTimer = 0.2;
    const head = this.target.clone().setY(this.target.y + 1.2);
    const dir = head.clone().sub(this.camera.position);
    const dist = dir.length();
    this.raycaster.set(this.camera.position, dir.normalize());
    this.raycaster.far = dist - 0.5;
    const hit = this.raycaster.intersectObjects(this.occluders, true).length > 0;
    this.occlusionTarget = hit ? 1 : 0;
  }

  update(dt) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 4);
    this.focusAmount += ((this.focused ? 1 : 0) - this.focusAmount) * (1 - Math.exp(-dt * 3));

    if (this.mode === 'title') {
      const a = this.time * 0.07;
      const r = 28 * this.aspectZoom;
      this.base.set(Math.sin(a) * r, 9 * this.aspectZoom, Math.cos(a) * r);
      this.lookAt.set(0, 3, -2);
    } else if (this.mode === 'follow' && this.target) {
      this.#checkOcclusion(dt);
      this.occlusion += ((this.occlusionTarget ?? 0) - this.occlusion) * (1 - Math.exp(-dt * 2.5));
      const desired = this.target.clone().addScaledVector(FOLLOW_OFFSET, this.#zoom());
      desired.y += this.occlusion * 3;
      this.base.lerp(desired, k);
      this.lookAt.lerp(this.target.clone().setY(this.target.y + 0.6 * this.focusAmount), k);
    } else if (this.mode === 'shot') {
      const ks = 1 - Math.exp(-dt * 2);
      this.base.lerp(this.shotPos, ks);
      this.lookAt.lerp(this.shotLook, ks);
    }

    this.camera.position.copy(this.base);
    const look = this.#snapToCells();
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const amp = this.shakeStrength * (this.shakeTime / this.shakeDuration);
      this.camera.position.x += (Math.random() - 0.5) * 2 * amp;
      this.camera.position.y += (Math.random() - 0.5) * 2 * amp;
      this.camera.position.z += (Math.random() - 0.5) * 2 * amp;
    }
    this.camera.lookAt(look);
  }

  /**
   * ASCII 抗閃爍：把鏡頭在畫面平面上的平移對齊到「一格字元」的整數倍。
   * 鏡頭方向不變，只做平移，所以焦點距離上的景物每次剛好移動整數格，靜止的景物字元不會跳動。
   */
  #snapToCells() {
    if (!this.cellRows) return this.lookAt;
    const dir = this.#tmp.dir.subVectors(this.lookAt, this.camera.position);
    const dist = dir.length();
    if (dist < 1e-3) return this.lookAt;
    dir.divideScalar(dist);
    const right = this.#tmp.right.crossVectors(dir, this.camera.up).normalize();
    const up = this.#tmp.up.crossVectors(right, dir);
    const cell = (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / this.cellRows;
    const r = this.camera.position.dot(right);
    const u = this.camera.position.dot(up);
    const offset = this.#tmp.offset
      .copy(right)
      .multiplyScalar(Math.round(r / cell) * cell - r)
      .addScaledVector(up, Math.round(u / cell) * cell - u);
    this.camera.position.add(offset);
    return this.#tmp.look.copy(this.lookAt).add(offset);
  }

  #tmp = { dir: new Vector3(), right: new Vector3(), up: new Vector3(), offset: new Vector3(), look: new Vector3() };
}
