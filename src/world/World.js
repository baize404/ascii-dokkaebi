import { preserveMaskBlending, tagObject } from '../render/objectId.js';
import { Wind } from './Wind.js';
import { makeCarvedLantern, makeKitchen, makeWellRig } from './buildings.js';
import { DOOR, DoorController } from './DoorController.js';
import {
  AdditiveBlending,
  Vector2,
  AmbientLight,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  IcosahedronGeometry,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { heightAt } from '../data/level.js';
import { ease, Tweens } from '../core/Tweens.js';
import { makeCatModel, makeDokkaebiModel, makeGrandmaModel } from './characters.js';
import { buildColliders, moundWallStones } from './layout.js';
import { mats } from './materials.js';
import { Fireflies, ParticleSystem, Stars } from './Particles.js';
import {
  box,
  makeAltar,
  makeChimney,
  makeFallenLeaves,
  makeFootprint,
  makeGrassField,
  makeHanok,
  makeJangseung,
  makeJars,
  makeOnggi,
  makePond,
  makeRopeGate,
  makeShrineTree,
  makeSteppingStones,
  makeSteps,
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

/** 四君子刻紋的代表色（石燈色牌與點燈特效） */
export const CARVING_COLORS = { plum: 0xf2a0b8, orchid: 0xb8a0e8, chrysanthemum: 0xf2bd68, bamboo: 0x7fcf8a };

/** 畫質等級 */
export const QUALITY = {
  low: { shadows: 0, grass: 0.35, particles: 0.4, fireflies: 30 },
  medium: { shadows: 1024, grass: 0.7, particles: 0.7, fireflies: 50 },
  high: { shadows: 2048, grass: 1, particles: 1, fireflies: 70 },
};

/** 粒子特效預設參數（見 ParticleSystem.emit） */
const BURSTS = {
  dust: { count: 3, spread: 0.08, speed: 0.7, up: 0.35, color: 0x8b8577, life: 0.5, gravity: 0.6, drag: 3, size: 0.2 },
  spark: { count: 1, spread: 0.05, speed: 0.25, up: 0.7, color: 0xffa040, life: 0.8, gravity: -0.2, drag: 1, size: 0.07 },
  item: { count: 28, spread: 0.2, speed: 1.6, up: 2.4, color: 0xf2bd68, life: 0.9, gravity: 3.5, drag: 1.2, size: 0.13 },
  lanternOn: { count: 34, spread: 0.15, speed: 2.2, up: 2.6, color: 0xf2bd68, life: 0.9, gravity: 4, drag: 1, size: 0.12 },
  smoke: { count: 18, spread: 0.3, speed: 0.8, up: 1.0, color: 0x707686, life: 1.5, gravity: -0.4, drag: 1.5, size: 0.45 },
  door: { count: 16, spread: 0.4, speed: 0.9, up: 0.5, color: 0x8a8070, life: 1.2, gravity: 0.2, drag: 2, size: 0.35 },
  dokkaebi: { count: 90, spread: 0.6, speed: 4, up: 3.2, color: 0x67c5dc, life: 1.4, gravity: 2.2, drag: 1.2, size: 0.2 },
  wrong: { count: 18, spread: 0.3, speed: 1.6, up: 1.8, color: 0xd65f4c, life: 0.8, gravity: 3, drag: 1, size: 0.14 },
  correct: { count: 26, spread: 0.3, speed: 2, up: 2.6, color: 0xf2bd68, life: 1, gravity: 3, drag: 1, size: 0.14 },
  moon: { count: 4, spread: 3.5, speed: 0.4, up: 1.6, color: 0xe2e8ef, life: 3, gravity: -0.3, drag: 0.4, size: 0.16 },
  sleep: { count: 1, spread: 0.05, speed: 0.1, up: 0.5, color: 0xe2e8ef, life: 1.6, gravity: -0.1, drag: 0.5, size: 0.1 },
  tap: { count: 10, spread: 0.1, speed: 1.2, up: 0.3, color: 0xf2bd68, life: 0.5, gravity: 0.5, drag: 3, size: 0.12 },
  blocked: { count: 10, spread: 0.1, speed: 1.2, up: 0.3, color: 0xd65f4c, life: 0.5, gravity: 0.5, drag: 3, size: 0.12 },
  splash: { count: 24, spread: 0.25, speed: 1.4, up: 1.6, color: 0x9ccfe8, life: 0.7, gravity: 5, drag: 1, size: 0.08 },
  drip: { count: 1, spread: 0.15, speed: 0.05, up: -0.2, color: 0x9ccfe8, life: 0.6, gravity: 6, drag: 0.2, size: 0.05 },
};

/** 四季點燈特效 */
const SEASON_BURSTS = {
  plum: { count: 40, spread: 0.4, speed: 1.2, up: 1.6, color: 0xf2a0b8, life: 3, gravity: 0.4, drag: 1.2, size: 0.13 },
  orchid: { count: 30, spread: 0.6, speed: 0.8, up: 1.2, color: 0xc8ff8a, life: 2.5, gravity: -0.3, drag: 1, size: 0.12 },
  chrysanthemum: { count: 40, spread: 0.4, speed: 1.5, up: 2.0, color: 0xd9873a, life: 3, gravity: 0.5, drag: 1, size: 0.15 },
  bamboo: { count: 50, spread: 1.6, speed: 0.3, up: 0.2, color: 0xe2e8ef, life: 3.5, gravity: 0.35, drag: 0.8, size: 0.11 },
};

/** 地形：依 heightAt 起伏、帶頂點顏色斑塊的平面 */
function makeTerrain(width, depth, cx, cz, segments, baseHex, amount, rand, yOffset = 0) {
  const geom = new PlaneGeometry(width, depth, segments[0], segments[1]);
  geom.rotateX(-Math.PI / 2);
  geom.translate(cx, 0, cz);
  const pos = geom.attributes.position;
  const base = new Color(baseHex);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z) + yOffset);
    const n = Math.sin(x * 0.35 + 1.3) * Math.cos(z * 0.29 - 0.7) * 0.5 + Math.sin(x * 0.9 + z * 0.7) * 0.3 + (rand() - 0.5) * 0.5;
    const k = 1 + n * amount;
    colors[i * 3] = base.r * k;
    colors[i * 3 + 1] = base.g * k;
    colors[i * 3 + 2] = base.b * k;
  }
  geom.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  const mesh = new Mesh(geom, new MeshLambertMaterial({ vertexColors: true }));
  mesh.userData.isGround = true;
  mesh.userData.noShadow = true;
  return mesh;
}

/**
 * 依關卡資料蓋出 3D 村落，提供場景效果（點燈、開門、粒子、角色動作、月亮升起）。
 * 不包含遊戲規則；遊戲狀態由 session 透過下面的方法同步進來。
 */
export class World {
  /**
   * @param level 關卡資料
   * @param lanternLayout 四個石燈位置各自的刻紋 id
   */
  constructor(level, lanternLayout) {
    this.level = level;
    this.lanternLayout = lanternLayout;
    this.scene = new Scene();
    this.tweens = new Tweens();
    this.interactables = [];
    this.wind = new Wind();
    this.pickables = [];
    this.facePoints = new Map();
    this.lanterns = [];
    this.wisps = [];
    this.swayers = [];
    this.strips = [];
    this.emitAcc = {};
    this.time = 0;
    this.quality = QUALITY.high;
    this.reduceMotion = false;
    this.ropeOpen = false;
    this.colliderOpts = { ropeOpen: false, kitchenDoorOpen: false };
    this.colliders = buildColliders(level, this.colliderOpts);
    this.onCollidersChanged = null;
    this.occluders = [];
    this.heightAt = heightAt;

    const rand = seededRandom(20261126);
    this.#buildEnvironment(rand);
    this.#buildGround(rand);
    this.#buildWalls();
    this.#buildVillage(rand);
    this.#buildShrine(rand);
    this.#buildCharacters();
    this.#buildTrees(rand);
    this.#buildDetails(rand);
    this.#buildInteractables();
    this.#tagForAscii();
    this.#setupShadows();
  }

