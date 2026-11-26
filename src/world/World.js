import {
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { ease, Tweens } from '../core/Tweens.js';
import { makeBox } from './Collision.js';
import { makeDokkaebiModel } from './characters.js';
import { mats } from './materials.js';
import {
  makeAltar,
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
  box,
} from './props.js';

const MOON_FROM = new Vector3(0, -2, -80);
const MOON_TO = new Vector3(0, 30, -80);

/**
 * 依照關卡資料蓋出 3D 村落，並提供場景效果（點燈、開門、도깨비登場、月亮升起）。
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
    this.lanterns = new Map();
    this.wisps = [];
    this.time = 0;

    const rand = seededRandom(20261126);
    this.#buildEnvironment();
    this.#buildGround();
    this.#buildWalls();
    this.#buildVillage(rand);
    this.#buildShrine(rand);
    this.#buildTrees(rand);
    this.#buildInteractables();
  }

  get bounds() {
    return this.level.bounds;
  }

  get shrinePosition() {
    return new Vector3(this.level.altar.x, 0, this.level.altar.z);
  }

  // ---------- 建構 ----------

  #buildEnvironment() {
    this.scene.background = new Color(0x000000);
    this.scene.fog = new FogExp2(0x000000, 0.016);
    this.ambient = new AmbientLight(0x5a6a9a, 2.0);
    this.hemi = new HemisphereLight(0x8095d0, 0x2a2a1e, 1.8);
    this.starlight = new DirectionalLight(0x99aadd, 1.6);
    this.starlight.position.set(-10, 20, -6);
    this.moonlight = new DirectionalLight(0xfff1c4, 0);
    this.moonlight.position.set(0, 30, -40);
    this.scene.add(this.ambient, this.hemi, this.starlight, this.moonlight);

    this.moon = new Mesh(new SphereGeometry(7, 24, 16), mats.moon);
    this.moon.position.copy(MOON_FROM);
    this.moon.visible = false;
    this.scene.add(this.moon);
  }

  #buildGround() {
    const ground = new Mesh(new PlaneGeometry(90, 90), mats.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    this.scene.add(ground);
    this.pickables.push(ground);

    for (const [x, z, w, d] of this.level.paths) {
      const path = new Mesh(new PlaneGeometry(w, d), mats.path);
      path.rotation.x = -Math.PI / 2;
      path.position.set(x, 0.01, z);
      path.userData.isGround = true;
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

    this.altar = makeAltar();
    this.altar.group.position.set(altar.x, 0, altar.z);
    this.scene.add(this.altar.group);
    this.colliders.push(makeBox(altar.x, altar.z, 2.4, 1.4));

    for (let i = 0; i < 3; i++) {
      const wisp = makeWisp(i < 2);
      wisp.userData = { phase: (i / 3) * Math.PI * 2, radius: 2.4 + i * 0.5, height: 1.6 + i * 0.5 };
      this.scene.add(wisp);
      this.wisps.push(wisp);
    }

    this.dokkaebi = makeDokkaebiModel();
    this.dokkaebi.root.position.set(altar.x, 0, altar.z - 2.2);
    this.dokkaebi.root.visible = false;
    this.scene.add(this.dokkaebi.root);
  }

  #buildTrees(rand) {
    for (const t of this.level.trees) {
      const tree = makeTree(t.kind, rand);
      tree.position.set(t.x, 0, t.z);
      this.scene.add(tree);
      this.colliders.push(makeBox(t.x, t.z, 0.8, 0.8));
    }
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
      this.interactables.push({ ...def, position: new Vector3(def.x, 0, def.z) });
    }
  }

  interactable(id) {
    return this.interactables.find((i) => i.id === id);
  }

  // ---------- 場景效果 ----------

  litSeasons() {
    return [...this.lanterns].filter(([, lantern]) => lantern.lit).map(([season]) => season);
  }

  syncLanterns(litSeasons) {
    for (const [season, lantern] of this.lanterns) lantern.setLit(litSeasons.includes(season));
  }

  openStorehouse() {
    const { door, lock, side } = this.storehouse;
    lock.visible = false;
    return this.tweens.add(0.8, (k) => {
      door.rotation.y = side * k * 1.9;
    });
  }

  showOfferings() {
    this.altar.offerings.visible = true;
  }

  async spawnDokkaebi() {
    const { root } = this.dokkaebi;
    root.visible = true;
    // 鬼火先收攏，再「砰」地變出도깨비
    await this.tweens.add(1.0, (k) => {
      for (const w of this.wisps) w.userData.radius = (w.userData.baseRadius ??= w.userData.radius) * (1 - 0.8 * k);
      root.scale.setScalar(0.001);
    });
    await this.tweens.add(0.7, (k) => root.scale.setScalar(Math.max(0.001, k)), ease.outBack);
    for (const w of this.wisps) w.userData.radius = w.userData.baseRadius * 1.3;
  }

  async returnMoon() {
    this.moon.visible = true;
    await this.tweens.add(4.0, (k) => {
      this.moon.position.lerpVectors(MOON_FROM, MOON_TO, k);
      this.moonlight.intensity = 2.4 * k;
      this.ambient.intensity = 2.0 + 1.6 * k;
      this.scene.fog.density = 0.016 - 0.008 * k;
    });
  }

  hideDokkaebi() {
    const { root } = this.dokkaebi;
    return this.tweens.add(0.6, (k) => root.scale.setScalar(Math.max(0.001, 1 - k))).then(() => {
      root.visible = false;
    });
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.tweens.update(dt);

    let i = 0;
    for (const lantern of this.lanterns.values()) lantern.flicker(t, i++ * 1.7);

    const { altar } = this.level;
    for (const w of this.wisps) {
      const { phase, radius, height } = w.userData;
      const a = t * 0.6 + phase;
      w.position.set(altar.x + Math.cos(a) * radius, height + Math.sin(t * 2 + phase) * 0.3, altar.z - 2 + Math.sin(a) * radius * 0.7);
    }

    const d = this.dokkaebi;
    if (d.root.visible) {
      d.head.rotation.z = Math.sin(t * 2.2) * 0.12;
      d.club.rotation.x = Math.sin(t * 3) * 0.2;
      d.root.position.y = Math.abs(Math.sin(t * 3)) * 0.12;
    }
  }

  dispose() {
    this.scene.traverse((obj) => {
      obj.geometry?.dispose();
    });
  }
}
