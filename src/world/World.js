import {
  AdditiveBlending,
  AmbientLight,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { ease, Tweens } from '../core/Tweens.js';
import { makeBox } from './Collision.js';
import { makeDokkaebiModel } from './characters.js';
import { mats } from './materials.js';
import { Fireflies, ParticleSystem, Stars } from './Particles.js';
import {
  box,
  makeAltar,
  makeChimney,
  makeGrassField,
  makeHanok,
  makeJangseung,
  makeJars,
  makeShrineTree,
  makeStoneLantern,
  makeStorehouse,
  makeTree,
  makeWallSegment,
  makeWell,
  makeWisp,
  seededRandom,
} from './props.js';

const MOON_FROM = new Vector3(0, -2, -80);
const MOON_TO = new Vector3(0, 30, -80);

/** 粒子特效的預設參數（見 ParticleSystem.emit） */
const BURSTS = {
  dust: { count: 3, spread: 0.08, speed: 0.7, up: 0.35, color: 0x8b8577, life: 0.5, gravity: 0.6, drag: 3, size: 0.2 },
  spark: { count: 1, spread: 0.05, speed: 0.25, up: 0.7, color: 0xffa040, life: 0.8, gravity: -0.2, drag: 1, size: 0.07 },
  item: { count: 28, spread: 0.2, speed: 1.6, up: 2.4, color: 0xffd36e, life: 0.9, gravity: 3.5, drag: 1.2, size: 0.13 },
  lanternOn: { count: 34, spread: 0.15, speed: 2.2, up: 2.6, color: 0xffa64d, life: 0.9, gravity: 4, drag: 1, size: 0.12 },
  smoke: { count: 18, spread: 0.3, speed: 0.8, up: 1.0, color: 0x707686, life: 1.5, gravity: -0.4, drag: 1.5, size: 0.45 },
  door: { count: 16, spread: 0.4, speed: 0.9, up: 0.5, color: 0x8a8070, life: 1.2, gravity: 0.2, drag: 2, size: 0.35 },
  dokkaebi: { count: 90, spread: 0.6, speed: 4, up: 3.2, color: 0x6fb7ff, life: 1.4, gravity: 2.2, drag: 1.2, size: 0.2 },
  wrong: { count: 18, spread: 0.3, speed: 1.6, up: 1.8, color: 0xff6a5a, life: 0.8, gravity: 3, drag: 1, size: 0.14 },
  correct: { count: 26, spread: 0.3, speed: 2, up: 2.6, color: 0xffe08a, life: 1, gravity: 3, drag: 1, size: 0.14 },
  moon: { count: 4, spread: 3.5, speed: 0.4, up: 1.6, color: 0xfff1c4, life: 3, gravity: -0.3, drag: 0.4, size: 0.16 },
};

/** 地面這類大平面：用頂點顏色做出深淺不一的斑塊 */
function paintNoise(geometry, baseHex, amount, rand) {
  const base = new Color(baseHex);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const n = Math.sin(x * 0.35 + 1.3) * Math.cos(y * 0.29 - 0.7) * 0.5 + Math.sin(x * 0.9 + y * 0.7) * 0.3 + (rand() - 0.5) * 0.5;
    const k = 1 + n * amount;
    colors[i * 3] = base.r * k;
    colors[i * 3 + 1] = base.g * k;
    colors[i * 3 + 2] = base.b * k;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
}

/**
 * 依照關卡資料蓋出 3D 村落，並提供場景效果（點燈、開門、粒子、도깨비的動作、月亮升起）。
 * 不包含遊戲規則。
 */
export class World {
  constructor(level) {
    this.level = level;
    this.scene = new Scene();
    this.tweens = new Tweens();
    this.colliders = [];
    this.interactables = [];
    this.pickables = [];
    this.facePoints = new Map();
    this.lanterns = new Map();
    this.wisps = [];
    this.swayers = [];
    this.strips = [];
    this.emitAcc = {};
    this.time = 0;
    this.dokAction = null;

    const rand = seededRandom(20261126);
    this.#buildEnvironment(rand);
    this.#buildGround(rand);
    this.#buildWalls();
    this.#buildVillage(rand);
    this.#buildShrine(rand);
    this.#buildTrees(rand);
    this.#buildGrass(rand);
    this.#buildInteractables();
    this.#setupShadows();
  }

  get bounds() {
    return this.level.bounds;
  }

  get shrinePosition() {
    return new Vector3(this.level.altar.x, 0, this.level.altar.z);
  }

  /** 所有粒子材質，Game 依畫面大小更新它們的尺寸比例 */
  get pointMaterials() {
    return [this.particles.material, this.fireflies.material, this.stars.material];
  }

  // ---------- 建構 ----------

  #buildEnvironment(rand) {
    this.scene.background = new Color(0x000000);
    this.scene.fog = new FogExp2(0x000000, 0.016);
    this.ambient = new AmbientLight(0x5a6a9a, 2.0);
    this.hemi = new HemisphereLight(0x8095d0, 0x2a2a1e, 1.8);

    // 星光：唯一會投射陰影的光
    this.starlight = new DirectionalLight(0x9fb0e0, 2.6);
    this.starlight.position.set(-18, 36, -10);
    this.starlight.castShadow = true;
    const cam = this.starlight.shadow.camera;
    cam.left = -36;
    cam.right = 36;
    cam.top = 36;
    cam.bottom = -36;
    cam.near = 1;
    cam.far = 100;
    this.starlight.shadow.mapSize.set(2048, 2048);
    this.starlight.shadow.bias = -0.0005;
    this.starlight.shadow.normalBias = 0.04;

    this.moonlight = new DirectionalLight(0xfff1c4, 0);
    this.moonlight.position.set(0, 30, -40);
    this.scene.add(this.ambient, this.hemi, this.starlight, this.moonlight);

    this.moon = new Mesh(new SphereGeometry(7, 24, 16), mats.moon);
    const halo = new Mesh(
      new SphereGeometry(11, 20, 14),
      new MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false }),
    );
    this.moon.add(halo);
    this.moon.position.copy(MOON_FROM);
    this.moon.visible = false;
    this.scene.add(this.moon);

    // 引導光點：一顆旋轉的黃色菱形
    this.marker = new Group();
    this.marker.add(new Mesh(new OctahedronGeometry(0.5, 0), new MeshBasicMaterial({ color: 0xffd36e })));
    this.marker.visible = false;
    this.markerBase = new Vector3();
    this.scene.add(this.marker);

    this.particles = new ParticleSystem(1200);
    this.fireflies = new Fireflies(this.level.bounds, 70, rand);
    this.stars = new Stars(280, rand);
    this.scene.add(this.particles.points, this.fireflies.points, this.stars.points);

    for (const obj of [this.moon, halo, this.marker.children[0]]) obj.userData.noShadow = true;
  }

  #buildGround(rand) {
    const groundGeom = new PlaneGeometry(90, 90, 90, 90);
    paintNoise(groundGeom, 0x2e4034, 0.4, rand);
    const ground = new Mesh(groundGeom, new MeshLambertMaterial({ vertexColors: true }));
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    ground.userData.noShadow = true;
    this.scene.add(ground);
    this.pickables.push(ground);

    for (const [x, z, w, d] of this.level.paths) {
      const geom = new PlaneGeometry(w, d, Math.ceil(w * 2), Math.ceil(d * 2));
      paintNoise(geom, 0x6a6252, 0.3, rand);
      const path = new Mesh(geom, new MeshLambertMaterial({ vertexColors: true }));
      path.rotation.x = -Math.PI / 2;
      path.position.set(x, 0.01, z);
      path.userData.isGround = true;
      path.userData.noShadow = true;
      this.scene.add(path);
      this.pickables.push(path);
    }
  }

  #buildWalls() {
    const { minX, maxX, minZ, maxZ } = this.level.bounds;
    const west = minX - 0.6;
    const east = maxX + 0.6;
    const north = minZ - 0.6;
    const south = maxZ + 0.6;
    const width = east - west;
    const segments = [
      [makeWallSegment(width + 0.8, 'x'), 0, north],
      [makeWallSegment(south - north, 'z'), west, (north + south) / 2],
      [makeWallSegment(south - north, 'z'), east, (north + south) / 2],
      [makeWallSegment(east - 3.2, 'x'), (east + 3.2) / 2, south],
      [makeWallSegment(-3.2 - west, 'x'), (west - 3.2) / 2, south],
    ];
    for (const [mesh, x, z] of segments) {
      mesh.position.x = x;
      mesh.position.z = z;
      this.scene.add(mesh);
    }
    // 村口的門柱
    for (const sx of [-1, 1]) {
      const post = box(0.5, 2.6, 0.5, mats.darkWood);
      post.position.set(sx * 3.2, 1.3, south);
      this.scene.add(post);
    }
  }

  #buildVillage(rand) {
    const L = this.level;
    this.houseGroups = new Map();
    for (const h of L.houses) {
      const g = makeHanok(h);
      g.position.set(h.x, 0, h.z);
      this.scene.add(g);
      this.houseGroups.set(h.id, g);
      this.colliders.push(makeBox(h.x, h.z, h.w + 0.8, h.d + 0.8));
    }

    // 廚房旁的煙囪
    const kitchen = L.houses.find((h) => h.id === 'kitchen');
    this.chimneyTop = new Vector3(kitchen.x - kitchen.w / 2 - 1.0, 2.7, kitchen.z - 1.2);
    const chimney = makeChimney();
    chimney.position.set(this.chimneyTop.x, 0, this.chimneyTop.z);
    this.scene.add(chimney);
    this.colliders.push(makeBox(this.chimneyTop.x, this.chimneyTop.z, 0.9, 0.9));

    const s = L.storehouse;
    this.storehouse = makeStorehouse(s);
    this.storehouse.group.position.set(s.x, 0, s.z);
    this.scene.add(this.storehouse.group);
    this.colliders.push(makeBox(s.x, s.z, s.w + 0.6, s.d + 0.6));

    this.well = makeWell();
    this.well.position.set(L.well.x, 0, L.well.z);
    this.scene.add(this.well);
    this.colliders.push(makeBox(L.well.x, L.well.z, 2.6, 2.4));

    this.jangseung = L.jangseung.map((j) => {
      const g = makeJangseung(j);
      g.position.set(j.x, 0, j.z);
      this.scene.add(g);
      this.colliders.push(makeBox(j.x, j.z, 0.9, 0.9));
      return g;
    });

    for (const l of L.lanterns) {
      const lantern = makeStoneLantern();
      lantern.group.position.set(l.x, 0, l.z);
      this.scene.add(lantern.group);
      this.lanterns.set(l.season, lantern);
      this.colliders.push(makeBox(l.x, l.z, 1.0, 1.0));
    }

    const jars = makeJars(rand);
    jars.position.set(L.jars.x, 0, L.jars.z);
    this.scene.add(jars);
    this.colliders.push(makeBox(L.jars.x, L.jars.z, 3.2, 2.2));
  }

  #buildShrine(rand) {
    const { shrine, altar } = this.level;
    this.shrineTree = makeShrineTree(rand);
    this.shrineTree.position.set(shrine.x, 0, shrine.z);
    this.scene.add(this.shrineTree);
    this.colliders.push(makeBox(shrine.x, shrine.z, 2.4, 2.4));
    this.colliders.push(makeBox(shrine.x + 1.8, shrine.z + 0.9, 1.6, 1.6));
    this.shrineTree.traverse((o) => {
      if (o.userData.flutter !== undefined) this.strips.push(o);
    });

    this.altar = makeAltar();
    this.altar.group.position.set(altar.x, 0, altar.z);
    this.scene.add(this.altar.group);
    this.colliders.push(makeBox(altar.x, altar.z, 2.4, 1.4));

    for (let i = 0; i < 3; i++) {
      const wisp = makeWisp(i < 2);
      wisp.userData = { phase: (i / 3) * Math.PI * 2, radius: 2.4 + i * 0.5, height: 1.6 + i * 0.5 };
      wisp.traverse((o) => (o.userData.noShadow = true));
      this.scene.add(wisp);
      this.wisps.push(wisp);
    }

    this.dokkaebi = makeDokkaebiModel();
    this.dokBase = new Vector3(altar.x, 0, altar.z - 2.2);
    this.dokkaebi.root.position.copy(this.dokBase);
    this.dokkaebi.root.visible = false;
    this.scene.add(this.dokkaebi.root);
  }

  #buildTrees(rand) {
    for (const t of this.level.trees) {
      const tree = makeTree(t.kind, rand);
      tree.position.set(t.x, 0, t.z);
      this.scene.add(tree);
      this.swayers.push(tree);
      this.colliders.push(makeBox(t.x, t.z, 0.8, 0.8));
    }
  }

  #buildGrass(rand) {
    const paths = this.level.paths;
    const near = this.level.interactables;
    const isFree = (x, z) =>
      !this.colliders.some((b) => x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3) &&
      !paths.some(([px, pz, w, d]) => Math.abs(x - px) < w / 2 + 0.2 && Math.abs(z - pz) < d / 2 + 0.2) &&
      !near.some((i) => Math.hypot(i.x - x, i.z - z) < 1.3);
    const grass = makeGrassField(1400, this.level.bounds, rand, isFree);
    grass.traverse((o) => (o.userData.noShadow = true));
    this.scene.add(grass);
  }

  #buildInteractables() {
    const targets = {
      stele: this.jangseung,
      kitchen: [this.houseGroups.get('kitchen')],
      'house-nw': [this.houseGroups.get('house-nw')],
      'house-se': [this.houseGroups.get('house-se')],
      well: [this.well],
      storehouse: [this.storehouse.group],
      altar: [this.altar.group, this.shrineTree],
    };
    for (const [season, lantern] of this.lanterns) targets[`lantern-${season}`] = [lantern.group];

    for (const def of this.level.interactables) {
      const objects = targets[def.id] ?? [];
      for (const obj of objects) {
        obj.userData.interactId = def.id;
        this.pickables.push(obj);
      }
      // 互動時角色要面向的點：相關物件的中心（祭壇只看祭壇本身）
      const faceObjs = def.id === 'altar' ? [this.altar.group] : objects;
      if (faceObjs.length) {
        const c = new Vector3();
        for (const o of faceObjs) c.add(o.position);
        this.facePoints.set(def.id, c.divideScalar(faceObjs.length));
      }
      this.interactables.push({ ...def, position: new Vector3(def.x, 0, def.z) });
    }
  }

  #setupShadows() {
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = !o.userData.noShadow && !o.isInstancedMesh;
      o.receiveShadow = true;
    });
  }

  interactable(id) {
    return this.interactables.find((i) => i.id === id);
  }

  facePoint(id) {
    return this.facePoints.get(id) ?? null;
  }

  // ---------- 場景效果 ----------

  /** 在 pos 噴出一組預設粒子特效 */
  burst(name, pos, overrides = {}) {
    const preset = BURSTS[name];
    if (preset) this.particles.emit({ ...preset, ...overrides, x: pos.x, y: pos.y, z: pos.z });
  }

  /** 每秒約 rate 次呼叫 fn（環境粒子用） */
  #emitRate(key, rate, dt, fn) {
    this.emitAcc[key] = (this.emitAcc[key] ?? Math.random()) + rate * dt;
    while (this.emitAcc[key] >= 1) {
      this.emitAcc[key] -= 1;
      fn();
    }
  }

  /** 把引導光點移到 pos 上方；傳 null 隱藏。 */
  setMarker(pos) {
    this.marker.visible = Boolean(pos);
    if (pos) this.markerBase.set(pos.x, pos.y, pos.z);
  }

  litSeasons() {
    return [...this.lanterns].filter(([, lantern]) => lantern.lit).map(([season]) => season);
  }

  lanternPosition(season) {
    const p = this.lanterns.get(season).group.position;
    return new Vector3(p.x, 1.7, p.z);
  }

  syncLanterns(litSeasons) {
    for (const [season, lantern] of this.lanterns) {
      const on = litSeasons.includes(season);
      if (on && !lantern.lit) this.burst('lanternOn', this.lanternPosition(season));
      if (!on && lantern.lit) this.burst('smoke', this.lanternPosition(season));
      lantern.setLit(on);
    }
  }

  openStorehouse() {
    const { door, lock, side, group } = this.storehouse;
    lock.visible = false;
    const doorWorld = group.position.clone().add(new Vector3(door.position.x, 0.6, 0));
    this.burst('door', doorWorld);
    return this.tweens.add(0.8, (k) => {
      door.rotation.y = side * k * 1.9;
    });
  }

  showOfferings() {
    this.altar.offerings.visible = true;
    this.burst('correct', new Vector3(this.level.altar.x, 1.2, this.level.altar.z));
  }

  get dokkaebiHead() {
    return this.dokkaebi.head.getWorldPosition(new Vector3());
  }

  async spawnDokkaebi() {
    const { root } = this.dokkaebi;
    root.visible = true;
    root.scale.setScalar(0.001);
    // 鬼火先收攏、越轉越快，再「砰」地變出도깨비
    await this.tweens.add(1.0, (k) => {
      for (const w of this.wisps) w.userData.radius = (w.userData.baseRadius ??= w.userData.radius) * (1 - 0.8 * k);
      this.wispSpeed = 0.6 + k * 4;
    });
    const center = this.dokBase.clone().setY(1.6);
    this.burst('dokkaebi', center);
    this.burst('smoke', center, { count: 40, spread: 1.0, size: 0.7, color: 0x4a5a80 });
    this.wispSpeed = 0.6;
    await this.tweens.add(0.7, (k) => root.scale.setScalar(Math.max(0.001, k)), ease.outBack);
    for (const w of this.wisps) w.userData.radius = w.userData.baseRadius * 1.3;
  }

  /** 도깨비的反應動作：laugh（大笑）、surprised（吃驚）、cheer（揮棒歡呼） */
  dokkaebiReact(kind) {
    const duration = { laugh: 1.4, surprised: 0.9, cheer: 1.6 }[kind] ?? 1;
    this.dokAction = { kind, t: 0, duration };
    const head = this.dokkaebiHead;
    if (kind === 'laugh') this.burst('wrong', head);
    if (kind === 'surprised') this.burst('correct', head);
    if (kind === 'cheer') this.burst('correct', head, { count: 50, color: 0x7cc4ff });
  }

  async returnMoon() {
    this.moon.visible = true;
    await this.tweens.add(4.0, (k) => {
      this.moon.position.lerpVectors(MOON_FROM, MOON_TO, k);
      this.moonlight.intensity = 2.4 * k;
      this.ambient.intensity = 2.0 + 1.3 * k;
      this.scene.fog.density = 0.016 - 0.008 * k;
      this.stars.brightness = 1 - 0.4 * k;
      if (Math.random() < 0.5) this.burst('moon', new Vector3(0, 1, -12));
    });
  }

  async hideDokkaebi() {
    const { root } = this.dokkaebi;
    await this.tweens.add(0.7, (k) => {
      root.scale.setScalar(Math.max(0.001, 1 - k));
      root.rotation.y = k * Math.PI * 4;
    });
    this.burst('smoke', this.dokBase.clone().setY(1.2), { count: 30, spread: 0.8, size: 0.6, color: 0x4a5a80 });
    this.burst('dokkaebi', this.dokBase.clone().setY(1.2), { count: 40 });
    root.visible = false;
  }

  // ---------- 每幀更新 ----------

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.tweens.update(dt);

    // 石燈：火光閃爍，點亮的石燈冒出火星
    let i = 0;
    for (const [season, lantern] of this.lanterns) {
      lantern.flicker(t, i++ * 1.7);
      if (lantern.lit) {
        this.#emitRate(`ember-${season}`, 5, dt, () =>
          this.burst('spark', this.lanternPosition(season).setY(2.0), { speed: 0.3, up: 0.9, size: 0.09, life: 1.4 }),
        );
      }
    }

    // 廚房炊煙
    this.#emitRate('chimney', 3, dt, () =>
      this.particles.emit({ x: this.chimneyTop.x, y: this.chimneyTop.y, z: this.chimneyTop.z, count: 1, spread: 0.15, speed: 0.35, up: 0.9, color: 0x5a5f6c, life: 3.8, gravity: -0.05, drag: 0.4, size: 0.5 }),
    );

    // 老樹飄落的葉子
    const { shrine, altar } = this.level;
    this.#emitRate('leaves', 1.2, dt, () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 3;
      this.particles.emit({ x: shrine.x + Math.cos(a) * r, y: 5 + Math.random() * 2, z: shrine.z + Math.sin(a) * r, count: 1, spread: 0, speed: 0.5, up: 0, color: Math.random() < 0.7 ? 0x4b8a4a : 0xd9873a, life: 6, gravity: 0.35, drag: 0.8, size: 0.14, jitter: 0.25 });
    });

    // 鬼火繞著老樹轉，拖出藍色殘影
    const speed = this.wispSpeed ?? 0.6;
    this.wispAngle = (this.wispAngle ?? 0) + dt * speed;
    for (const w of this.wisps) {
      const { phase, radius, height } = w.userData;
      const a = this.wispAngle + phase;
      w.position.set(altar.x + Math.cos(a) * radius, height + Math.sin(t * 2 + phase) * 0.3, altar.z - 2 + Math.sin(a) * radius * 0.7);
      this.#emitRate(`wisp-${phase}`, 8, dt, () =>
        this.particles.emit({ x: w.position.x, y: w.position.y, z: w.position.z, count: 1, spread: 0.08, speed: 0.15, up: 0.2, color: 0x4f9cff, life: 0.9, gravity: -0.1, drag: 1, size: 0.16 }),
      );
    }

    // 樹木隨風搖擺、布條飄動
    const wind = Math.sin(t * 0.7) * 0.5 + 0.5;
    for (const tree of this.swayers) {
      const { phase, amp } = tree.userData.sway;
      tree.rotation.x = Math.sin(t * 1.3 + phase) * amp * (0.6 + wind);
      tree.rotation.z = Math.sin(t * 1.1 + phase * 1.7) * amp * (0.6 + wind);
    }
    for (const strip of this.strips) {
      strip.rotation.x = Math.sin(t * 3.1 + strip.userData.flutter) * (0.15 + wind * 0.25);
      strip.rotation.z = Math.sin(t * 2.3 + strip.userData.flutter * 1.3) * 0.1;
    }

    if (this.marker.visible) {
      this.marker.position.copy(this.markerBase);
      this.marker.position.y += Math.sin(t * 3) * 0.3;
      this.marker.rotation.y = t * 2;
      this.#emitRate('marker', 6, dt, () =>
        this.particles.emit({ x: this.marker.position.x, y: this.marker.position.y, z: this.marker.position.z, count: 1, spread: 0.3, speed: 0.2, up: 0.6, color: 0xffd36e, life: 1, drag: 1, size: 0.1 }),
      );
    }

    this.#animateDokkaebi(dt, t);
    this.particles.update(dt);
    this.fireflies.update(t);
    this.stars.update(t);
  }

  #animateDokkaebi(dt, t) {
    const d = this.dokkaebi;
    if (!d.root.visible) return;
    // 待機：左右搖擺、上下跳、狼牙棒晃動
    let y = Math.abs(Math.sin(t * 3)) * 0.12;
    let z = 0;
    let headX = 0;
    let headZ = Math.sin(t * 2.2) * 0.12;
    let bodyZ = Math.sin(t * 1.5) * 0.06;
    let clubZ = -0.5;
    let clubX = Math.sin(t * 3) * 0.2;
    let scale = 1;

    const a = this.dokAction;
    if (a) {
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      const bell = Math.sin(Math.PI * k);
      if (a.kind === 'laugh') {
        y = Math.abs(Math.sin(k * Math.PI * 7)) * 0.4 * bell;
        headX = -0.35 * bell + Math.sin(k * Math.PI * 14) * 0.12;
        bodyZ = Math.sin(k * Math.PI * 7) * 0.12;
        clubX = Math.sin(k * Math.PI * 7) * 0.5;
      } else if (a.kind === 'surprised') {
        z = -0.6 * bell;
        headX = 0.3 * bell;
        scale = 1 + 0.12 * bell;
      } else if (a.kind === 'cheer') {
        y = bell * 0.8;
        clubZ = -0.5 - bell * 2.4;
        clubX = Math.sin(k * Math.PI * 4) * 0.6;
        headX = -0.3 * bell;
      }
      if (k >= 1) this.dokAction = null;
    }

    d.root.position.set(this.dokBase.x, y, this.dokBase.z + z);
    d.root.rotation.z = bodyZ;
    d.head.rotation.set(headX, 0, headZ);
    d.club.rotation.set(clubX, 0, clubZ);
    if (scale !== 1) d.root.scale.setScalar(scale);
  }

  dispose() {
    this.scene.traverse((obj) => {
      obj.geometry?.dispose();
    });
  }
}