  get bounds() {
    return this.level.bounds;
  }

  get pointMaterials() {
    return [this.particles.material, this.fireflies.material, this.stars.material];
  }

  /** 物件放在地面上（依地形高度） */
  #place(obj, x, z, yOffset = 0) {
    obj.position.set(x, heightAt(x, z) + yOffset, z);
    this.scene.add(obj);
    return obj;
  }

  // ---------- 建構 ----------

  #buildEnvironment(rand) {
    this.scene.background = new Color(0x080d16);
    this.scene.fog = new FogExp2(0x080d16, 0.017);
    this.ambient = new AmbientLight(0x5a6a9a, 2.0);
    this.hemi = new HemisphereLight(0x8095d0, 0x2a2a1e, 1.8);

    // 星光：唯一投射陰影的光
    this.starlight = new DirectionalLight(0x9fb0e0, 2.4);
    this.starlight.position.set(-18, 36, -10);
    this.starlight.castShadow = true;
    const cam = this.starlight.shadow.camera;
    Object.assign(cam, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 100 });
    this.starlight.shadow.mapSize.set(2048, 2048);
    this.starlight.shadow.bias = -0.0005;
    this.starlight.shadow.normalBias = 0.04;

    this.moonlight = new DirectionalLight(0xe2e8ef, 0);
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

    // 新手引導用的光點（只在開場指向장승）
    this.marker = new Group();
    this.marker.add(new Mesh(new OctahedronGeometry(0.45, 0), new MeshBasicMaterial({ color: 0xf2bd68 })));
    this.marker.visible = false;
    this.markerBase = new Vector3();
    this.scene.add(this.marker);

    // 互動對象的地面光圈
    this.highlight = new Mesh(new TorusGeometry(1, 0.05, 6, 40), new MeshBasicMaterial({ color: 0xf2bd68, transparent: true, opacity: 0.8 }));
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // 點擊目的地的光圈
    this.tapRing = new Mesh(new TorusGeometry(0.35, 0.04, 6, 24), new MeshBasicMaterial({ color: 0xf2bd68, transparent: true, opacity: 0 }));
    this.tapRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.tapRing);

    this.particles = new ParticleSystem(1400);
    this.fireflies = new Fireflies(this.level.bounds, 70, rand);
    this.stars = new Stars(280, rand);
    this.scene.add(this.particles.points, this.fireflies.points, this.stars.points);
    for (const obj of [this.moon, halo, this.marker.children[0], this.highlight, this.tapRing]) obj.userData.noShadow = true;
  }

  #buildGround(rand) {
    const ground = makeTerrain(90, 90, 0, 0, [120, 120], 0x2e4034, 0.4, rand);
    this.scene.add(ground);
    this.pickables.push(ground);
    for (const [x, z, w, d] of this.level.paths) {
      const path = makeTerrain(w, d, x, z, [Math.ceil(w * 2), Math.ceil(d * 2)], 0x6a6252, 0.3, rand, 0.02);
      this.scene.add(path);
      this.pickables.push(path);
    }
    // 主參道的踏腳石
    const stones = [];
    for (let z = 23; z > -12.8; z -= 1.15) {
      const x = (Math.round(z / 1.15) % 2 ? 0.45 : -0.45) + (rand() - 0.5) * 0.2;
      stones.push([x, heightAt(x, z) + 0.02, z]);
    }
    this.scene.add(makeSteppingStones(stones, rand));
  }

  #buildWalls() {
    const { minX, maxX, minZ, maxZ } = this.level.bounds;
    const west = minX - 0.6;
    const east = maxX + 0.6;
    const north = minZ - 0.6;
    const south = maxZ + 0.6;
    const segments = [
      [makeWallSegment(east - west + 0.8, 'x'), 0, north],
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
    for (const sx of [-1, 1]) this.#place(box(0.5, 2.6, 0.5, mats.darkWood), sx * 3.2, south, 1.3);
  }

  #buildVillage(rand) {
    const L = this.level;
    this.houseGroups = new Map();
    this.windowMeshes = [];
    for (const h of L.houses) {
      let g;
      if (h.walkIn) {
        // 廚房：真的牆、門洞、雙開門與室內
        this.kitchen = makeKitchen(h);
        this.kitchen.def = h;
        g = this.kitchen.group;
        this.kitchenDoor = new DoorController({
          id: 'kitchen',
          openSeconds: 0.9,
          onAngle: (k) => {
            for (const d of this.kitchen.doors) d.hinge.rotation.y = d.sign * 1.75 * k;
            this.kitchen.interiorLight.intensity = 0.5 + 2.4 * k;
          },
          onStateChange: (st) => this.#setKitchenPassable(st === DOOR.OPEN),
          isBlocked: () => this.#inKitchenDoorway(),
        });
      } else g = makeHanok(h);
      this.#place(g, h.x, h.z);
      this.houseGroups.set(h.id, g);
      g.traverse((o) => {
        if (o.isMesh && (o.material === mats.paperGlow || o.material === mats.paperDim)) this.windowMeshes.push(o);
      });
    }

    const kitchen = L.houses.find((h) => h.id === 'kitchen');
    this.chimneyTop = new Vector3(kitchen.x - kitchen.w / 2 - 1.0, 0, kitchen.z - 1.2);
    this.#place(makeChimney(), this.chimneyTop.x, this.chimneyTop.z);
    this.chimneyTop.y = heightAt(this.chimneyTop.x, this.chimneyTop.z) + 2.7;

    const s = L.storehouse;
    this.storehouse = makeStorehouse(s);
    this.#place(this.storehouse.group, s.x, s.z);

    // 水井：轆轤的曲柄朝向玩家站的位置
    this.wellRig = makeWellRig();
    this.well = this.wellRig.group;
    this.#place(this.well, L.well.x, L.well.z);
    const stand = L.interactables.find((i) => i.id === 'well');
    this.well.rotation.y = -Math.atan2(stand.z - L.well.z, stand.x - L.well.x);
    this.wellBucket = this.wellRig.bucket;
    this.crankAngle = 0;

    this.jangseung = L.jangseung.map((j) => this.#place(makeJangseung(j), j.x, j.z));

    L.lanternSpots.forEach((spot, i) => {
      const carving = this.lanternLayout[i];
      const lantern = makeCarvedLantern(carving, CARVING_COLORS[carving]);
      this.#place(lantern.group, spot.x, spot.z);
      // 刻紋（前後兩面）朝向參道，玩家站在路上調查時正好看到
      lantern.group.rotation.y = spot.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      lantern.carving = carving;
      this.lanterns.push(lantern);
    });

    this.jars = makeJars(rand);
    this.#place(this.jars, L.jars.x, L.jars.z);

    this.pond = makePond(L.pond.r, rand);
    this.#place(this.pond, L.pond.x, L.pond.z);

    // 도깨비的腳印：左右交錯，沿著行進方向
    this.footprints = new Group();
    L.footprints.forEach(([x, z], i) => {
      const next = L.footprints[Math.min(i + 1, L.footprints.length - 1)];
      const prev = L.footprints[Math.max(i - 1, 0)];
      const dir = Math.atan2(next[0] - prev[0], next[1] - prev[1]);
      const side = i % 2 ? 0.16 : -0.16;
      const fp = makeFootprint();
      fp.position.set(x + Math.cos(dir) * side, heightAt(x, z) + 0.04, z - Math.sin(dir) * side);
      fp.rotation.z = -dir;
      this.footprints.add(fp);
    });
    this.scene.add(this.footprints);
  }

  #buildShrine(rand) {
    const { shrineTree, altar, rope, mound } = this.level;
    this.shrineTree = makeShrineTree(rand);
    this.#place(this.shrineTree, shrineTree.x, shrineTree.z);
    this.shrineTree.traverse((o) => {
      if (o.userData.flutter !== undefined) this.strips.push(o);
    });

    // 山丘外圍的石牆（和碰撞一致）
    const stones = moundWallStones(this.level);
    const wall = new InstancedMesh(new IcosahedronGeometry(0.55, 0), mats.darkStone, stones.length);
    const m4 = new Matrix4();
    stones.forEach(({ x, z, a }, i) => {
      m4.compose(new Vector3(x, heightAt(x, z) + 0.35, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a * 3.1), new Vector3(1, 0.85, 1));
      wall.setMatrixAt(i, m4);
    });
    this.scene.add(wall);

    // 入口石階
    const steps = makeSteps(4, 3.2, 0.22, 0.45);
    steps.position.set(mound.x, heightAt(mound.x, rope.z + 0.2) - 0.05, rope.z - 0.3);
    this.scene.add(steps);

    this.ropeGate = makeRopeGate(rope.w);
    this.#place(this.ropeGate, rope.x, rope.z);

    this.altar = makeAltar();
    this.#place(this.altar.group, altar.x, altar.z);
    this.altarTop = new Vector3(altar.x, heightAt(altar.x, altar.z) + 0.8, altar.z);

    for (let i = 0; i < 3; i++) {
      const wisp = makeWisp(i < 2);
      wisp.userData = { phase: (i / 3) * Math.PI * 2, radius: 2.4 + i * 0.5, height: 1.6 + i * 0.5 };
      wisp.traverse((o) => (o.userData.noShadow = true));
      this.scene.add(wisp);
      this.wisps.push(wisp);
    }

    // 甕遊戲：三個甕與一團月光
    this.shellJars = [-0.7, 0, 0.7].map((dx) => {
      const jar = makeOnggi(0.75);
      jar.position.set(altar.x + dx, this.altarTop.y, altar.z);
      jar.visible = false;
      this.scene.add(jar);
      return jar;
    });
    this.moonOrb = new Mesh(new SphereGeometry(0.16, 12, 10), new MeshBasicMaterial({ color: 0xfff1c4 }));
    this.moonOrb.visible = false;
    this.moonOrb.userData.noShadow = true;
    this.scene.add(this.moonOrb);
  }

  #buildCharacters() {
    const { dokkaebi, grandma, catSpots } = this.level;
    this.dokkaebi = makeDokkaebiModel();
    this.dokBase = new Vector3(dokkaebi.x, heightAt(dokkaebi.x, dokkaebi.z), dokkaebi.z);
    this.dokkaebi.root.position.copy(this.dokBase);
    this.dokkaebi.root.visible = false;
    this.scene.add(this.dokkaebi.root);

    this.grandma = makeGrandmaModel();
    this.grandma.root.rotation.y = Math.PI / 2; // 面向東邊的小路
    // 坐在마루邊緣：腳底在地面上、臀部在마루上、小腿從邊緣垂下
    this.grandmaSeat = new Vector3(grandma.x - 0.05, heightAt(grandma.x, grandma.z) + 0.26, grandma.z);
    this.grandmaStand = new Vector3(grandma.x + 0.55, heightAt(grandma.x + 0.55, grandma.z), grandma.z);
    this.grandma.root.position.copy(this.grandmaSeat);
    this.scene.add(this.grandma.root);
    this.grandmaAwake = false;

    this.cat = makeCatModel();
    this.catStage = 0;
    // 黑貓第一個地點坐在一塊石頭上
    const rock = new Mesh(new IcosahedronGeometry(0.45, 0), mats.stone);
    rock.scale.y = 0.6;
    this.#place(rock, catSpots[0].x, catSpots[0].z, 0.25);
    this.scene.add(this.cat.root);
    this.#placeCat(0);
  }

  #placeCat(stage) {
    const spots = this.level.catSpots;
    if (stage >= spots.length) {
      // 給了帽子之後，貓去할머니身邊
      const g = this.level.grandma;
      this.cat.root.position.set(g.x + 0.7, heightAt(g.x, g.z) + 0.62, g.z + 0.6);
      this.cat.hat.visible = false;
      this.cat.root.rotation.y = Math.PI / 2;
      return;
    }
    const s = spots[stage];
    this.cat.root.position.set(s.x, heightAt(s.x, s.z) + s.y, s.z);
    this.cat.root.rotation.y = stage === 2 ? Math.PI : 0.6;
    this.cat.hat.visible = true;
  }

  #buildTrees(rand) {
    for (const t of this.level.trees) {
      const tree = makeTree(t.kind, rand);
      this.#place(tree, t.x, t.z);
      this.swayers.push(tree);
    }
  }

  #buildDetails(rand) {
    const paths = this.level.paths;
    const near = this.level.interactables;
    const isFree = (x, z) =>
      !this.colliders.some((b) => x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3) &&
      !paths.some(([px, pz, w, d]) => Math.abs(x - px) < w / 2 + 0.2 && Math.abs(z - pz) < d / 2 + 0.2) &&
      !near.some((i) => Math.hypot(i.x - x, i.z - z) < 1.3) &&
      Math.hypot(x - this.level.pond.x, z - this.level.pond.z) > this.level.pond.r + 0.4;
    this.grass = makeGrassField(1400, this.level.bounds, rand, isFree);
    this.#windGrass();
    // 草叢跟著地形高度
    for (const mesh of this.grass.children) {
      const m4 = new Matrix4();
      const p = new Vector3();
      const q = new Quaternion();
      const s = new Vector3();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m4);
        m4.decompose(p, q, s);
        p.y += heightAt(p.x, p.z);
        m4.compose(p, q, s);
        mesh.setMatrixAt(i, m4);
      }
      mesh.userData.fullCount = mesh.count;
      mesh.userData.noShadow = true;
    }
    this.scene.add(this.grass);

    // 樹下與山丘上的落葉
    const spots = [];
    for (const t of [...this.level.trees, this.level.shrineTree]) {
      for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2;
        const r = 0.6 + rand() * 2.4;
        spots.push([t.x + Math.cos(a) * r, t.z + Math.sin(a) * r]);
      }
    }
    this.scene.add(makeFallenLeaves(spots, rand, heightAt));
  }

  #buildInteractables() {
    const targets = {
      stele: this.jangseung,
      pond: [this.pond],
      kitchen: [this.houseGroups.get('kitchen')],
      jars: [this.jars],
      well: [this.well],
      storehouse: [this.storehouse.group],
      footprints: [this.footprints],
      grandma: [this.grandma.root],
      screen: [this.houseGroups.get('grandma-house')],
      'house-se': [this.houseGroups.get('house-se')],
      rope: [this.ropeGate],
      altar: [this.altar.group, this.shrineTree],
      cat: [this.cat.root],
    };
    this.lanterns.forEach((l, i) => (targets[`lantern-${i}`] = [l.group]));
    for (const def of this.level.interactables) {
      const objects = targets[def.id] ?? [];
      for (const obj of objects) {
        obj.userData.interactId = def.id;
        this.pickables.push(obj);
      }
      this.interactables.push({ ...def, position: new Vector3(def.x, 0, def.z) });
    }
    this.#updateFacePoints();
  }

  /** 草葉隨風彎曲、玩家走過時往兩旁倒（在頂點著色器裡做，草再多也不耗 CPU） */
  #windGrass() {
    const uniforms = {
      uTime: { value: 0 },
      uWindDir: { value: new Vector2(1, 0) },
      uGust: { value: 1 },
      uPlayer: { value: new Vector3(0, -99, 0) },
      uMotion: { value: 1 },
    };
    this.grassUniforms = uniforms;
    for (const mesh of this.grass.children) {
      mesh.material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWindDir; uniform float uGust; uniform vec3 uPlayer; uniform float uMotion;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            #ifdef USE_INSTANCING
              vec4 grassRoot = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
              mat3 grassRot = mat3(instanceMatrix);
            #else
              vec4 grassRoot = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
              mat3 grassRot = mat3(1.0);
            #endif
            float grassH = clamp(position.y / 0.5, 0.0, 1.0);
            float grassPhase = grassRoot.x * 0.37 + grassRoot.z * 0.29;
            float grassSway = (uGust * (0.55 + 0.45 * sin(uTime * 1.7 + grassPhase)) + 0.22 * sin(uTime * 3.4 + grassPhase * 2.3)) * uMotion;
            vec2 grassBend = uWindDir * grassSway * 0.2;
            vec2 grassAway = grassRoot.xz - uPlayer.xz;
            float grassDist = length(grassAway);
            if (grassDist < 1.1 && grassDist > 0.001) grassBend += normalize(grassAway) * (1.1 - grassDist) * 0.4;
            transformed += inverse(grassRot) * vec3(grassBend.x, -0.15 * length(grassBend), grassBend.y) * grassH * grassH;`,
          );
      };
      mesh.material.needsUpdate = true;
    }
  }

  /** 物件遮罩：角色與互動物件在 ASCII 中優先保留輪廓與細節 */
  #tagForAscii() {
    for (const c of [this.dokkaebi, this.grandma, this.cat]) tagObject(c.root, 'character');
    for (const o of [...this.jangseung, this.jars, this.well, this.altar.group, this.ropeGate, ...this.shellJars, ...this.lanterns.map((l) => l.group)]) tagObject(o, 'interactable');
    preserveMaskBlending(this.scene);
  }

  #updateFacePoints() {
    const L = this.level;
    const set = (id, x, z) => this.facePoints.set(id, new Vector3(x, 0, z));
    set('stele', 0, 19.5);
    set('pond', L.pond.x, L.pond.z);
    set('kitchen', -7.5, 9.5);
    set('jars', L.jars.x, L.jars.z);
    set('well', L.well.x, L.well.z);
    set('storehouse', L.storehouse.x - 2.5, L.storehouse.z);
    set('footprints', 5.5, -3.4);
    set('grandma', L.grandma.x, L.grandma.z);
    set('screen', -9.2, 1);
    set('house-se', 9.5, 12);
    set('rope', L.rope.x, L.rope.z);
    set('altar', L.altar.x, L.altar.z);
    L.lanternSpots.forEach((s, i) => set(`lantern-${i}`, s.x, s.z));
    this.#updateCatInteractable();
  }

  #updateCatInteractable() {
    const it = this.interactables.find((i) => i.id === 'cat');
    const stage = Math.min(this.catStage, this.level.catStands.length - 1);
    const stand = this.level.catStands[stage];
    if (it) {
      it.x = stand.x;
      it.z = stand.z;
      it.position.set(stand.x, 0, stand.z);
      it.disabled = this.catStage >= 3;
    }
    this.facePoints.set('cat', this.cat.root.position.clone());
  }

  #setupShadows() {
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = !o.userData.noShadow && !o.isInstancedMesh;
      o.receiveShadow = true;
    });
  }

  // ---------- 查詢 ----------

  interactable(id) {
    return this.interactables.find((i) => i.id === id && !i.disabled);
  }

  activeInteractables() {
    return this.interactables.filter((i) => !i.disabled);
  }

  facePoint(id) {
    return this.facePoints.get(id) ?? null;
  }

  lanternPosition(spot) {
    const p = this.lanterns[spot].group.position;
    return new Vector3(p.x, p.y + 1.7, p.z);
  }

  get dokkaebiHead() {
    return this.dokkaebi.head.getWorldPosition(new Vector3());
  }

  // ---------- 設定 ----------

  /** @param shadows 'auto'（依畫質）| 'off' | 'low' | 'high'：陰影解析度與整體畫質分開設定 */
  setQuality(name, shadows = 'auto') {
    const q = QUALITY[name] ?? QUALITY.high;
    this.quality = q;
    const size = { off: 0, low: 1024, high: 2048 }[shadows] ?? q.shadows;
    const light = this.starlight;
    light.castShadow = size > 0;
    if (size && light.shadow.mapSize.x !== size) {
      light.shadow.mapSize.set(size, size);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
    for (const mesh of this.grass.children) mesh.count = Math.round(mesh.userData.fullCount * q.grass);
    this.fireflies.geometry.setDrawRange(0, q.fireflies);
  }

  setReduceMotion(on) {
    this.reduceMotion = on;
    this.wind.reduceMotion = on;
  }

  // ---------- 場景效果 ----------

  burst(name, pos, overrides = {}) {
    const preset = BURSTS[name] ?? SEASON_BURSTS[name];
    if (!preset) return;
    const count = Math.max(1, Math.round((overrides.count ?? preset.count) * this.quality.particles * (this.reduceMotion ? 0.5 : 1)));
    this.particles.emit({ ...preset, ...overrides, count, x: pos.x, y: pos.y, z: pos.z });
  }

  #emitRate(key, rate, dt, fn) {
    const r = rate * this.quality.particles;
    this.emitAcc[key] = (this.emitAcc[key] ?? Math.random()) + r * dt;
    while (this.emitAcc[key] >= 1) {
      this.emitAcc[key] -= 1;
      fn();
    }
  }

  setMarker(pos) {
    this.marker.visible = Boolean(pos);
    if (pos) this.markerBase.set(pos.x, pos.y + heightAt(pos.x, pos.z), pos.z);
  }

  /** 互動對象腳下的光圈 */
  setHighlight(id) {
    const p = id ? this.facePoint(id) : null;
    this.highlight.visible = Boolean(p);
    if (p) {
      const r = { altar: 1.6, stele: 2.6, kitchen: 1.2, storehouse: 1.3, screen: 1.0, jars: 1.8, well: 1.5, pond: 2.6 }[id] ?? 0.9;
      this.highlight.scale.setScalar(r);
      this.highlight.position.set(p.x, heightAt(p.x, p.z) + 0.06, p.z);
    }
  }

  /** 點擊地面時的回饋光圈；blocked 為 true 時顯示紅色 */
  showTap(point, blocked = false) {
    this.tapRing.position.set(point.x, heightAt(point.x, point.z) + 0.06, point.z);
    this.tapRing.material.color.setHex(blocked ? 0xd65f4c : 0xf2bd68);
    this.tapRing.material.opacity = 1;
    this.tapRing.scale.setScalar(1);
    this.burst(blocked ? 'blocked' : 'tap', this.tapRing.position);
  }

  syncLanterns(litSpots, { quiet = false } = {}) {
    this.lanterns.forEach((lantern, i) => {
      const on = litSpots.includes(i);
      if (on && !lantern.lit && !quiet) {
        this.burst('lanternOn', this.lanternPosition(i));
        this.burst(lantern.carving, this.lanternPosition(i).add(new Vector3(0, 0.5, 0)));
      }
      // 讀檔（quiet）時直接亮；遊戲中點燈時火焰慢慢形成
      if (on !== lantern.lit || quiet) lantern.setLit(on, quiet);
    });
  }

  /** 石燈火室的中心（世界座標）：點燈時手伸過去的位置 */
  lanternFirePoint(spot) {
    return this.lanterns[spot].group.localToWorld(new Vector3(0, 1.46, 0));
  }

  /**
   * 點燈的接觸瞬間（LightLantern 動畫的 ignite 事件）：火星從燈籠飛進火室；
   * 對的燈火焰慢慢長出來、石燈內部發亮、周圍光線逐漸變亮；錯的燈火苗閃一下被風吹熄。
   */
  igniteLantern(spot, correct, from = null) {
    const p = this.lanternFirePoint(spot);
    // 一串火星從手上的燈籠飛進火室
    if (from) {
      for (let i = 1; i <= 7; i++) {
        const q = from.clone().lerp(p, i / 8);
        q.y += Math.sin((i / 8) * Math.PI) * 0.18;
        this.particles.emit({ x: q.x, y: q.y, z: q.z, count: 2, spread: 0.03, speed: 0.15, up: 0.25, color: 0xffb050, life: 0.35 + i * 0.06, gravity: -0.15, drag: 1.2, size: 0.06 });
      }
    }
    this.burst('spark', p, { count: 14 });
    if (!correct) return this.sputterLantern(spot);
    const lantern = this.lanterns[spot];
    lantern.setLit(true, false);
    this.burst('lanternOn', p);
    this.burst(lantern.carving, p.clone().add(new Vector3(0, 0.4, 0)));
    return Promise.resolve();
  }

  /** 點錯的石燈：火光閃一下就被風吹熄 */
  sputterLantern(spot) {
    const lantern = this.lanterns[spot];
    this.burst('smoke', this.lanternPosition(spot));
    return this.tweens.add(0.6, (k) => lantern.sputter(k), (k) => k).then(() => lantern.sputter(1));
  }

  /** 금줄斷開；instant 時直接移除（讀檔用） */
  async setRopeOpen(open, instant = false) {
    if (this.ropeOpen === open) return;
    this.ropeOpen = open;
    this.colliderOpts.ropeOpen = open;
    this.colliders = buildColliders(this.level, this.colliderOpts);
    const rope = this.ropeGate.userData.rope;
    if (!open) {
      rope.visible = true;
      rope.position.set(0, 0, 0);
      rope.rotation.set(0, 0, 0);
      return;
    }
    if (instant) {
      rope.position.y = -0.85;
      rope.rotation.x = -1.4;
      return;
    }
    this.burst('correct', this.ropeGate.position.clone().add(new Vector3(0, 1.1, 0)), { count: 30 });
    await this.tweens.add(0.9, (k) => {
      rope.position.y = -0.85 * k;
      rope.rotation.x = -1.4 * k;
    }, ease.outBack);
  }

  /** 倉庫門：鎖住 → 用鑰匙開鎖 → 打開（DoorController） */
  async openStorehouse(instant = false) {
    const door = this.#storehouseDoor();
    if (instant) {
      door.restore(DOOR.OPEN);
      return;
    }
    const { group, door: hinge } = this.storehouse;
    await door.unlock();
    this.burst('door', group.position.clone().add(new Vector3(hinge.position.x, 0.6, 0)));
    await door.open();
  }

  #storehouseDoor() {
    if (!this.storehouseDoor) {
      const { door: hinge, lock, side } = this.storehouse;
      this.storehouseDoor = new DoorController({
        id: 'storehouse',
        locked: true,
        openSeconds: 0.8,
        onAngle: (k) => (hinge.rotation.y = side * 1.9 * k),
        onStateChange: (st) => {
          lock.visible = st === DOOR.LOCKED;
          if (st === DOOR.UNLOCKING) this.burst('spark', this.storehouse.group.position.clone().add(new Vector3(hinge.position.x, 1.5, -0.6)));
        },
      });
    }
    return this.storehouseDoor;
  }

  // ---------- 廚房的門 ----------

  /** 開／關廚房門（instant 用於讀檔） */
  setKitchenDoor(open, instant = false) {
    if (!this.kitchenDoor) return Promise.resolve();
    if (instant) {
      this.kitchenDoor.restore(open ? DOOR.OPEN : DOOR.CLOSED);
      return Promise.resolve();
    }
    return open ? this.kitchenDoor.open() : this.kitchenDoor.close();
  }

  /** 廚房門把（世界座標），開門動畫的手部 IK 目標 */
  kitchenHandle() {
    const h = this.kitchen.def;
    return new Vector3(h.x + h.w / 2 + 0.08, heightAt(h.x + h.w / 2, h.z) + 1.0, h.z - 0.1);
  }

  /** 廚房桌上的位置（撿葫蘆瓶時走過去） */
  kitchenTableSpot() {
    const h = this.kitchen.def;
    return new Vector3(h.x + 1.9, 0, h.z + 0.6);
  }

  #setKitchenPassable(open) {
    if (this.colliderOpts.kitchenDoorOpen === open) return;
    this.colliderOpts.kitchenDoorOpen = open;
    this.colliders = buildColliders(this.level, this.colliderOpts);
    this.onCollidersChanged?.();
  }

  /** 關門時門扇掃過的範圍裡有沒有人（玩家）→ 有就不能關 */
  #inKitchenDoorway() {
    const p = this.playerPos;
    if (!p || !this.kitchen) return false;
    const h = this.kitchen.def;
    const lx = p.x - h.x;
    const lz = p.z - h.z;
    return lx > h.w / 2 - 1.3 && lx < h.w / 2 + 0.35 && Math.abs(lz) < 0.85 + 0.35;
  }

  /** 玩家在廚房裡：屋頂與朝向鏡頭的牆淡出（剖視），鏡頭不因屋頂而拉近 */
  #updateKitchenCutaway(dt) {
    const k = this.kitchen;
    if (!k || !this.playerPos) return;
    const h = k.def;
    const lx = this.playerPos.x - h.x;
    const lz = this.playerPos.z - h.z;
    const inside = Math.abs(lx) < h.w / 2 + 0.2 && Math.abs(lz) < h.d / 2 + 0.2;
    this.kitchenInside = inside;
    k.fade = (k.fade ?? 1) + ((inside ? 0.12 : 1) - (k.fade ?? 1)) * Math.min(1, dt * 5);
    for (const m of k.fadeMats) {
      const transparent = k.fade < 0.98;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.depthWrite = !transparent;
        m.needsUpdate = true;
      }
      m.opacity = k.fade;
    }
    const want = inside ? 'inside' : 'outside';
    if (this.occluderMode !== want) {
      this.occluderMode = want;
      this.occluders.length = 0;
      for (const [id, g] of this.houseGroups) if (id !== 'kitchen' || !inside) this.occluders.push(id === 'kitchen' ? k.roof : g);
      this.occluders.push(this.storehouse.group, ...this.swayers, this.shrineTree);
    }
  }

  /**
   * 轉一次轆轤：曲柄轉一整圈（用明確的起始與目標角度，與幀率無關），繩子收短、水桶上升；
   * 玩家的手由 IK 握住曲柄。水桶離開水面時有水花與滴水。
   */
  async crankWell(cranks, total, player = null) {
    const rig = this.wellRig;
    const from = this.crankAngle;
    const to = from + Math.PI * 2;
    const lv0 = (cranks - 1) / total;
    const lv1 = cranks / total;
    const grip = new Vector3();
    const target = { target: grip, weight: 1 };
    const updateGrip = () => rig.gripPoint.getWorldPosition(grip);
    updateGrip();
    let hold = null;
    if (player) {
      player.animator.handTargets = { L: target };
      hold = player.hold('CrankWell', { fadeIn: 0.2 });
    }
    let splashed = false;
    await this.tweens.add(1.1, (k) => {
      this.crankAngle = from + (to - from) * k;
      rig.roller.rotation.x = this.crankAngle;
      rig.setLevel(lv0 + (lv1 - lv0) * k);
      updateGrip();
      if (!splashed && lv0 === 0 && rig.level > 0.04) {
        splashed = true;
        const p = this.well.localToWorld(new Vector3(0, 0.47, 0));
        this.burst('splash', p);
      }
      if (rig.level > 0.02 && Math.random() < 0.3) this.burst('drip', rig.bucket.getWorldPosition(new Vector3()));
    });
    hold?.stop();
    if (player) player.animator.handTargets = {};
  }

  /** 讀檔：把水桶放到目前的高度 */
  setWellLevel(cranks, total) {
    this.wellRig.setLevel(cranks / total);
    this.wellRig.key.visible = cranks < total;
  }

  /** 舊版轆轤（保留給測試比較）：轉一次轆轤，水桶往上升一段 */
  crankWellLegacy(cranks, total) {
    const bucket = this.wellBucket;
    const roller = this.well.children.find((c) => c.geometry?.type === 'CylinderGeometry' && Math.abs(c.rotation.z - Math.PI / 2) < 0.01);
    const from = bucket.position.y;
    const to = 0.98 + (cranks / total) * 0.75;
    // 用明確的起始與目標角度補間（不依每幀回呼次數累加），幀率高低轉的圈數都一樣
    const rollFrom = roller ? roller.rotation.x : 0;
    const rollTo = rollFrom + Math.PI * 1.5;
    return this.tweens.add(0.5, (k) => {
      bucket.position.y = from + (to - from) * k;
      if (roller) roller.rotation.x = rollFrom + (rollTo - rollFrom) * k;
    });
  }

  /** 할머니醒來：揉眼睛 → 起身走到마루前 → 站著（instant 用於讀檔） */
  async setGrandmaAwake(awake, instant = false) {
    const g = this.grandma;
    this.grandmaAwake = awake;
    if (!awake) {
      g.root.position.copy(this.grandmaSeat);
      g.animator.setBase('Sleep', 0.01);
      return;
    }
    if (instant) {
      g.root.position.copy(this.grandmaStand);
      g.animator.setBase('Idle', 0.01);
      return;
    }
    await g.animator.play('RubEyes', { fadeIn: 0.3 });
    const from = g.root.position.clone();
    const stand = g.animator.play('StandUp', { fadeIn: 0.15 });
    g.animator.setBase('Idle', 0.2);
    await this.tweens.add(1.4, (k) => g.root.position.lerpVectors(from, this.grandmaStand, k));
    await stand;
    g.animator.play('Wave');
  }

  /** 黑貓：前往下一個地點（帶一點跳躍與煙霧） */
  async setCatStage(stage, instant = false) {
    const prev = this.cat.root.position.clone();
    this.catStage = stage;
    if (instant) {
      this.#placeCat(stage);
      this.#updateCatInteractable();
      return;
    }
    // 先蹲低蓄力、跳起來（Jump 動畫），在空中化成一陣煙消失
    const jump = this.cat.animator.play('Jump', { fadeIn: 0.08 });
    await this.tweens.add(0.35, () => {});
    this.burst('smoke', prev.clone().add(new Vector3(0, 0.3, 0)), { count: 8, size: 0.3 });
    await this.tweens.add(0.4, (k) => {
      this.cat.root.position.y = prev.y + Math.sin(k * Math.PI) * 0.8;
      this.cat.root.scale.setScalar(Math.max(0.01, 1 - k));
    });
    await jump;
    this.#placeCat(stage);
    this.#updateCatInteractable();
    await this.tweens.add(0.3, (k) => this.cat.root.scale.setScalar(Math.max(0.01, k)));
  }

  showOfferings(visible = true, { quiet = false } = {}) {
    this.altar.offerings.visible = visible;
    if (visible && !quiet) this.burst('correct', this.altarTop.clone().add(new Vector3(0, 0.4, 0)));
  }

  setDokkaebiVisible(visible) {
    this.dokkaebi.root.visible = visible;
    this.dokkaebi.root.scale.setScalar(1);
  }

  async spawnDokkaebi() {
    const { root } = this.dokkaebi;
    root.visible = true;
    root.scale.setScalar(0.001);
    this.tweensBusyDok = true;
    await this.tweens.add(1.2, (k) => {
      for (const w of this.wisps) w.userData.radius = (w.userData.baseRadius ??= w.userData.radius) * (1 - 0.8 * k);
      this.wispSpeed = 0.6 + k * 5;
    });
    const center = this.dokBase.clone().setY(this.dokBase.y + 1.6);
    this.burst('dokkaebi', center);
    this.burst('smoke', center, { count: 40, spread: 1.0, size: 0.7, color: 0x4a5a80 });
    this.wispSpeed = 0.6;
    // 翻個跟斗落地
    await this.tweens.add(0.8, (k) => {
      root.scale.setScalar(Math.max(0.001, Math.min(1, k * 1.4)));
      root.rotation.x = (1 - k) * Math.PI * 2;
      root.position.y = this.dokBase.y + Math.sin(k * Math.PI) * 1.5;
    }, ease.linear);
    root.rotation.x = 0;
    this.tweensBusyDok = false;
    for (const w of this.wisps) w.userData.radius = w.userData.baseRadius * 1.3;
  }

  dokkaebiReact(kind) {
    const clip = { laugh: 'Laugh', surprised: 'Startled', cheer: 'Cheer', pout: 'Sulk' }[kind];
    if (clip === 'Sulk') {
      const hold = this.dokkaebi.animator.play('Sulk');
      setTimeout(() => this.dokkaebi.animator.stop('Sulk'), 1400);
      hold.catch?.(() => {});
    } else if (clip) this.dokkaebi.animator.play(clip);
    this.dokkaebi.animator.browRaise = kind === 'surprised' ? 1 : kind === 'pout' ? -1 : 0;
    const head = this.dokkaebiHead;
    if (kind === 'laugh') this.burst('wrong', head);
    if (kind === 'surprised') this.burst('correct', head);
    if (kind === 'cheer') this.burst('correct', head, { count: 50, color: 0x67c5dc });
  }

  async hideDokkaebi() {
    const { root } = this.dokkaebi;
    this.tweensBusyDok = true;
    await this.tweens.add(0.7, (k) => {
      root.scale.setScalar(Math.max(0.001, 1 - k));
      root.rotation.y = k * Math.PI * 4;
    });
    const p = this.dokBase.clone().setY(this.dokBase.y + 1.2);
    this.burst('smoke', p, { count: 30, spread: 0.8, size: 0.6, color: 0x4a5a80 });
    this.burst('dokkaebi', p, { count: 40 });
    root.visible = false;
    root.rotation.y = 0;
    this.tweensBusyDok = false;
  }

  // ---------- 甕遊戲 ----------

  showShellJars(visible) {
    this.shellJars.forEach((jar, i) => {
      jar.visible = visible;
      jar.position.set(this.level.altar.x + (i - 1) * 0.7, this.altarTop.y, this.level.altar.z);
    });
    this.altar.offerings.visible = !visible && this.altar.offerings.visible;
    this.jarAtSlot = [0, 1, 2];
  }

  /** 播放一回合：月光放進甕裡，再依序交換位置 */
  async playShellRound(round, { glint = false } = {}) {
    this.showShellJars(true);
    const jar = this.shellJars[round.moonJar];
    this.moonOrb.visible = true;
    const start = jar.position.clone().add(new Vector3(0, 1.4, 0));
    await this.tweens.add(0.7, (k) => this.moonOrb.position.copy(start).add(new Vector3(0, -k * 0.9, 0)));
    this.moonOrb.visible = false;
    await this.tweens.add(0.3, () => {});
    const slotX = (slot) => this.level.altar.x + (slot - 1) * 0.7;
    for (const [a, b] of round.swaps) {
      const ja = this.shellJars[this.jarAtSlot[a]];
      const jb = this.shellJars[this.jarAtSlot[b]];
      const za = this.level.altar.z;
      await this.tweens.add(round.swapDuration, (k) => {
        ja.position.x = slotX(a) + (slotX(b) - slotX(a)) * k;
        jb.position.x = slotX(b) + (slotX(a) - slotX(b)) * k;
        ja.position.z = za + Math.sin(k * Math.PI) * 0.45;
        jb.position.z = za - Math.sin(k * Math.PI) * 0.45;
      });
      [this.jarAtSlot[a], this.jarAtSlot[b]] = [this.jarAtSlot[b], this.jarAtSlot[a]];
    }
    if (glint) {
      const slot = this.jarAtSlot.indexOf(round.moonJar);
      this.burst('correct', this.shellJars[round.moonJar].position.clone().add(new Vector3(0, 0.7, 0)), { count: 12, color: 0xfff1c4 });
      return slot;
    }
    return null;
  }

  /** 從被點到的物件找出是第幾個位置的甕 */
  slotFromObject(obj) {
    let o = obj;
    while (o && !this.shellJars.includes(o)) o = o.parent;
    if (!o) return null;
    return this.jarAtSlot.indexOf(this.shellJars.indexOf(o));
  }

  async revealShell(slot, moonJar) {
    const jar = this.shellJars[this.jarAtSlot[slot]];
    const y = jar.position.y;
    const right = this.jarAtSlot[slot] === moonJar;
    await this.tweens.add(0.5, (k) => (jar.position.y = y + k * 0.6));
    if (right) {
      this.moonOrb.position.copy(jar.position).add(new Vector3(0, 0.2, 0));
      this.moonOrb.visible = true;
      this.burst('correct', this.moonOrb.position, { count: 40, color: 0xfff1c4 });
    } else {
      this.burst('smoke', jar.position.clone().add(new Vector3(0, 0.2, 0)), { count: 8, size: 0.3 });
    }
    await this.tweens.add(0.6, () => {});
    if (!right) await this.tweens.add(0.3, (k) => (jar.position.y = y + 0.6 * (1 - k)));
    return right;
  }

  // ---------- 結局 ----------

  async returnMoon() {
    this.moon.visible = true;
    this.showShellJars(false);
    const orbFrom = this.moonOrb.position.clone();
    await this.tweens.add(4.5, (k) => {
      this.moonOrb.position.lerpVectors(orbFrom, MOON_TO, Math.min(1, k * 1.5));
      this.moonOrb.visible = k < 0.6;
      this.moon.position.lerpVectors(MOON_FROM, MOON_TO, k);
      this.moonlight.intensity = 2.6 * k;
      this.ambient.intensity = 2.0 + 1.3 * k;
      this.scene.fog.density = 0.017 - 0.008 * k;
      this.stars.brightness = 1 - 0.4 * k;
      this.pond.userData.water.material.uniforms.uMoon.value = k;
      if (Math.random() < 0.5) this.burst('moon', new Vector3(0, 1, -12));
    });
  }

  /** 月光照亮村子：每戶的窗一扇扇亮起來 */
  async lightUpVillage() {
    const windows = [...this.windowMeshes].sort((a, b) => a.getWorldPosition(new Vector3()).z - b.getWorldPosition(new Vector3()).z);
    for (const w of windows) {
      w.material = mats.paperGlow;
      this.burst('lanternOn', w.getWorldPosition(new Vector3()), { count: 6 });
      await this.tweens.add(0.12, () => {});
    }
  }

  /** 真結局：도깨비在屋頂上點起藍色的火 */
  trueEndingFires() {
    for (const h of this.level.houses) {
      const wisp = makeWisp(true);
      wisp.position.set(h.x, heightAt(h.x, h.z) + 5.2, h.z);
      wisp.userData = { phase: Math.random() * 6, radius: 0, height: wisp.position.y, fixed: true };
      this.scene.add(wisp);
      this.burst('dokkaebi', wisp.position, { count: 30 });
    }
  }

  // ---------- 每幀更新 ----------

  /** 某個位置的風力（給角色的頭髮、衣帶、燈籠使用） */
  windAt(p) {
    return this.wind.at(p);
  }

  update(dt, playerPos) {
    this.time += dt;
    this.wind.update(dt);
    this.playerPos = playerPos ?? null;
    this.kitchenDoor?.update(dt);
    this.storehouseDoor?.update(dt);
    if (this.kitchen) {
      const w = this.wind.at(this.kitchen.group.position);
      // 屋裡沒有風，灶火只輕輕晃
      for (const f of this.kitchen.fires) f.update(this.time, w.multiplyScalar(0.15), 1);
      for (const [i, l] of this.kitchen.fireLights.entries()) l.intensity = 2.0 + 0.5 * Math.sin(this.time * 9 + i) * Math.sin(this.time * 4.3 + i * 2);
      this.#updateKitchenCutaway(dt);
    }
    const t = this.time;
    this.tweens.update(dt);

    this.lanterns.forEach((lantern, i) => {
      lantern.update(t, dt, this.wind.at(lantern.group.position), i * 1.7);
      if (lantern.lit) {
        this.#emitRate(`ember-${i}`, 4, dt, () => this.burst('spark', this.lanternPosition(i).setY(this.lanternPosition(i).y + 0.3), { speed: 0.3, up: 0.9, size: 0.09, life: 1.4 }));
      }
    });

    this.#emitRate('chimney', 3, dt, () =>
      this.particles.emit({ x: this.chimneyTop.x, y: this.chimneyTop.y, z: this.chimneyTop.z, count: 1, spread: 0.15, speed: 0.35, up: 0.9, color: 0x5a5f6c, life: 3.8, gravity: -0.05, drag: 0.4, size: 0.5 }),
    );

    const { shrineTree, altar } = this.level;
    this.#emitRate('leaves', 1.2, dt, () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 3;
      this.particles.emit({ x: shrineTree.x + Math.cos(a) * r, y: 6 + Math.random() * 2, z: shrineTree.z + Math.sin(a) * r, count: 1, spread: 0, speed: 0.5, up: 0, color: Math.random() < 0.7 ? 0x4b8a4a : 0xd9873a, life: 6, gravity: 0.35, drag: 0.8, size: 0.14, jitter: 0.25 });
    });

    // 地面薄霧：在玩家附近飄動
    if (playerPos) {
      this.#emitRate('mist', 2.2, dt, () => {
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 10;
        const x = playerPos.x + Math.cos(a) * r;
        const z = playerPos.z + Math.sin(a) * r;
        this.particles.emit({ x, y: heightAt(x, z) + 0.3, z, count: 1, spread: 0.5, speed: 0.25, up: 0.05, color: 0x263c50, life: 7, gravity: 0, drag: 0.2, size: 2.6, jitter: 0.3 });
      });
    }

    // NPC：由各自的 AnimationMixer 驅動；離玩家遠時降低更新頻率
    const head = playerPos ? this.#tmpHead.set(playerPos.x, playerPos.y + 1.3, playerPos.z) : null;
    const g = this.grandma;
    g.animator.lookTarget = this.grandmaAwake && head && head.distanceTo(g.root.position) < 7 ? head : null;
    this.#updateNpc(g, dt, playerPos);
    if (!this.grandmaAwake) this.#emitRate('sleep', 0.8, dt, () => this.burst('sleep', g.head.getWorldPosition(new Vector3()).add(new Vector3(0, 0.3, 0))));
    const cat = this.cat;
    cat.animator.lookTarget = head && head.distanceTo(cat.root.position) < 6 ? head : null;
    // 黑貓偶爾舔毛、伸懶腰
    this.catIdleTimer = (this.catIdleTimer ?? 6) - dt;
    if (this.catIdleTimer < 0 && !cat.animator.busy) {
      this.catIdleTimer = 7 + Math.random() * 6;
      const lick = Math.random() < 0.6;
      const p = cat.animator.play(lick ? 'Lick' : 'Stretch', { cancelable: true });
      if (lick) setTimeout(() => cat.animator.stop('Lick'), 2600);
      p.catch?.(() => {});
    }
    this.#updateNpc(cat, dt, playerPos);

    // 腳印呼吸般地明暗
    this.footprints.children.forEach((fp, i) => (fp.material.opacity = 0.45 + 0.4 * Math.max(0, Math.sin(t * 1.5 - i * 0.4))));

    // 鬼火
    const speed = this.wispSpeed ?? 0.6;
    this.wispAngle = (this.wispAngle ?? 0) + dt * speed;
    for (const w of this.wisps) {
      const { phase, radius, height } = w.userData;
      const a = this.wispAngle + phase;
      w.position.set(altar.x + Math.cos(a) * radius, heightAt(altar.x, altar.z) + height + Math.sin(t * 2 + phase) * 0.3, altar.z - 2 + Math.sin(a) * radius * 0.7);
      this.#emitRate(`wisp-${phase}`, 8, dt, () =>
        this.particles.emit({ x: w.position.x, y: w.position.y, z: w.position.z, count: 1, spread: 0.08, speed: 0.15, up: 0.2, color: 0x4f9cff, life: 0.9, gravity: -0.1, drag: 1, size: 0.16 }),
      );
    }

    // 樹與布條隨風擺動
    const wind = Math.min(1.4, this.wind.gust * 0.7);
    const motion = this.reduceMotion ? 0.3 : 1;
    for (const tree of this.swayers) {
      const { phase, amp } = tree.userData.sway;
      tree.rotation.x = Math.sin(t * 1.3 + phase) * amp * (0.6 + wind) * motion;
      tree.rotation.z = Math.sin(t * 1.1 + phase * 1.7) * amp * (0.6 + wind) * motion;
    }
    for (const strip of this.strips) {
      strip.rotation.x = Math.sin(t * 3.1 + strip.userData.flutter) * (0.15 + wind * 0.25) * motion;
      strip.rotation.z = Math.sin(t * 2.3 + strip.userData.flutter * 1.3) * 0.1 * motion;
    }

    if (this.marker.visible) {
      this.marker.position.copy(this.markerBase);
      this.marker.position.y += Math.sin(t * 3) * 0.3 * motion;
      this.marker.rotation.y = t * 2;
    }
    if (this.highlight.visible) this.highlight.material.opacity = 0.45 + 0.35 * Math.sin(t * 4) * motion;
    if (this.tapRing.material.opacity > 0) {
      this.tapRing.material.opacity = Math.max(0, this.tapRing.material.opacity - dt * 1.8);
      this.tapRing.scale.multiplyScalar(1 + dt * 1.5);
    }
    this.pond.userData.water.material.uniforms.uTime.value = t;

    this.#animateDokkaebi(dt, head);
    this.particles.update(dt, this.wind.at(playerPos ?? this.dokBase).multiplyScalar(0.8));
    // 草：風與玩家推開（頂點著色器）
    const gu = this.grassUniforms;
    if (gu) {
      gu.uTime.value = t;
      const d = this.wind.direction;
      gu.uWindDir.value.set(d.x, d.z);
      gu.uGust.value = this.wind.gust;
      if (playerPos) gu.uPlayer.value.copy(playerPos);
      gu.uMotion.value = this.reduceMotion ? 0.35 : 1;
    }
    // 池塘：玩家靠近岸邊時激起漣漪
    const pondU = this.pond.userData.water.material.uniforms;
    if (playerPos && pondU.uRipple) {
      const L = this.level.pond;
      const dx = playerPos.x - L.x;
      const dz = playerPos.z - L.z;
      const d = Math.hypot(dx, dz);
      this.rippleTimer = (this.rippleTimer ?? 0) - dt;
      if (d < L.r + 1.2 && this.rippleTimer <= 0) {
        this.rippleTimer = 1.1;
        const k = Math.min(1, (L.r - 0.3) / Math.max(d, 0.01));
        pondU.uRipple.value.set(dx * k, -dz * k, t);
      }
    }
    this.fireflies.update(t);
    this.stars.update(t);
  }

  #animateDokkaebi(dt, head) {
    const d = this.dokkaebi;
    if (!d.root.visible) return;
    if (!this.tweensBusyDok) d.root.position.copy(this.dokBase);
    d.animator.lookTarget = head;
    d.animator.update(dt);
  }

  #tmpHead = new Vector3();

  /** NPC 動畫更新：近的每幀更新，遠的累積時間、隔幾幀才更新一次（遠距離角色動畫降頻） */
  #updateNpc(npc, dt, playerPos) {
    const far = playerPos ? npc.root.position.distanceTo(playerPos) > 22 : false;
    npc.lodTime = (npc.lodTime ?? 0) + dt;
    npc.lodFrame = ((npc.lodFrame ?? 0) + 1) % 3;
    if (far && npc.lodFrame !== 0) return;
    npc.animator.update(npc.lodTime);
    npc.lodTime = 0;
  }

  dispose() {
    this.tweens.clear();
    this.scene.traverse((obj) => {
      obj.geometry?.dispose();
      if (obj.material && !Object.values(mats).includes(obj.material)) obj.material.dispose?.();
    });
  }
}
