import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  FogExp2,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { tagObject } from '../render/objectId.js';
import { makeCarvedLantern } from '../world/buildings.js';
import { DoorController, DOOR } from '../world/DoorController.js';
import { makeFlame } from '../world/Fire.js';
import { ParticleSystem, Stars } from '../world/Particles.js';
import { LAYOUT, colliders, gustAt, inRavine } from './rules.js';

/**
 * Gate 1 原型「斷橋與燈」的場景（灰盒）：
 * 南邊庭院（起點、石碑 A、火盆、絞盤）→ 西側的溝（記憶木板）→ 小平台（石碑 B）
 * → 峽谷與斷橋（人間斷了、記憶裡完整）→ 北邊祠堂（要點亮的石燈）。
 * 只做規則需要的東西；外觀用簡單幾何，美術留到確認玩法之後。
 */
const M = {
  ground: new MeshStandardMaterial({ color: 0x59606c, roughness: 1 }),
  cliff: new MeshStandardMaterial({ color: 0x343944, roughness: 1 }),
  path: new MeshStandardMaterial({ color: 0x7a808c, roughness: 1 }),
  wood: new MeshStandardMaterial({ color: 0x6e4c33, roughness: 0.9 }),
  darkWood: new MeshStandardMaterial({ color: 0x4a3324, roughness: 0.9 }),
  stone: new MeshStandardMaterial({ color: 0x7d8088, roughness: 0.95 }),
  rope: new MeshStandardMaterial({ color: 0xb59a6a, roughness: 1 }),
  void: new MeshBasicMaterial({ color: 0x020306 }),
  tree: new MeshLambertMaterial({ color: 0x1f3a33 }),
  memory: new MeshStandardMaterial({ color: 0x1f5d66, emissive: 0x2fb6c4, emissiveIntensity: 0.55, roughness: 0.8 }),
};

