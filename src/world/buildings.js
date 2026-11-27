import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PointLight,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { makeFlame } from './Fire.js';
import { mats } from './materials.js';
import { box, cyl, makeRoof } from './props.js';

const at = (mesh, x, y, z) => {
  mesh.position.set(x, y, z);
  return mesh;
};

/** 廚房的尺寸常數（碰撞計算 layout.js 也用同一組） */
export const KITCHEN = { wall: 0.16, doorHalf: 0.85, wallHeight: 2.3, platform: { w: 1.15, d: 3.4, h: 0.75 } };

/** 韓紙窗＋窗櫺（창살）：木框、格子、紙面（可發光） */
function latticeWindow(width, height, paper, { cols = 4, rows = 5 } = {}) {
  const g = new Group();
  g.add(at(box(width, height, 0.03, paper), 0, 0, 0));
  const frame = mats.darkWood;
  for (const sy of [-1, 1]) g.add(at(box(width + 0.08, 0.06, 0.08, frame), 0, (sy * height) / 2, 0));
  for (const sx of [-1, 1]) g.add(at(box(0.06, height + 0.08, 0.08, frame), (sx * width) / 2, 0, 0));
  for (let i = 1; i < cols; i++) g.add(at(box(0.025, height, 0.05, frame), -width / 2 + (i * width) / cols, 0, 0));
  for (let j = 1; j < rows; j++) g.add(at(box(width, 0.025, 0.05, frame), 0, -height / 2 + (j * height) / rows, 0));
  return g;
}

/** 一扇門板：木框、上半部韓紙格子、下半部木板、門環（문고리） */
function doorLeaf(width, height, side) {
  const g = new Group();
  const frame = mats.darkWood;
  // 門板以鉸鏈為原點，沿 ±z 延伸
  const cz = (side * width) / 2;
  g.add(at(box(0.06, height, width, mats.wood), 0, height / 2, cz));
  const paperPanel = latticeWindow(width * 0.72, height * 0.42, mats.paperGlow, { cols: 3, rows: 4 });
  paperPanel.rotation.y = Math.PI / 2;
  paperPanel.position.set(0.035, height * 0.66, cz);
  g.add(paperPanel);
  for (const y of [0.04, height * 0.4, height - 0.04]) g.add(at(box(0.08, 0.06, width, frame), 0, y, cz));
  g.add(at(box(0.08, height, 0.06, frame), 0, height / 2, side * (width - 0.03)));
  // 門環：鐵環掛在靠門縫那一側
  const ring = new Mesh(new TorusGeometry(0.05, 0.01, 5, 12), mats.black);
  ring.rotation.y = Math.PI / 2;
  g.add(at(ring, 0.06, height * 0.48, side * (width - 0.12)));
  g.add(at(new Mesh(new SphereGeometry(0.02, 6, 4), mats.black), 0.05, height * 0.52, side * (width - 0.12)));
  return g;
}

/**
 * 可以走進去的廚房（부엌）：地面是夯土（和外面同高），四面牆有門洞，
 * 雙開門向內開；屋裡有아궁이（灶口）與兩口가마솥、碗櫃、小飯桌（字條與葫蘆瓶）、水缸、米袋、柴堆、등잔（油燈）。
 * 回傳門扇、會淡出的屋頂與牆、室內光源與灶火。
 */
