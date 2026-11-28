import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  BoxGeometry,
  Mesh,
  Object3D,
  Points,
  PointsMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import { ParticleSystem, Stars } from '../world/Particles.js';
import {
  GLOW_TEXTURE,
  MAT,
  makeBrazier,
  makeBridgePost,
  makeCliff,
  makeGrass,
  makeGround,
  makeMist,
  makeMoon,
  makeMountains,
  makePath,
  makePine,
  makePlanks,
  makeRock,
  makeRope,
  makeShrine,
  makeSpiritWave,
  makeStele,
  makeStoneLantern,
  makeWindGate,
  makeWinch,
  memoryMaterial,
  rng,
  shadow,
} from './assets.js';
import { GateMechanism, LAYOUT, MemoryState, colliders, gateShield, gustAt, inRavine, inTrench } from './rules.js';

/**
 * 「斷橋與燈」4.0 純 3D 場景。
 * 南邊庭院（起點、石碑「眼」、火盆、絞盤）→ 西側的溝（記憶木板）→ 小平台（石碑「風」）
 * → 峽谷與斷橋（人間斷了、記憶裡完整）→ 北邊山寺（要點亮的석등）。
 *
 * 一致性原則：
 * - 風：玩法（燈火）、草、煙、火、布條、角色的衣帶與燈籠全部讀 windAt()，同一個時鐘（gustAt）。
 * - 記憶物件：畫面、碰撞、點擊尋路都看同一個 MemoryState（rules.js）。
 * - 閘門：擋板高度、繩子、滑輪、捲筒、手柄都由 GateMechanism 的同一個 open01／crank 驅動。
 */
const L = LAYOUT;
const GRASS = { low: 900, medium: 2000, high: 3600 };

export class ProtoWorld {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.time = 0;
    this.bounds = L.bounds;
    this.spirit = false;
    this.spiritBlend = 0;
    this.memory = new MemoryState();
    this.colliders = colliders(false);
    this.heightAt = () => 0;
    this.pointMaterials = [];
    this.walkables = [];
    this.occluders = [];
    this.interactMeshes = new Map(); // mesh → 互動 id
    this.root = new Group();
    scene.add(this.root);
    this.gate = new GateMechanism();
    this.wind = new Vector3();
    this.exposureNow = 0;

    this.#atmosphere(scene);
    this.#terrain();
    this.#bridge();
    this.#trench();
    this.#courtyard();
    this.#gateAndWinch();
    this.#shrine();
    this.#vegetation(quality);
    this.#spirit();