const box = (w, h, d, mat, x, y, z) => {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/** 石碑上的隱藏圖案（畫在 canvas 上，舉燈時才顯現；粗線條，轉成 ASCII 也看得出形狀） */
function drawPicture(kind) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffe2a0';
  g.fillStyle = '#ffe2a0';
  g.lineWidth = 26;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (kind === 'eye') {
    // 一隻眼睛，瞳孔是一彎新月
    g.beginPath();
    g.moveTo(40, 256);
    g.quadraticCurveTo(256, 60, 472, 256);
    g.quadraticCurveTo(256, 452, 40, 256);
    g.stroke();
    g.beginPath();
    g.arc(256, 256, 92, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(292, 236, 80, 0, Math.PI * 2);
    g.fill();
  } else {
    // 上：橋上的燈被風吹熄（風線＋傾倒的火＋叉）；下：閘門關上，火直直燒
    const flame = (x, y, lean) => {
      g.beginPath();
      g.moveTo(x - 22, y);
      g.quadraticCurveTo(x - 20 + lean, y - 50, x + lean * 1.6, y - 90);
      g.quadraticCurveTo(x + 20 + lean, y - 50, x + 22, y);
      g.closePath();
      g.fill();
    };
    g.lineWidth = 18;
    for (const y of [70, 110, 150]) {
      g.beginPath();
      g.moveTo(470, y);
      g.lineTo(330, y);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(40, 200);
    g.lineTo(300, 200);
    g.stroke();
    flame(170, 190, -70);
    g.lineWidth = 22;
    g.beginPath();
    g.moveTo(120, 60);
    g.lineTo(230, 170);
    g.moveTo(230, 60);
    g.lineTo(120, 170);
    g.stroke();
    // 下半：閘門（兩扇關上的門）擋住風
    g.lineWidth = 18;
    g.strokeRect(372, 300, 100, 180);
    g.beginPath();
    g.moveTo(422, 300);
    g.lineTo(422, 480);
    g.stroke();
    for (const y of [340, 390, 440]) {
      g.beginPath();
      g.moveTo(510, y);
      g.lineTo(482, y);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(40, 470);
    g.lineTo(330, 470);
    g.stroke();
    flame(170, 460, 0);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class ProtoWorld {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.bounds = LAYOUT.bounds;
    this.spirit = false;
    this.spiritBlend = 0;
    this.colliders = colliders(false);
    this.heightAt = () => 0;
    this.pointMaterials = [];
    this.root = new Group();
    scene.add(this.root);
    this.#lights();
    this.#terrain();
    this.#bridge();
    this.#trench();
    this.#courtyard();
    this.#gate();
    this.#shrine();
    this.particles = new ParticleSystem(900);
    this.root.add(this.particles.points);
    this.pointMaterials.push(this.particles.material);
    this.stars = new Stars(260, Math.random);
    this.root.add(this.stars.points);
    this.pointMaterials.push(this.stars.material);
    this.smokeTimer = 0;
    this.wind = new Vector3();
  }

  #lights() {
    this.scene.background = new Color(0x080d16);
    this.fog = new FogExp2(0x0a1220, 0.016);
    this.scene.fog = this.fog;
    this.hemi = new HemisphereLight(0x7088b8, 0x262c38, 1.1);
    this.root.add(this.hemi);
    const moon = new DirectionalLight(0xbfd2ff, 1.7);
    moon.position.set(-8, 18, 10);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 50 });
    this.root.add(moon);
    this.moon = moon;
  }

  #terrain() {
    const L = LAYOUT;
    const plat = (minX, maxX, minZ, maxZ) => {
      const m = box(maxX - minX, 6, maxZ - minZ, M.ground, (minX + maxX) / 2, -3, (minZ + maxZ) / 2);
      m.material = [M.cliff, M.cliff, M.ground, M.cliff, M.cliff, M.cliff];
      this.root.add(m);
    };
    plat(L.trench.maxX, 11, L.ravine.maxZ, 18); // 庭院
    plat(-11, L.trench.minX, L.ravine.maxZ, 18); // 西側小平台
    plat(-11, 11, -16, L.ravine.minZ); // 北邊祠堂
    const abyss = new Mesh(new PlaneGeometry(80, 80), M.void);
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.y = -10;
    this.root.add(abyss);
    // 石板路：起點 → 橋頭
    for (let z = 15.5; z > 4; z -= 1.1) this.root.add(box(1.5, 0.05, 0.9, M.path, 0.4 + (z - 10) * 0.08, 0.02, z));
    // 樹（地標）
    for (const [x, z, h] of [[8.5, 15.5, 4.5], [9, 9, 3.8], [-9.2, 16, 4.2], [7.5, -12.5, 5], [-8, -12, 4.6], [-9.3, -6.5, 3.6]]) {
      const tr = new Group();
      tr.add(box(0.3, h * 0.4, 0.3, M.darkWood, 0, h * 0.2, 0));
      const crown = new Mesh(new ConeGeometry(h * 0.35, h * 0.75, 7), M.tree);
      crown.position.y = h * 0.62;
      crown.castShadow = true;
      tr.add(crown);
      tr.position.set(x, 0, z);
      this.root.add(tr);
    }
  }

  /** 人間的斷橋＋記憶裡完整的橋 */
  #bridge() {
    const L = LAYOUT;
    const human = new Group();
    for (let z = L.remnantSouth.maxZ - 0.15; z > L.remnantSouth.minZ; z -= 0.3) human.add(box(1.4, 0.08, 0.24, M.wood, 0, -0.04, z));
    for (let z = L.remnantNorth.maxZ - 0.15; z > L.remnantNorth.minZ; z -= 0.3) human.add(box(1.4, 0.08, 0.24, M.wood, 0, -0.04, z));
    for (const z of [L.remnantSouth.maxZ - 0.1, L.remnantNorth.minZ + 0.1]) for (const x of [-0.8, 0.8]) human.add(box(0.14, 1.1, 0.14, M.darkWood, x, 0.55, z));
    // 斷掉、垂下去的橋板與繩子
    const hang = box(1.3, 0.07, 0.24, M.wood, 0.1, -0.5, L.remnantSouth.minZ - 0.15);
    hang.rotation.x = 1.25;
    human.add(hang);
    const hang2 = box(1.2, 0.07, 0.24, M.wood, -0.2, -0.6, L.remnantNorth.maxZ + 0.2);
    hang2.rotation.x = -1.1;
    human.add(hang2);
    for (const x of [-0.8, 0.8]) {
      const r = box(0.04, 1.4, 0.04, M.rope, x, -0.2, L.remnantSouth.minZ + 0.05);
      r.rotation.x = 0.3;
      human.add(r);
    }
    this.root.add(human);
    this.humanBridge = human;

    // 記憶：缺口裡的橋板、扶手與中間的柱子
    const mem = new Group();
    for (let z = L.remnantSouth.minZ - 0.15; z > L.remnantNorth.maxZ; z -= 0.3) mem.add(box(1.4, 0.08, 0.24, M.memory, 0, -0.04, z));
    const span = L.remnantSouth.minZ - L.remnantNorth.maxZ;
    const mid = (L.remnantSouth.minZ + L.remnantNorth.maxZ) / 2;
    for (const x of [-0.8, 0.8]) {
      mem.add(box(0.06, 0.06, span, M.memory, x, 0.9, mid));
      mem.add(box(0.12, 1, 0.12, M.memory, x, 0.45, mid));
    }
    this.#addMemory(mem);
  }

  #trench() {
    const L = LAYOUT;
    const mem = new Group();
    for (let z = L.plank.z - L.plank.half + 0.2; z < L.plank.z + L.plank.half; z += 0.4) mem.add(box(2.4, 0.08, 0.32, M.memory, (L.trench.minX + L.trench.maxX) / 2, -0.04, z));
    this.#addMemory(mem);
  }

  /**
   * 記憶物件：實體（只在靈視時出現、可以走）＋輪廓線（人間也看得到：青色的線條字元）。
   * 兩者都標成「記憶」，ASCII 管線在人間只畫線條字元。
   */
  #addMemory(solid) {
    this.memorySolids ??= [];
    this.memoryLines ??= [];
    this.lineMat ??= new LineBasicMaterial({ color: 0x48c4d2, depthWrite: false });
    const lines = new Group();
    solid.traverse((o) => {
      if (!o.isMesh) return;
      const l = new LineSegments(new EdgesGeometry(o.geometry), this.lineMat);
      l.position.copy(o.position);
      l.rotation.copy(o.rotation);
      lines.add(l);
    });
    solid.visible = false;
    tagObject(solid, 'memory');
    tagObject(lines, 'memory');
    this.root.add(solid, lines);
    this.memorySolids.push(solid);
    this.memoryLines.push(lines);
  }

  #courtyard() {
    const L = LAYOUT;
    // 矮牆：庭院南邊與東邊
    this.root.add(box(14.6, 0.7, 0.4, M.stone, 3.2, 0.35, 17.6));
    this.root.add(box(0.4, 0.7, 13.6, M.stone, 10.6, 0.35, 10.7));
    // 火盆（重新點燈的火源；它的煙顯示峽谷的風）
    const br = new Group();
    for (const a of [0, 2.1, 4.2]) br.add(box(0.08, 0.5, 0.08, M.darkWood, Math.cos(a) * 0.28, 0.25, Math.sin(a) * 0.28));
    const bowl = new Mesh(new CylinderGeometry(0.48, 0.3, 0.32, 12, 1, true), M.stone);
    bowl.position.y = 0.62;
    bowl.material = M.stone.clone();
    bowl.material.side = DoubleSide;
    br.add(bowl);
    this.brazierFlame = makeFlame({ height: 0.8, width: 0.46 });
    this.brazierFlame.group.position.y = 0.58;
    br.add(this.brazierFlame.group);
    this.brazierLight = new PointLight(0xffa050, 7, 10, 1.6);
    this.brazierLight.position.y = 1.1;
    br.add(this.brazierLight);
    br.position.set(L.brazier.x, 0, L.brazier.z);
    this.root.add(br);
    this.brazier = br;
    tagObject(br, 'interactable');
    // 石碑 A（庭院）與 B（小平台）
    this.steles = L.steles.map((s) => {
      const g = new Group();
      g.add(box(1.25, 1.9, 0.3, M.stone, 0, 0.95, 0));
      g.add(box(1.45, 0.14, 0.42, M.stone, 0, 1.97, 0));
      const pic = new Mesh(new PlaneGeometry(1.1, 1.1), new MeshBasicMaterial({ map: drawPicture(s.picture), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      pic.position.set(0, 1.05, 0.16);
      g.add(pic);
      g.position.set(s.x, 0, s.z);
      // 石碑 B 面向東（玩家從木板走過來）
      if (s.id === 'stele-wind') g.rotation.y = Math.PI / 2;
      this.root.add(g);
      tagObject(g, 'interactable');
      return { ...s, group: g, pic, reveal: 0 };
    });
    // 絞盤：轉它可以關上峽谷東邊的木閘門
    const w = new Group();
    w.add(box(0.2, 1.1, 0.2, M.darkWood, -0.3, 0.55, 0));
    w.add(box(0.2, 1.1, 0.2, M.darkWood, 0.3, 0.55, 0));
    const drum = new Group();
    const cylinder = new Mesh(new CylinderGeometry(0.16, 0.16, 0.5, 10), M.wood);
    cylinder.rotation.z = Math.PI / 2;
    drum.add(cylinder);
    drum.add(box(0.06, 0.4, 0.06, M.darkWood, 0.32, 0.18, 0));
    drum.position.y = 0.9;
    w.add(drum);
    w.position.set(L.winch.x, 0, L.winch.z);
    this.root.add(w);
    this.winch = w;
    this.winchDrum = drum;
    tagObject(w, 'interactable');
  }

  /** 峽谷東邊的木閘門：兩扇門板，關上時擋住吹進峽谷的風 */
  #gate() {
    const L = LAYOUT;
    const width = (L.ravine.maxZ - L.ravine.minZ) / 2;
    const leaf = (hingeZ, dir) => {
      const pivot = new Group();
      pivot.position.set(L.shutterX, 0, hingeZ);
      const panel = box(0.22, 6.5, width, M.darkWood, 0, -2.4, (-dir * width) / 2);
      pivot.add(panel);
      for (let k = 0; k < 3; k++) pivot.add(box(0.26, 0.18, width, M.wood, 0, -4.6 + k * 2.2, (-dir * width) / 2));
      this.root.add(pivot);
      return pivot;
    };
    this.gateLeaves = [leaf(L.ravine.maxZ, 1), leaf(L.ravine.minZ, -1)];
    this.gate = new DoorController({
      id: 'wind-gate',
      openSeconds: 2.2,
      onAngle: (k) => {
        // k = 1 打開（門板貼著峽谷壁，風吹得進來）；0 關上（門板橫過峽谷）
        this.gateLeaves[0].rotation.y = -k * (Math.PI / 2) * 0.95;
        this.gateLeaves[1].rotation.y = k * (Math.PI / 2) * 0.95;
      },
    });
    this.gate.restore(DOOR.OPEN);
  }

  get shutterClosed() {
    return this.gate.open01 < 0.08;
  }

  #shrine() {
    const L = LAYOUT;
    this.lamp = makeCarvedLantern('plum', 0xf2a0b8);
    this.lamp.group.position.set(L.lamp.x, 0, L.lamp.z);
    this.root.add(this.lamp.group);
    tagObject(this.lamp.group, 'interactable');
    this.root.add(box(8, 3, 0.5, M.stone, 0, 1.5, -13.1));
    for (const x of [-3.2, 3.2]) this.root.add(box(0.35, 3.6, 0.35, M.darkWood, x, 1.8, -12.4));
    this.root.add(box(7.6, 0.25, 1.8, M.darkWood, 0, 3.7, -12.4));
  }

  /** 靈視：記憶物件變成實體並發光；3D 模式下也換成冷色調（ASCII 模式另外由 shader 處理） */
  setSpirit(on) {
    this.spirit = on;
    this.colliders = colliders(on);
    for (const s of this.memorySolids) s.visible = on;
  }

  /** 給角色的彈簧骨（衣帶、辮子）與粒子：峽谷裡有陣風 */
  windAt(p, out = new Vector3()) {
    const g = gustAt(this.time);
    const inside = inRavine(p.x, p.z) || p.z < LAYOUT.ravine.maxZ + 2.5;
    const k = inside && !this.shutterClosed ? g.strength * 3.2 : 0.35;
    return out.set(-k, 0, 0.15 * Math.sin(this.time * 0.7));
  }

  burst(kind, p, opts = {}) {
    const presets = {
      spark: { count: 3, spread: 0.03, speed: 0.4, up: 0.8, color: 0xffb050, life: 0.6, gravity: -0.3, drag: 1.5, size: 0.05 },
      reveal: { count: 18, spread: 0.4, speed: 0.4, up: 0.6, color: 0xffe2a0, life: 1.4, gravity: -0.1, drag: 1.2, size: 0.09 },
      memory: { count: 24, spread: 0.6, speed: 0.5, up: 0.5, color: 0x6fe0ec, life: 1.6, gravity: -0.15, drag: 1.1, size: 0.1 },
      ignite: { count: 22, spread: 0.1, speed: 1.3, up: 1.5, color: 0xffc060, life: 0.9, gravity: 0.6, drag: 1, size: 0.08 },
      snuff: { count: 10, spread: 0.05, speed: 0.6, up: 0.8, color: 0x8a95a6, life: 1.2, gravity: -0.2, drag: 0.8, size: 0.16 },
    };
    const base = presets[kind];
    if (!base) return;
    this.particles.emit({ ...base, ...opts, x: p.x, y: p.y, z: p.z });
  }

  /** 互動點（人間與靈界都一樣） */
  interactables() {
    const L = LAYOUT;
    return [
      { id: 'brazier', x: L.brazier.x, z: L.brazier.z, radius: 1.9, label: '火盆', face: this.brazier.position },
      { id: 'winch', x: L.winch.x, z: L.winch.z, radius: 1.8, label: '絞盤', face: this.winch.position },
      ...this.steles.map((s) => ({ id: s.id, x: s.x, z: s.z, radius: 2.2, label: '石碑', face: s.group.position })),
      { id: 'lamp', x: L.lamp.x, z: L.lamp.z, radius: 2, label: '石燈', face: this.lamp.group.position },
    ];
  }

  /**
   * @param o.raised 玩家舉著燈籠
   * @param o.lanternLit 燈籠亮著
   * @param o.playerPos 玩家位置
   * @returns 這一格新顯現的石碑 id（第一次完全顯現時）
   */
  update(dt, o) {
    this.time += dt;
    const g = gustAt(this.time);
    this.gate.update(dt);
    // 靈視的過渡（3D 模式的霧與天光）
    this.spiritBlend += ((this.spirit ? 1 : 0) - this.spiritBlend) * (1 - Math.exp(-dt * 5));
    this.fog.color.setRGB(0.04 - 0.02 * this.spiritBlend, 0.07 + 0.03 * this.spiritBlend, 0.125 + 0.06 * this.spiritBlend);
    this.hemi.color.setRGB(0.44 - 0.2 * this.spiritBlend, 0.53 + 0.1 * this.spiritBlend, 0.72 + 0.15 * this.spiritBlend);
    this.lineMat.color.setRGB(0.28 + 0.2 * this.spiritBlend, 0.77 + 0.15 * this.spiritBlend, 0.82 + 0.15 * this.spiritBlend);
    // 火盆：火焰隨峽谷的風傾斜；煙在陣風時往西倒、平靜時往上飄
    const windX = this.shutterClosed ? 0 : -g.strength * 2.4;
    this.wind.set(windX, 0, 0);
    this.brazierFlame.update(this.time, { x: windX * 0.6, y: 0 }, 1);
    this.brazierLight.intensity = 6.5 + Math.sin(this.time * 9) * 0.5 + Math.sin(this.time * 15.3) * 0.3;
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.09;
      const b = LAYOUT.brazier;
      this.particles.emit({ x: b.x, y: 1.1, z: b.z, count: 1, spread: 0.12, speed: 0.15, up: 0.9, color: 0x8b96a8, life: 3.2, gravity: -0.18, drag: 0.7, size: 0.55, jitter: 0.1 });
    }
    this.particles.update(dt, this.wind.clone().multiplyScalar(1.6).setY(0));
    this.stars.update(this.time);
    // 絞盤轉動（跟著閘門）
    this.winchDrum.rotation.x = this.gate.open01 * 9;
    this.lamp.update(this.time, dt, { x: 0, y: 0 });
    // 石碑：舉燈靠近時才顯現；平常只有一點點閃光（暗示有東西）
    let revealed = null;
    for (const s of this.steles) {
      const d = Math.hypot(o.playerPos.x - s.x, o.playerPos.z - s.z);
      const near = d < 3.6 && o.lanternLit;
      const target = near ? (o.raised ? 1 : 0.07 + 0.04 * Math.sin(this.time * 2.3)) : 0;
      s.reveal += (target - s.reveal) * (1 - Math.exp(-dt * (target > s.reveal ? 2.2 : 3.5)));
      s.pic.material.opacity = s.reveal;
      if (s.reveal > 0.85 && !s.seen) {
        s.seen = true;
        revealed = s.id;
        this.burst('reveal', s.group.position.clone().setY(1.2));
      }
    }
    return { gust: g, revealed };
  }
}