export function makeKitchen({ w, d }) {
  const g = new Group();
  const { wall, doorHalf, wallHeight } = KITCHEN;
  const halfW = w / 2;
  const halfD = d / 2;
  // 前牆（南、東，朝向鏡頭）用獨立材質，玩家進屋時只淡出這幾面與屋頂
  const wallMat = mats.wall;
  const frontMat = mats.wall.clone();
  const fadeMats = [frontMat];

  // 牆基：一圈石塊（只在牆下，室內是夯土地面）
  const stoneGeom = new BoxGeometry(0.42, 0.26, 0.3);
  const stones = [];
  const pushRun = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 0.44));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      stones.push([x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, Math.atan2(x1 - x0, z1 - z0)]);
    }
  };
  pushRun(-halfW, -halfD, halfW, -halfD);
  pushRun(-halfW, halfD, halfW, halfD);
  pushRun(-halfW, -halfD, -halfW, halfD);
  pushRun(halfW, -halfD, halfW, -doorHalf);
  pushRun(halfW, doorHalf, halfW, halfD);
  const base = new InstancedMesh(stoneGeom, mats.stone, stones.length);
  const m4 = new Matrix4();
  stones.forEach(([x, z, a], i) => {
    m4.compose(new Vector3(x, 0.13, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a + Math.PI / 2), new Vector3(1, 1, 1));
    base.setMatrixAt(i, m4);
  });
  g.add(base);

  // 四面牆（有厚度）；南、東兩面朝向鏡頭，玩家進屋時會淡出
  const wallY = 0.26 + wallHeight / 2;
  const north = at(box(w, wallHeight, wall, wallMat), 0, wallY, -halfD);
  const south = at(box(w, wallHeight, wall, frontMat), 0, wallY, halfD);
  const west = at(box(wall, wallHeight, d, wallMat), -halfW, wallY, 0);
  const eastLen = halfD - doorHalf;
  const east1 = at(box(wall, wallHeight, eastLen, frontMat), halfW, wallY, -(doorHalf + eastLen / 2));
  const east2 = at(box(wall, wallHeight, eastLen, frontMat), halfW, wallY, doorHalf + eastLen / 2);
  const lintel = at(box(wall, wallHeight - 2.0, doorHalf * 2, frontMat), halfW, 0.26 + 2.0 + (wallHeight - 2.0) / 2, 0);
  g.add(north, south, west, east1, east2, lintel);

  // 木構：柱子與橫樑（看得出結構）
  for (const [x, z] of [
    [-halfW, -halfD],
    [halfW, -halfD],
    [-halfW, halfD],
    [halfW, halfD],
    [halfW, -doorHalf - 0.06],
    [halfW, doorHalf + 0.06],
    [0, halfD],
    [0, -halfD],
  ])
    g.add(at(cyl(0.12, 0.13, wallHeight + 0.1, mats.darkWood, 8), x, 0.26 + (wallHeight + 0.1) / 2, z));
  for (const z of [-halfD, halfD]) g.add(at(box(w + 0.3, 0.2, 0.22, mats.darkWood), 0, 0.26 + wallHeight, z));
  for (const x of [-halfW, halfW]) g.add(at(box(0.22, 0.2, d + 0.3, mats.darkWood), x, 0.26 + wallHeight, 0));
  g.add(at(box(0.2, 0.12, doorHalf * 2 + 0.3, mats.darkWood), halfW + 0.02, 0.26 + 2.02, 0)); // 門楣

  // 窗戶：南牆兩扇、北牆一扇（屋裡有燈時發光）
  const windows = [];
  for (const [x, z, ry] of [
    [-1.6, halfD + 0.09, 0],
    [1.2, halfD + 0.09, 0],
    [0.6, -halfD - 0.09, Math.PI],
  ]) {
    const win = latticeWindow(1.0, 0.8, mats.paperGlow);
    win.position.set(x, 1.75, z);
    win.rotation.y = ry;
    g.add(win);
    windows.push(win);
  }

  // 雙開門：鉸鏈在門洞兩側，向內（-x）打開
  const leafH = 1.95;
  const doors = [-1, 1].map((s) => {
    const hinge = new Group();
    hinge.position.set(halfW - 0.02, 0.06, s * doorHalf);
    hinge.add(doorLeaf(doorHalf, leafH, -s));
    g.add(hinge);
    return { hinge, sign: s };
  });
  const threshold = at(box(0.24, 0.08, doorHalf * 2, mats.darkWood), halfW, 0.04, 0);
  g.add(threshold);

  // ---- 室內 ----
  const p = KITCHEN.platform;
  const px = -halfW + wall / 2 + p.w / 2;
  const clay = new MeshLambertMaterial({ color: 0x9a6a4a });
  g.add(at(box(p.w, p.h, p.d, clay), px, p.h / 2, 0));
  g.add(at(box(p.w + 0.06, 0.06, p.d + 0.06, mats.darkWood), px, p.h + 0.03, 0));
  const fires = [];
  const fireLights = [];
  for (const z of [-0.8, 0.8]) {
    // 灶口：凹進去的黑洞，裡面有火
    g.add(at(box(0.08, 0.36, 0.46, mats.black), px + p.w / 2 + 0.005, 0.3, z));
    g.add(at(box(0.12, 0.06, 0.6, mats.darkStone), px + p.w / 2 + 0.03, 0.51, z));
    const flame = makeFlame({ height: 0.28, width: 0.2 });
    flame.group.position.set(px + p.w / 2 - 0.05, 0.13, z);
    g.add(flame.group);
    fires.push(flame);
    const light = new PointLight(0xff8a3c, 2.2, 3.2, 1.6);
    light.position.set(px + p.w / 2 + 0.25, 0.35, z);
    g.add(light);
    fireLights.push(light);
    // 가마솥（鐵鍋）與鍋蓋
    const pot = new Mesh(new SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.black);
    g.add(at(pot, px, p.h + 0.02, z));
    const rim = new Mesh(new TorusGeometry(0.45, 0.035, 6, 20), mats.black);
    rim.rotation.x = Math.PI / 2;
    g.add(at(rim, px, p.h + 0.04, z));
    const lid = new Mesh(new SphereGeometry(0.43, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new MeshLambertMaterial({ color: 0x2a2a30 }));
    lid.scale.y = 0.35;
    g.add(at(lid, px, p.h + 0.05, z));
    g.add(at(cyl(0.05, 0.06, 0.06, mats.darkWood, 8), px, p.h + 0.22, z));
  }
  // 碗櫃（찬장）：北牆
  const shelfX = 1.3;
  const shelfZ = -halfD + wall / 2 + 0.22;
  g.add(at(box(1.6, 1.7, 0.42, mats.wood), shelfX, 0.85, shelfZ - 0.02));
  for (let i = 0; i < 3; i++) {
    const y = 0.45 + i * 0.45;
    g.add(at(box(1.5, 0.04, 0.38, mats.darkWood), shelfX, y, shelfZ + 0.03));
    for (let k = 0; k < 4; k++) {
      const bowl = new Mesh(new SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new MeshLambertMaterial({ color: [0xe6dcc6, 0x8a9aa8, 0xc9b28a][i] }));
      bowl.rotation.x = Math.PI;
      g.add(at(bowl, shelfX - 0.55 + k * 0.36, y + 0.1, shelfZ + 0.08));
    }
  }
  // 小飯桌（소반）＋字條＋葫蘆瓶
  const table = new Group();
  table.position.set(0.6, 0, 1.0);
  table.add(at(cyl(0.42, 0.42, 0.05, mats.wood, 16), 0, 0.36, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    table.add(at(cyl(0.025, 0.03, 0.34, mats.darkWood, 6), Math.cos(a) * 0.3, 0.17, Math.sin(a) * 0.3));
  }
  const note = at(box(0.22, 0.008, 0.16, new MeshLambertMaterial({ color: 0xf2ead6, emissive: 0x30281a })), -0.08, 0.39, 0.05);
  note.rotation.y = 0.3;
  table.add(note);
  const gourd = new Group();
  const gourdMat = new MeshLambertMaterial({ color: 0xd8c48a });
  gourd.add(at(new Mesh(new SphereGeometry(0.075, 12, 10), gourdMat), 0, 0.075, 0));
  gourd.add(at(new Mesh(new SphereGeometry(0.05, 12, 10), gourdMat), 0, 0.17, 0));
  gourd.add(at(cyl(0.012, 0.014, 0.05, mats.darkWood, 6), 0, 0.23, 0));
  gourd.position.set(0.18, 0.385, -0.08);
  table.add(gourd);
  g.add(table);
  // 水缸、米袋、柴堆
  const jar = new Mesh(
    new LatheGeometry([0.02, 0.28, 0.36, 0.34, 0.24, 0.22].map((r, i) => new Vector2(r, i * 0.16)), 16),
    new MeshLambertMaterial({ color: 0x5b3a26 }),
  );
  g.add(at(jar, 2.7, 0, 2.0));
  const sack = new Mesh(new SphereGeometry(0.34, 10, 8), mats.paperDim);
  sack.scale.set(1, 1.25, 0.9);
  g.add(at(sack, 2.6, 0.38, -1.6));
  for (let i = 0; i < 9; i++) {
    const log = cyl(0.06, 0.06, 0.7, mats.bark, 6);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = 0.15;
    g.add(at(log, px + 0.15, 0.07 + Math.floor(i / 3) * 0.12, 2.0 + (i % 3) * 0.13 - Math.floor(i / 3) * 0.06));
  }
  // 등잔（油燈）：燈架上的油碟與小火焰
  const lampX = -0.4;
  const lampZ = -1.7;
  g.add(at(cyl(0.12, 0.15, 0.04, mats.darkWood, 10), lampX, 0.02, lampZ));
  g.add(at(cyl(0.02, 0.025, 1.05, mats.darkWood, 6), lampX, 0.55, lampZ));
  g.add(at(cyl(0.08, 0.05, 0.04, mats.darkStone, 10), lampX, 1.09, lampZ));
  const lampFlame = makeFlame({ height: 0.1, width: 0.05 });
  lampFlame.group.position.set(lampX, 1.11, lampZ);
  g.add(lampFlame.group);
  fires.push(lampFlame);
  const interiorLight = new PointLight(0xffb36b, 1.0, 7, 1.4);
  interiorLight.position.set(lampX, 1.3, lampZ);
  g.add(interiorLight);

  // 屋頂（會淡出）
  const roof = makeRoof(w + 1.8, d + 2.2, 1.7);
  roof.position.y = 0.26 + wallHeight + 0.15;
  roof.traverse((o) => {
    if (!o.material) return;
    o.material = o.material.clone();
    fadeMats.push(o.material);
  });
  g.add(roof);

  return {
    group: g,
    doors,
    roof,
    windows,
    fadeMats,
    fadeWalls: [south, east1, east2, lintel],
    interiorLight,
    fireLights,
    fires,
    note,
    gourd,
    table,
    /** 室內範圍（區域座標），玩家在裡面時屋頂與前牆淡出 */
    interior: { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD },
  };
}

/**
 * 水井：石塊一層層砌成的井壁、井口、木架、轆轤（帶曲柄）、繩子、水桶（綁著鑰匙）、水面。
 * 轆轤的方向會朝向玩家站的位置，讓曲柄就在玩家手邊。
 * setCrank(angle)：轉動角度（弧度）→ 繩子收短、水桶上升。
 */
export function makeWellRig() {
  const g = new Group();
  const rings = 5;
  const perRing = 14;
  const stoneGeom = new BoxGeometry(0.46, 0.2, 0.26);
  const stones = new InstancedMesh(stoneGeom, mats.stone, rings * perRing);
  const m4 = new Matrix4();
  const q = new Quaternion();
  let n = 0;
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < perRing; i++) {
      const a = ((i + (r % 2) * 0.5) / perRing) * Math.PI * 2;
      q.setFromAxisAngle(new Vector3(0, 1, 0), -a);
      const jitter = 1 + Math.sin(i * 7.3 + r * 3.1) * 0.06;
      m4.compose(new Vector3(Math.cos(a) * 1.02, 0.1 + r * 0.19, Math.sin(a) * 1.02), q, new Vector3(jitter, 1, 1));
      stones.setMatrixAt(n++, m4);
    }
  }
  g.add(stones);
  const rim = new Mesh(new TorusGeometry(1.04, 0.12, 6, 24), mats.darkStone);
  rim.rotation.x = Math.PI / 2;
  g.add(at(rim, 0, 1.0, 0));
  // 井裡的牆面與水面
  g.add(at(new Mesh(new CylinderGeometry(0.9, 0.9, 1.0, 20, 1, true), new MeshLambertMaterial({ color: 0x2a2f38, side: DoubleSide })), 0, 0.5, 0));
  const water = new Mesh(new CylinderGeometry(0.88, 0.88, 0.02, 24), new MeshLambertMaterial({ color: 0x1c3a52, emissive: 0x0a1a28 }));
  g.add(at(water, 0, 0.45, 0));
  // 木架
  for (const sx of [-1, 1]) {
    g.add(at(box(0.16, 2.3, 0.16, mats.darkWood), sx * 1.15, 1.15, 0));
    g.add(at(box(0.3, 0.12, 0.3, mats.darkWood), sx * 1.15, 2.08, 0));
  }
  g.add(at(box(2.6, 0.08, 0.5, mats.roof), 0, 2.55, 0));
  // 轆轤：滾筒＋軸＋曲柄（L 形：臂＋握把）
  const roller = new Group();
  roller.position.set(0, 2.0, 0);
  const drum = cyl(0.13, 0.13, 2.1, mats.wood, 12);
  drum.rotation.z = Math.PI / 2;
  roller.add(drum);
  for (let i = 0; i < 5; i++) {
    const band = new Mesh(new TorusGeometry(0.135, 0.012, 4, 14), mats.bark);
    band.rotation.y = Math.PI / 2;
    roller.add(at(band, -0.6 + i * 0.3, 0, 0));
  }
  const axle = cyl(0.04, 0.04, 0.3, mats.black, 6);
  axle.rotation.z = Math.PI / 2;
  roller.add(at(axle, 1.25, 0, 0));
  const crank = new Group();
  crank.position.set(1.38, 0, 0);
  crank.add(at(box(0.05, 0.36, 0.06, mats.darkWood), 0, -0.18, 0));
  const grip = cyl(0.03, 0.03, 0.2, mats.wood, 6);
  grip.rotation.z = Math.PI / 2;
  crank.add(at(grip, 0.1, -0.34, 0));
  const gripPoint = new Group();
  gripPoint.position.set(0.12, -0.34, 0);
  crank.add(gripPoint);
  roller.add(crank);
  g.add(roller);
  // 繩子（從滾筒下緣垂到水桶）與水桶
  const ropeMat = new MeshLambertMaterial({ color: 0xb8a272 });
  const rope = new Mesh(new CylinderGeometry(0.015, 0.015, 1, 5), ropeMat);
  g.add(rope);
  const bucket = new Group();
  const staves = new Mesh(new CylinderGeometry(0.2, 0.16, 0.3, 14), mats.wood);
  bucket.add(at(staves, 0, 0.15, 0));
  for (const y of [0.05, 0.25]) {
    const band = new Mesh(new TorusGeometry(0.19 - y * 0.12, 0.012, 4, 16), mats.black);
    band.rotation.x = Math.PI / 2;
    bucket.add(at(band, 0, y, 0));
  }
  const handle = new Mesh(new TorusGeometry(0.19, 0.01, 4, 12, Math.PI), mats.black);
  bucket.add(at(handle, 0, 0.3, 0));
  const key = new Group();
  key.add(at(new Mesh(new TorusGeometry(0.035, 0.01, 6, 10), mats.gold ?? new MeshLambertMaterial({ color: 0xd9b24a })), 0, 0, 0));
  key.add(at(box(0.012, 0.12, 0.02, new MeshLambertMaterial({ color: 0xd9b24a, emissive: 0x3a2a08 })), 0, -0.09, 0));
  key.position.set(0.05, 0.42, 0);
  bucket.add(key);
  g.add(bucket);

  const LOW = 0.43; // 水桶在水裡
  const HIGH = 1.52; // 拉到井口上方
  let level = 0;
  const state = {
    group: g,
    roller,
    crank,
    gripPoint,
    rope,
    bucket,
    key,
    water,
    /** 水桶高度 0（水裡）– 1（井口上） */
    get level() {
      return level;
    },
    setLevel(k) {
      level = Math.max(0, Math.min(1, k));
      bucket.position.set(0, LOW + (HIGH - LOW) * level, 0);
      const top = 2.0 - 0.13;
      const bottom = bucket.position.y + 0.3;
      rope.scale.y = Math.max(0.01, top - bottom);
      rope.position.set(0, (top + bottom) / 2, 0);
    },
  };
  state.setLevel(0);
  return state;
}