    this.particles = new ParticleSystem(1200, { soft: true });
    this.smoke = new ParticleSystem(400, { mode: 'smoke' });
    this.smoke.points.renderOrder = 9;
    this.root.add(this.particles.points, this.smoke.points);
    this.pointMaterials.push(this.particles.material, this.smoke.material);
    this.smokeTimer = 0;
    this.leafTimer = 0;
  }

  // ---------- 建構 ----------

  #atmosphere(scene) {
    this.fogColor = new Color(0x0b1424);
    scene.fog = new FogExp2(this.fogColor.clone(), 0.017);
    scene.background = new Color(0x070c17);
    this.hemi = new HemisphereLight(0x5f78b0, 0x232a38, 1.2);
    scene.add(this.hemi);
    const moonLight = new DirectionalLight(0xb4c8ff, 1.9);
    moonLight.position.set(-14, 22, -10);
    moonLight.target.position.set(0, 0, 2);
    moonLight.castShadow = true;
    const cam = moonLight.shadow.camera;
    cam.left = -18;
    cam.right = 18;
    cam.top = 20;
    cam.bottom = -20;
    cam.near = 2;
    cam.far = 70;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.bias = -0.0006;
    moonLight.shadow.normalBias = 0.03;
    scene.add(moonLight, moonLight.target);
    this.moonLight = moonLight;
    this.moon = makeMoon();
    this.moon.position.set(-55, 42, -95);
    this.moon.lookAt(0, 0, 0);
    scene.add(this.moon);
    scene.add(makeMountains());
    this.stars = new Stars(320, Math.random);
    scene.add(this.stars.points);
    this.pointMaterials.push(this.stars.material);
  }

  #terrain() {
    const R = L.ravine;
    const T = L.trench;
    // 南邊平台（溝的東側、西側小平台分開）與北邊平台
    const pathSouth = (x, z) => Math.max(0, 1 - Math.abs(x - this.#pathX(z)) / 0.9) * (z > R.maxZ ? 1 : 0);
    const south = makeGround(T.maxX, L.bounds.maxX + 4, R.maxZ, L.bounds.maxZ + 4, 2, pathSouth);
    const ledge = makeGround(L.bounds.minX - 4, T.minX, R.maxZ, L.bounds.maxZ + 4, 3);
    const north = makeGround(L.bounds.minX - 4, L.bounds.maxX + 4, L.bounds.minZ - 6, R.minZ, 4);
    // 溝的南端外側也要有地面（溝只到 maxZ）
    for (const g of [south, ledge, north]) {
      this.root.add(g);
      this.walkables.push(g);
    }
    // 峽谷壁（南壁面向北、北壁面向南），往東西延伸到畫面外
    this.root.add(makeCliff({ along: 'x', from: L.bounds.minX - 14, to: L.bounds.maxX + 14, at: R.maxZ, facing: -1, seed: 3 }));
    this.root.add(makeCliff({ along: 'x', from: L.bounds.minX - 14, to: L.bounds.maxX + 14, at: R.minZ, facing: 1, seed: 7 }));
    // 溝壁
    this.root.add(makeCliff({ along: 'z', from: R.maxZ, to: T.maxZ + 3, at: T.minX, facing: 1, bottom: -9, seed: 11 }));
    this.root.add(makeCliff({ along: 'z', from: R.maxZ, to: T.maxZ + 3, at: T.maxX, facing: -1, bottom: -9, seed: 13 }));
    // 谷底（看不見底：深色＋霧）
    const abyss = new Mesh(new BoxGeometry(80, 0.5, R.maxZ - R.minZ + 2), MAT.void);
    abyss.position.set(0, -17, (R.minZ + R.maxZ) / 2);
    this.root.add(abyss);
    const trenchFloor = new Mesh(new BoxGeometry(T.maxX - T.minX + 1, 0.5, T.maxZ - T.minZ + 4), MAT.void);
    trenchFloor.position.set((T.minX + T.maxX) / 2, -9.2, (T.minZ + T.maxZ) / 2 + 1);
    this.root.add(trenchFloor);
    this.mist = makeMist({ minX: -40, maxX: 40, minZ: R.minZ, maxZ: R.maxZ });
    this.root.add(this.mist.group);
    // 石板路：起點 → 橋頭；橋尾 → 山寺
    this.root.add(makePath([[L.start.x, L.start.z + 1.5], [1.2, 11], [0.4, 7.5], [0, 4.2], [0, R.maxZ + 0.1]], { seed: 5 }));
    this.root.add(makePath([[0, R.minZ - 0.1], [0, -6.5], [0.3, -8.4], [0, -9.6]], { seed: 6 }));
    // 崖邊的石頭
    const r = rng(41);
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? R.maxZ + 0.4 + r() * 0.8 : R.minZ - 0.4 - r() * 0.8;
      const x = (r() - 0.5) * 2 * (L.bounds.maxX + 2);
      if (Math.abs(x) < 2.2 || (side > 0 && x > T.minX - 0.6 && x < T.maxX + 0.6)) continue;
      if (Math.abs(x - L.winch.x) < 1.4 && side > 0) continue;
      if (Math.abs(x - L.brazier.x) < 1.2 && side > 0) continue;
      const rock = makeRock(0.25 + r() * 0.45, i + 3);
      rock.position.set(x, 0.05, side);
      rock.rotation.y = r() * 6;
      this.root.add(rock);
    }
  }

  /** 南邊石板路的中心線（給地面顏色用） */
  #pathX(z) {
    if (z > 11) return 1.2 + (z - 11) * 0.08;
    return Math.max(0, (z - 3.5) * 0.15);
  }

  #bridge() {
    const R = L.ravine;
    const B = L.bridge;
    const group = new Group();
    // 人間：兩端殘留的橋板（斷口參差）
    const south = makePlanks(R.maxZ + 0.35, L.remnantSouth.minZ, { width: B.half * 2, seed: 9, broken: 3 });
    const north = makePlanks(R.minZ - 0.35, L.remnantNorth.maxZ, { width: B.half * 2, seed: 10, broken: 3 });
    group.add(south, north);
    this.walkables.push(south, north);
    // 橋頭柱
    const posts = [];
    for (const z of [R.maxZ + 0.45, R.minZ - 0.45]) for (const x of [-B.half - 0.12, B.half + 0.12]) posts.push(makeBridgePost(x, z));
    group.add(...posts);
    // 斷掉的扶手繩：從橋頭柱垂下去
    const top = 0.95;
    for (const x of [-B.half - 0.12, B.half + 0.12]) {
      group.add(makeRope(new Vector3(x, top, R.maxZ + 0.45), new Vector3(x, top, L.remnantSouth.minZ), 0.25, 0.022, MAT.rope, new Vector3(x + 0.1, -2.2, L.remnantSouth.minZ + 0.2)));
      group.add(makeRope(new Vector3(x, top, R.minZ - 0.45), new Vector3(x, top, L.remnantNorth.maxZ), 0.25, 0.022, MAT.rope, new Vector3(x - 0.15, -3.1, L.remnantNorth.maxZ - 0.3)));
    }
    // 掛在繩上晃的斷橋板
    this.danglers = [];
    for (const [z, d] of [
      [L.remnantSouth.minZ - 0.05, -1],
      [L.remnantNorth.maxZ + 0.05, 1],
    ]) {
      const pivot = new Group();
      pivot.position.set(0.3 * d, -0.05, z);
      const plank = new Mesh(new BoxGeometry(0.9, 0.06, 0.26), MAT.wood);
      plank.position.set(0, -1.1, 0);
      plank.rotation.z = 1.2 * d;
      pivot.add(plank, makeRope(new Vector3(0, 0, 0), new Vector3(0, -1.1, 0), 0.05, 0.015));
      group.add(pivot);
      this.danglers.push(pivot);
    }
    shadow(group);
    this.root.add(group);
    this.humanBridge = group;
  }

  #trench() {
    const T = L.trench;
    // 溝邊的木樁（人間：記憶木板兩端只剩木樁）
    for (const x of [T.minX - 0.25, T.maxX + 0.25]) for (const z of [L.plank.z - 0.65, L.plank.z + 0.65]) this.root.add(makeBridgePost(x, z));
  }

  #courtyard() {
    this.brazier = makeBrazier();
    this.brazier.group.position.set(L.brazier.x, 0, L.brazier.z);
    this.root.add(this.brazier.group);
    this.#interactive(this.brazier.group, 'brazier');
    // 石碑
    this.steles = L.steles.map((s, i) => {
      const st = makeStele(s.picture, 5 + i * 4);
      st.group.position.set(s.x, 0, s.z);
      // 「眼」面向南（起點方向）；「風」面向東（溝的方向）
      st.group.rotation.y = s.id === 'stele-wind' ? Math.PI / 2 : 0;
      this.root.add(st.group);
      this.#interactive(st.group, s.id);
      this.occluders.push(st.body);
      return Object.assign(st, { id: s.id, x: s.x, z: s.z, picture: s.picture, seen: false, coverageNow: 0, glow: 0 });
    });
  }

  #gateAndWinch() {
    this.winch = makeWinch();
    this.winch.group.position.set(L.winch.x, 0, L.winch.z);
    this.root.add(this.winch.group);
    this.#interactive(this.winch.group, 'winch');
    this.root.updateMatrixWorld(true);
    const drumWorld = this.winch.drum.localToWorld(new Vector3(0, this.winch.drumRadius, 0));
    this.windGate = makeWindGate({ x: L.shutterX, zSouth: L.ravine.maxZ, zNorth: L.ravine.minZ, winchDrumWorld: drumWorld });
    this.root.add(this.windGate.group);
    this.occluders.push(...this.windGate.group.children.filter((c) => c.isMesh && c.geometry.parameters?.height > 5));
  }

  #shrine() {
    this.shrine = makeShrine({ cx: 0, front: -12.0, back: -14.6 });
    this.root.add(this.shrine.group);
    this.occluders.push(...this.shrine.occluders);
    this.lamp = makeStoneLantern();
    this.lamp.group.position.set(L.lamp.x, 0, L.lamp.z);
    this.root.add(this.lamp.group);
    this.#interactive(this.lamp.group, 'lamp');
  }

  #vegetation(quality) {
    const R = L.ravine;
    const T = L.trench;
    const avoid = [
      [L.brazier.x, L.brazier.z, 1.2],
      [L.winch.x, L.winch.z, 1.4],
      [L.lamp.x, L.lamp.z, 1.3],
      ...L.steles.map((s) => [s.x, s.z, 1.3]),
    ];
    const place = (r) => {
      const x = L.bounds.minX - 2 + r() * (L.bounds.maxX - L.bounds.minX + 4);
      const z = L.bounds.minZ - 2 + r() * (L.bounds.maxZ - L.bounds.minZ + 4);
      if (z > R.minZ - 0.3 && z < R.maxZ + 0.3) return null;
      if (x > T.minX - 0.3 && x < T.maxX + 0.3 && z > R.maxZ) return null;
      if (z < -11 && Math.abs(x) < 4.6) return null; // 山寺
      if (z > R.maxZ && Math.abs(x - this.#pathX(z)) < 0.85) return null; // 石板路
      if (z < R.minZ && Math.abs(x) < 0.85 && z > -10) return null;
      for (const [ax, az, ar] of avoid) if (Math.hypot(x - ax, z - az) < ar) return null;
      return { x, z };
    };
    this.grass = makeGrass(GRASS[quality] ?? GRASS.high, place, { ravine: R });
    this.root.add(this.grass);
    this.pines = [];
    const spots = [
      [-9.2, 15.5, 6.5],
      [8.8, 14.2, 7],
      [9.6, 8.8, 5.5],
      [-8.6, 18.6, 5],
      [-9.4, 6.2, 6],
      [-7.2, -6.4, 7.5],
      [7.6, -7.4, 6.5],
      [-6.6, -13.2, 8],
      [6.8, -13.6, 7.5],
      [9.4, 18.8, 5.5],
    ];
    for (const [i, [x, z, h]] of spots.entries()) {
      const p = makePine(i * 13 + 7, h);
      p.group.position.set(x, 0, z);
      this.root.add(p.group);
      this.pines.push(p);
      this.occluders.push(...p.group.children);
    }
    this.setQuality(quality);
  }

  #spirit() {
    // 記憶的橋：完整橋板＋扶手繩（記憶材質），以及人間看得到的殘影光塵
    const B = L.bridge;
    const z0 = L.remnantSouth.minZ + 0.1;
    const z1 = L.remnantNorth.maxZ - 0.1;
    this.memMat = memoryMaterial();
    const n = Math.round((z0 - z1) / 0.3);
    this.memPlanks = new InstancedMesh(new BoxGeometry(B.half * 2, 0.07, 0.26), this.memMat, n);
    this.memPlanks.userData.walkable = true;
    this.memPlanks.userData.memory = true;
    this.memSlots = [];
    for (let i = 0; i < n; i++) this.memSlots.push({ x: 0, z: z0 - (i + 0.5) * ((z0 - z1) / n), seed: Math.random() });
    this.root.add(this.memPlanks);
    this.walkables.push(this.memPlanks);
    const ropeMat = this.memMat;
    this.memRopes = new Group();
    for (const x of [-B.half - 0.12, B.half + 0.12]) {
      const curve = new CatmullRomCurve3([new Vector3(x, 0.95, L.ravine.maxZ + 0.45), new Vector3(x, 0.72, (z0 + z1) / 2), new Vector3(x, 0.95, L.ravine.minZ - 0.45)]);
      this.memRopes.add(new Mesh(new TubeGeometry(curve, 24, 0.025, 5, false), ropeMat));
    }
    this.root.add(this.memRopes);
    // 溝上的記憶木板（6 片，沿 x 方向走過去）
    const T = L.trench;
    this.memLog = new InstancedMesh(new BoxGeometry(0.28, 0.07, L.plank.half * 2 - 0.1), this.memMat, 6);
    this.memLog.userData.walkable = true;
    this.memLog.userData.memory = true;
    this.logSlots = [];
    for (let i = 0; i < 6; i++) this.logSlots.push({ x: T.minX + ((i + 0.5) / 6) * (T.maxX - T.minX), z: L.plank.z, seed: Math.random() });
    this.root.add(this.memLog);
    this.walkables.push(this.memLog);
    // 殘影光塵（R5）：沿著橋板形狀飄的微弱光點
    const pts = [];
    this.moteBase = [];
    const addMotes = (slots, w, d, count) => {
      for (let i = 0; i < count; i++) {
        const s = slots[Math.floor(Math.random() * slots.length)];
        const p = [s.x + (Math.random() - 0.5) * w, -0.02 + Math.random() * 0.12, s.z + (Math.random() - 0.5) * d];
        this.moteBase.push({ p, ph: Math.random() * 6.28, sp: 0.2 + Math.random() * 0.4 });
        pts.push(...p);
      }
    };
    addMotes(this.memSlots, B.half * 2, 0.26, 170);
    addMotes(this.logSlots, 0.28, L.plank.half * 2, 50);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.motesMat = new PointsMaterial({ color: 0x8ff0ff, size: 0.09, map: GLOW_TEXTURE, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.5 });
    this.motes = new Points(g, this.motesMat);
    this.root.add(this.motes);
    // 光波
    this.wave = makeSpiritWave();
    this.root.add(this.wave);
    this.waveT = Infinity;
    this.#placeMemory(0);
  }

  #interactive(obj, id) {
    obj.traverse((o) => {
      if (o.isMesh) this.interactMeshes.set(o, id);
    });
  }

  // ---------- 對外 ----------

  setQuality(q) {
    const k = { low: 0.25, medium: 0.55, high: 1 }[q] ?? 1;
    this.grass.count = Math.round(this.grass.userData.fullCount * k);
    this.moonLight.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.moonLight.shadow.mapSize.x !== size) {
      this.moonLight.shadow.mapSize.set(size, size);
      this.moonLight.shadow.map?.dispose();
      this.moonLight.shadow.map = null;
    }
  }

  /** 靈視開／關：記憶物件的狀態由 update() 依 MemoryState 推進 */
  setSpirit(on, origin = null) {
    if (on === this.spirit) return;
    this.spirit = on;
    if (on && origin) {
      this.wave.position.copy(origin);
      this.waveT = 0;
    }
  }

  get memorySolid() {
    return this.memory.solid;
  }

  get shutterOpen01() {
    return this.gate.open01;
  }

  get shutterClosed() {
    return this.gate.open01 < 0.08;
  }

  /** 目前的峽谷風（陣風 × 閘門倍率），0–1 */
  get canyonWind() {
    return this.exposureNow;
  }

  /** 共用風場：峽谷裡（以及峽谷邊）往西吹的陣風＋到處都有的微風 */
  windAt(p, out = new Vector3()) {
    const R = L.ravine;
    const dz = Math.max(0, R.minZ - p.z, p.z - R.maxZ);
    const near = inRavine(p.x, p.z) ? 1 : Math.exp(-dz * dz * 0.06);
    const k = 0.3 + 3.2 * this.exposureNow * near;
    return out.set(-k, 0, 0.18 * Math.sin(this.time * 0.7 + p.x * 0.2));
  }

  burst(kind, p, opts = {}) {
    const presets = {
      spark: { count: 3, spread: 0.03, speed: 0.4, up: 0.8, color: 0xffb050, life: 0.6, gravity: -0.3, drag: 1.5, size: 0.05 },
      reveal: { count: 22, spread: 0.45, speed: 0.4, up: 0.6, color: 0xffe2a0, life: 1.5, gravity: -0.1, drag: 1.2, size: 0.09 },
      memory: { count: 30, spread: 0.6, speed: 0.6, up: 0.5, color: 0x8ff0ff, life: 1.6, gravity: -0.15, drag: 1.1, size: 0.1 },
      ignite: { count: 26, spread: 0.1, speed: 1.3, up: 1.5, color: 0xffc060, life: 0.9, gravity: 0.6, drag: 1, size: 0.08 },
      snuff: { count: 12, spread: 0.05, speed: 0.6, up: 0.8, color: 0x8a95a6, life: 1.4, gravity: -0.25, drag: 0.8, size: 0.25, system: 'smoke' },
      dissolve: { count: 8, spread: 0.5, speed: 0.4, up: -0.3, color: 0x8ff0ff, life: 1.2, gravity: 2.5, drag: 0.6, size: 0.08 },
    };
    const base = presets[kind];
    if (!base) return;
    const { system, ...o } = { ...base, ...opts };
    (system === 'smoke' ? this.smoke : this.particles).emit({ ...o, x: p.x, y: p.y, z: p.z });
  }

  /**
   * 互動定義需要的站位與面向。stand：角色要站的位置；face：要面向的點。
   */
  interactables() {
    return [
      { id: 'brazier', x: L.brazier.x, z: L.brazier.z, radius: 2, label: '火盆', stand: { x: L.brazier.x, z: L.brazier.z + 1.05 }, face: { x: L.brazier.x, z: L.brazier.z } },
      { id: 'winch', x: L.winch.x, z: L.winch.z, radius: 2, label: '絞盤', stand: { x: L.winch.x - 0.87, z: L.winch.z - 0.12 }, face: { x: L.winch.x + 2, z: L.winch.z - 0.12 } },
      ...this.steles.map((s) =>
        s.id === 'stele-wind'
          ? { id: s.id, x: s.x, z: s.z, radius: 2.3, label: '石碑', stand: { x: s.x + 1.15, z: s.z + 0.4 }, face: { x: s.x, z: s.z + 0.4 } }
          : { id: s.id, x: s.x, z: s.z, radius: 2.3, label: '石碑', stand: { x: s.x - 0.4, z: s.z + 1.15 }, face: { x: s.x - 0.4, z: s.z } },
      ),
      { id: 'lamp', x: L.lamp.x, z: L.lamp.z, radius: 2.1, label: '石燈', stand: { x: L.lamp.x, z: L.lamp.z + 1.1 }, face: { x: L.lamp.x, z: L.lamp.z } },
    ];
  }

  /** 記憶物件的擺放：每片橋板依成形程度與「光波」到達的時間錯開 */
  #placeMemory(dt) {
    const m = this.memory;
    const e = new Object3D();
    const form = m.form;
    const st = m.state;
    const t = this.time;
    const unstable = st === 'unstable';
    const place = (mesh, slots, along) => {
      for (const [i, s] of slots.entries()) {
        const order = along === 'z' ? i / slots.length : i / slots.length;
        // 成形：從靠近玩家那一端開始（光波從燈籠擴散）；崩散：反過來
        const k = Math.max(0, Math.min(1, form * 1.8 - order * 0.8));
        const shake = unstable ? (Math.sin(t * 37 + s.seed * 50) * 0.008) : 0;
        e.position.set(s.x + shake, -0.035 - (1 - k) * (st === 'dissolving' ? 1.6 : 0.5) * (0.5 + s.seed), s.z);
        e.rotation.set((1 - k) * (s.seed - 0.5) * 0.8, 0, (1 - k) * (s.seed - 0.5) * 0.6);
        e.scale.setScalar(Math.max(0.001, 0.35 + 0.65 * k));
        e.updateMatrix();
        mesh.setMatrixAt(i, e.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    place(this.memPlanks, this.memSlots, 'z');
    place(this.memLog, this.logSlots, 'x');
    const visible = form > 0.001;
    this.memPlanks.visible = this.memLog.visible = this.memRopes.visible = visible;
    const flicker = unstable ? 0.55 + 0.45 * Math.abs(Math.sin(t * 13 + Math.sin(t * 31))) : 1;
    // 亮度壓在光暈門檻附近：看得出一片一片的橋板，而不是一整條光柱
    this.memMat.opacity = Math.min(0.8, form * 0.8) * flicker;
    this.memMat.emissiveIntensity = (unstable ? 0.3 : 0.42) * flicker + (st === 'revealing' ? 0.6 * (1 - form) : 0);
    this.memMat.emissive.setRGB(unstable ? 0.5 : 0.16, unstable ? 0.45 : 0.62, unstable ? 0.5 : 0.7);
    // 殘影光塵：人間時微弱閃爍（引起好奇）；靈界時跟著橋變亮
    const pos = this.motes.geometry.attributes.position;
    for (const [i, b] of this.moteBase.entries()) {
      const y = b.p[1] + ((t * b.sp * 0.25 + b.ph) % 1) * 0.35;
      pos.setXYZ(i, b.p[0] + Math.sin(t * b.sp + b.ph) * 0.04, y, b.p[2] + Math.cos(t * b.sp * 0.8 + b.ph) * 0.04);
    }
    pos.needsUpdate = true;
    this.motesMat.opacity = (0.32 + 0.18 * Math.sin(t * 1.7)) * (1 - form * 0.6) + form * 0.25;
    this.motesMat.size = 0.08 + 0.03 * form;
    void dt;
  }

  /**
   * @param ctx.spirit 靈視；ctx.heat 燈籠火力；ctx.playerPos
   * @returns { gust, exposure, memoryEvent }
   */
  update(dt, ctx) {
    this.time += dt;
    const t = this.time;
    const g = gustAt(t);
    this.exposureNow = g.strength * gateShield(this.gate.open01);
    // 記憶物件狀態（碰撞跟著狀態，主程式負責重建導航）
    const memoryEvent = this.memory.update(dt, { spirit: this.spirit, heat: ctx.heat ?? 1 });
    if (memoryEvent) this.colliders = colliders(this.memory.solid);
    if (memoryEvent === 'dissolving') {
      for (const s of this.memSlots) if (Math.random() < 0.5) this.burst('dissolve', { x: s.x, y: 0, z: s.z });
    }
    this.#placeMemory(dt);
    this.spiritBlend += ((this.spirit ? 1 : 0) - this.spiritBlend) * (1 - Math.exp(-dt * 4));
    const sb = this.spiritBlend;
    // 靈界的空氣：霧變成青藍、天光變冷、月亮變亮（不是整個畫面套藍色濾鏡：暖色的火與燈籠保持原色）
    this.scene.fog.color.copy(this.fogColor).lerp(new Color(0x0c2630), sb * 0.5);
    this.scene.fog.density = 0.017 - 0.003 * sb;
    this.hemi.color.setRGB(0.37 - 0.06 * sb, 0.47 + 0.06 * sb, 0.69 + 0.05 * sb);
    this.hemi.intensity = 1.2 + 0.25 * sb;
    this.moon.userData.halo.material.opacity = 0.45 + 0.35 * sb;
    this.motes.visible = true;
    // 光波
    if (this.waveT < 1.4) {
      this.waveT += dt;
      const k = this.waveT / 1.4;
      this.wave.visible = true;
      this.wave.scale.setScalar(0.3 + 16 * k);
      this.wave.material.opacity = 0.35 * (1 - k) * (1 - k);
    } else this.wave.visible = false;
    // 閘門：擋板、繩子、滑輪、絞盤手柄都由同一個機構狀態驅動
    this.windGate.setOpen(this.gate.open01);
    this.winch.setAngle(this.gate.crank);
    for (const c of this.windGate.cloths) {
      const w = this.windAt(c.getWorldPosition(new Vector3()));
      c.rotation.z = Math.max(-1.3, Math.min(1.3, w.x * 0.32 + Math.sin(t * 4 + c.userData.phase) * 0.12 * (0.3 + Math.abs(w.x) * 0.3)));
      c.rotation.x = Math.sin(t * 2.3 + c.userData.phase) * 0.08;
    }
    // 火盆：火焰傾斜、煙的方向和量都直接讀風場——這是玩家判斷時機最主要的線索
    const bw = this.windAt(this.brazier.group.position, this.wind);
    this.brazier.flame.update(t, { x: bw.x * 0.35, y: 0, z: bw.z * 0.35 }, 0.4);
    this.brazier.light.intensity = 6.5 + Math.sin(t * 9) * 0.5 + Math.sin(t * 15.3) * 0.3;
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.08;
      const b = L.brazier;
      this.smoke.emit({ x: b.x, y: 1.25, z: b.z, count: 1, spread: 0.1, speed: 0.15, up: 1, color: 0x8b96a8, life: 3.4, gravity: -0.2, drag: 0.6, size: 0.75, jitter: 0.1 });
      if (Math.random() < 0.3) this.burst('spark', { x: b.x, y: 1.1, z: b.z });
    }
    // 陣風時有落葉從峽谷邊吹過去
    this.leafTimer -= dt;
    if (this.leafTimer <= 0) {
      this.leafTimer = 0.25;
      if (this.exposureNow > 0.5) this.particles.emit({ x: 8 + Math.random() * 4, y: 0.4 + Math.random() * 2, z: L.ravine.maxZ + Math.random() * 2, count: 1, spread: 0.3, speed: 0.3, up: 0.3, color: 0x8a6a3a, life: 3, gravity: 0.3, drag: 0.4, size: 0.09 });
    }
    const pw = this.windAt(new Vector3(0, 0, L.ravine.maxZ + 1), new Vector3()).multiplyScalar(0.9);
    this.particles.update(dt, pw);
    this.smoke.update(dt, pw);
    this.stars.update(t);
    // 草、樹、斷橋板
    const u = this.grass.userData.uniforms;
    u.uTime.value = t;
    u.uGust.value = this.exposureNow;
    for (const p of this.pines) {
      const w = this.windAt(p.group.position);
      for (const c of p.clumps) {
        const s = c.userData.stiff;
        c.rotation.z = (w.x * 0.012 + Math.sin(t * 1.3 + c.userData.phase) * 0.015) / s;
        c.rotation.x = Math.sin(t * 0.9 + c.userData.phase) * 0.012 / s;
      }
    }
    for (const [i, d] of this.danglers.entries()) d.rotation.z = Math.sin(t * 1.4 + i) * 0.08 + this.exposureNow * 0.25;
    for (const l of this.mist.layers) {
      l.tex.offset.x += dt * (l.speed + this.exposureNow * 0.03);
      l.tex.offset.y += dt * l.speed * 0.3;
    }
    // 石燈與山寺
    this.lamp.update(t, dt, this.windAt(this.lamp.group.position));
    return { gust: g, exposure: this.exposureNow, memoryEvent };
  }
}
