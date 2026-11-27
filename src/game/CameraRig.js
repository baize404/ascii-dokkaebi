import { Raycaster, Vector3 } from 'three';

const FOLLOW_OFFSET = new Vector3(11, 17, 13.5);
/** 近距離模式：同一個方位角（操作方向不變），低角度、靠近，主角約占畫面高度 35%～40% */
const AZIMUTH = new Vector3(FOLLOW_OFFSET.x, 0, FOLLOW_OFFSET.z).normalize();
const CLOSE_OFFSET = AZIMUTH.clone().multiplyScalar(4.3).setY(1.9);
const CLOSE_LOOK_HEIGHT = 0.8;
const FOCUS_ZOOM = 0.72;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.5;

/**
 * 鏡頭：title（低角度環繞村子）、follow（跟著玩家）、frame（調查特寫／對話雙人鏡頭）、shot（過場鏡頭）。
 * follow 有兩種視角：explore（高角度，看路與地標）與 close（低角度近景，看得到關節與手部動作），
 * 兩者方位角相同，所以按鍵方向不會因為切換視角而改變；切換時平滑過渡。
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
    this.view = 'explore';
    this.viewBlend = 0;
    this.frameA = null;
    this.frameB = new Vector3();
    this.frameKind = 'dialogue';
  }

  /** 跟隨視角：explore 或 close */
  setView(view) {
    this.view = view === 'close' ? 'close' : 'explore';
  }

  /**
   * 互動鏡頭：a 是主角位置（會跟著更新），b 是對象。
   * kind = 'dialogue'：從側面同時拍到兩個角色的表情與肢體；'inspect'：從主角肩後特寫物件；
   * 'action'：低角度近景拍主角操作物件（開門、轉轆轤）。
   */
  frame(a, b, kind = 'dialogue', height = 1) {
    this.mode = 'frame';
    this.frameA = a;
    this.frameB.copy(b);
    this.frameKind = kind;
    this.frameHeight = height;
  }

  #frameShot() {
    const a = this.frameA;
    const b = this.frameB;
    const mid = this.#tmp.mid.addVectors(a, b).multiplyScalar(0.5);
    const sx = b.x - a.x;
    const sz = b.z - a.z;
    const sep = Math.max(0.6, Math.hypot(sx, sz));
    // 和兩者連線垂直的方向，選靠近原本鏡頭方位的那一側（不會突然跳到背面）
    let px = -sz / sep;
    let pz = sx / sep;
    if (px * AZIMUTH.x + pz * AZIMUTH.z < 0) {
      px = -px;
      pz = -pz;
    }
    const kind = this.frameKind;
    if (kind === 'inspect') {
      // 從主角的斜後方約 40° 看著物件：主角在畫面一側，不會用頭擋住刻紋
      const bx = (a.x - b.x) / sep;
      const bz = (a.z - b.z) / sep;
      const d = Math.min(3.2, sep + 1.5);
      const along = Math.cos(0.7) * d;
      const side = Math.sin(0.7) * d;
      this.shotPos.set(b.x + bx * along + px * side, b.y + this.frameHeight * 0.85 + 0.35, b.z + bz * along + pz * side);
      this.shotLook.set(b.x * 0.85 + a.x * 0.15, b.y + this.frameHeight * 0.7, b.z * 0.85 + a.z * 0.15);
      return;
    }
    const d = kind === 'action' ? 3.6 + sep * 0.6 : Math.max(3.4, sep * 1.25 + 2.1);
    const h = kind === 'action' ? 1.7 : 1.35;
    this.shotPos.set(mid.x + px * d + AZIMUTH.x * 0.8, mid.y + h, mid.z + pz * d + AZIMUTH.z * 0.8);
    this.shotLook.set(mid.x, mid.y + (kind === 'action' ? 0.75 : 0.95), mid.z);
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
      this.viewBlend = this.view === 'close' ? 1 : 0;
      this.lookAt.copy(this.#followLook(target));
      this.base.copy(this.#followPos(target));
    }
  }

  #followPos(target) {
    const z = this.#zoom();
    const out = this.#tmp.pos.copy(FOLLOW_OFFSET).multiplyScalar(z).lerp(this.#tmp.close.copy(CLOSE_OFFSET).multiplyScalar(z), this.viewBlend);
    out.y += this.occlusion * (3 - 1.8 * this.viewBlend);
    return out.add(target);
  }

  #followLook(target) {
    return this.#tmp.look2.copy(target).setY(target.y + 0.6 * this.focusAmount * (1 - this.viewBlend) + CLOSE_LOOK_HEIGHT * this.viewBlend);
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
    return this.aspectZoom * this.userZoom * (1 - (1 - FOCUS_ZOOM) * this.focusAmount * (1 - this.viewBlend)) * (1 - 0.35 * this.occlusion);
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
      this.viewBlend += ((this.view === 'close' ? 1 : 0) - this.viewBlend) * (1 - Math.exp(-dt * 3));
      this.base.lerp(this.#followPos(this.target), k);
      this.lookAt.lerp(this.#followLook(this.target), k);
    } else if (this.mode === 'frame' && this.frameA) {
      this.#frameShot();
      const ks = 1 - Math.exp(-dt * 2.6);
      this.base.lerp(this.shotPos, ks);
      this.lookAt.lerp(this.shotLook, ks);
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

  #tmp = { dir: new Vector3(), right: new Vector3(), up: new Vector3(), offset: new Vector3(), look: new Vector3(), mid: new Vector3(), pos: new Vector3(), close: new Vector3(), look2: new Vector3() };
}