// ---------- 石燈刻紋：梅、蘭、菊、竹，用形狀（不是顏色）區分 ----------

function circleShape(cx, cy, r, seg = 10) {
  const s = new Shape();
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    if (i === 0) s.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else s.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return s;
}

function leafShape(x, y, len, width, angle, curve = 0.3) {
  const s = new Shape();
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const pt = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
  s.moveTo(...pt(0, 0));
  s.quadraticCurveTo(...pt(len * 0.5, width + curve * len * 0.3), ...pt(len, curve * len * 0.2));
  s.quadraticCurveTo(...pt(len * 0.5, -width + curve * len * 0.3), ...pt(0, 0));
  return s;
}

/** 回傳某種刻紋的 2D 形狀（約 0.3 × 0.3 的範圍，中心在原點） */
export function carvingShapes(kind) {
  const shapes = [];
  if (kind === 'plum') {
    // 梅：斜伸的枝幹＋三朵五瓣花
    shapes.push(leafShape(-0.14, -0.13, 0.32, 0.012, 0.75, 0.05));
    for (const [cx, cy, r] of [
      [-0.04, -0.02, 0.05],
      [0.07, 0.08, 0.045],
      [0.1, -0.06, 0.035],
    ]) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        shapes.push(circleShape(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.48, 8));
      }
    }
  } else if (kind === 'orchid') {
    // 蘭：從底部長出四片細長彎曲的葉子＋一朵小花
    for (const [ang, len, curve] of [
      [1.2, 0.3, 0.35],
      [1.75, 0.27, -0.3],
      [0.7, 0.24, 0.45],
      [2.3, 0.2, -0.4],
    ])
      shapes.push(leafShape(0, -0.14, len, 0.016, ang, curve));
    for (let i = 0; i < 3; i++) shapes.push(leafShape(0.04, 0.04, 0.06, 0.018, 0.4 + i * 0.9, 0));
  } else if (kind === 'chrysanthemum') {
    // 菊：一朵有很多細長花瓣的放射狀大花
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      shapes.push(leafShape(Math.cos(a) * 0.025, Math.sin(a) * 0.025, 0.11, 0.014, a, 0));
    }
    shapes.push(circleShape(0, 0, 0.035, 12));
  } else {
    // 竹：兩根有竹節的竹竿＋幾片竹葉
    for (const [x, h0] of [
      [-0.05, -0.15],
      [0.06, -0.15],
    ]) {
      for (let k = 0; k < 4; k++) {
        const s = new Shape();
        const y0 = h0 + k * 0.08;
        s.moveTo(x - 0.018, y0);
        s.lineTo(x + 0.018, y0);
        s.lineTo(x + 0.018, y0 + 0.068);
        s.lineTo(x - 0.018, y0 + 0.068);
        s.closePath();
        shapes.push(s);
      }
    }
    for (const [ang, x, y] of [
      [0.5, 0.06, 0.12],
      [0.9, 0.06, 0.12],
      [2.6, -0.05, 0.06],
      [2.2, -0.05, 0.06],
    ])
      shapes.push(leafShape(x, y, 0.12, 0.016, ang, 0.1));
  }
  return shapes;
}

/** 刻紋浮雕（凸出石面的立體圖案） */
export function makeCarving(kind, material) {
  const geom = new ExtrudeGeometry(carvingShapes(kind), { depth: 0.025, bevelEnabled: false, curveSegments: 4 });
  return new Mesh(geom, material);
}

/**
 * 石燈（석등）：八角台座與蓮花座、柱身、火室（四面開窗）、屋形頂與寶珠；
 * 前後兩面有梅蘭菊竹的立體刻紋，點燈時火室裡出現火焰。
 */
export function makeCarvedLantern(carving, color) {
  const g = new Group();
  const stone = mats.stone;
  const oct = (r1, r2, h, y) => at(cyl(r1, r2, h, stone, 8), 0, y, 0);
  g.add(oct(0.55, 0.6, 0.24, 0.12));
  g.add(oct(0.42, 0.52, 0.12, 0.3));
  // 下蓮座：一圈朝下的花瓣
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const petal = new Mesh(new SphereGeometry(0.12, 8, 6), stone);
    petal.scale.set(1, 0.5, 0.6);
    petal.rotation.y = -a;
    g.add(at(petal, Math.cos(a) * 0.32, 0.4, Math.sin(a) * 0.32));
  }
  g.add(oct(0.17, 0.2, 0.85, 0.85));
  // 柱身的刻線
  for (const y of [0.6, 1.1]) g.add(oct(0.215, 0.215, 0.04, y));
  g.add(oct(0.42, 0.3, 0.16, 1.33));
  // 火室：四根角柱，四面開窗
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(at(box(0.1, 0.48, 0.1, stone), Math.cos(a) * 0.3, 1.66, Math.sin(a) * 0.3));
  }
  g.add(at(box(0.5, 0.05, 0.5, mats.darkStone), 0, 1.43, 0));
  // 刻紋面板：前後兩面，面板本身是石頭，圖案凸出並帶一點顏色
  const plaqueMat = new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.15 });
  const plaques = [];
  for (const sz of [-1, 1]) {
    const panel = at(box(0.36, 0.36, 0.04, stone), 0, 1.66, sz * 0.24);
    g.add(panel);
    const relief = makeCarving(carving, plaqueMat);
    relief.position.set(0, 1.66, sz * 0.262);
    if (sz < 0) relief.rotation.y = Math.PI;
    relief.scale.setScalar(1.0);
    g.add(relief);
    plaques.push(relief);
  }
  // 屋形頂與寶珠
  const roof = new Mesh(new CylinderGeometry(0.12, 0.66, 0.34, 4), stone);
  roof.rotation.y = Math.PI / 4;
  g.add(at(roof, 0, 2.08, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const tip = new Mesh(new SphereGeometry(0.06, 6, 4), stone);
    g.add(at(tip, Math.cos(a) * 0.62, 1.95, Math.sin(a) * 0.62));
  }
  g.add(at(new Mesh(new SphereGeometry(0.1, 10, 8), stone), 0, 2.32, 0));
  g.add(at(cyl(0.05, 0.08, 0.1, stone, 8), 0, 2.22, 0));

  const flame = makeFlame({ height: 0.3, width: 0.17 });
  flame.group.position.set(0, 1.46, 0);
  g.add(flame.group);
  const ember = at(new Mesh(new SphereGeometry(0.06, 8, 6), new MeshBasicMaterial({ color: 0x2a1a10 })), 0, 1.49, 0);
  g.add(ember);
  const light = new PointLight(0xffa64d, 0, 11, 1.2);
  light.position.set(0, 1.7, 0);
  g.add(light);

  let lit = false;
  let glow = 0;
  let sputter = -1;
  return {
    group: g,
    flame,
    plaques,
    light,
    get lit() {
      return lit;
    },
    setLit(on, instant = true) {
      lit = on;
      if (instant) glow = on ? 1 : 0;
    },
    /** 點錯時火苗閃一下就熄 */
    sputter(k) {
      sputter = k;
    },
    /** 每幀：火焰逐漸形成、光線慢慢變亮；k 是 0–1 的點火進度 */
    update(t, dt, wind, phase = 0) {
      const target = lit ? 1 : 0;
      glow += (target - glow) * Math.min(1, dt * 2.2);
      let intensity = glow;
      if (sputter >= 0 && sputter < 1) intensity = Math.max(intensity, Math.sin(sputter * 40) > 0 ? 0.5 * (1 - sputter) : 0);
      flame.update(t + phase, wind, intensity);
      ember.material.color.setRGB(0.16 + 0.8 * intensity, 0.1 + 0.4 * intensity, 0.06);
      light.intensity = intensity * (13 + 3 * Math.sin(t * 9 + phase) * Math.sin(t * 3.7 + phase * 2));
      plaqueMat.emissiveIntensity = 0.15 + 0.75 * glow;
    },
  };
}
