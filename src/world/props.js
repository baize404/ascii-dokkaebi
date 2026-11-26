import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Color,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PointLight,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { CatmullRomCurve3, CircleGeometry, PlaneGeometry, ShaderMaterial, TubeGeometry } from 'three';
import { mats, OBANGSAEK } from './materials.js';

// ---------- 小工具 ----------
export function box(w, h, d, mat) {
  return new Mesh(new BoxGeometry(w, h, d), mat);
}
export function cyl(rTop, rBottom, h, mat, seg = 10) {
  return new Mesh(new CylinderGeometry(rTop, rBottom, h, seg), mat);
}
function at(mesh, x, y, z) {
  mesh.position.set(x, y, z);
  return mesh;
}

/** 可重現的亂數（讓每次載入的樹長得一樣） */
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- 建築 ----------

/** 韓屋的弧形屋頂：剖面在 Z-Y 平面，沿 X 方向擠出。 */
export function makeRoof(width, depth, height) {
  const half = depth / 2;
  const t = 0.28;
  const shape = new Shape();
  shape.moveTo(-half, 0);
  shape.quadraticCurveTo(-half * 0.25, height * 0.2, 0, height);
  shape.quadraticCurveTo(half * 0.25, height * 0.2, half, 0);
  shape.lineTo(half, -t);
  shape.quadraticCurveTo(half * 0.25, height * 0.2 - t * 1.3, 0, height - t * 1.6);
  shape.quadraticCurveTo(-half * 0.25, height * 0.2 - t * 1.3, -half, -t);
  shape.closePath();

  const geom = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 10 });
  geom.translate(0, 0, -width / 2);
  geom.rotateY(-Math.PI / 2);

  const roof = new Group();
  roof.add(new Mesh(geom, mats.roof));
  roof.add(at(box(width + 0.3, 0.26, 0.42, mats.ridge), 0, height - 0.05, 0));

  // 瓦壟：沿著坡度排列的細長瓦片，讓屋頂在 ASCII 裡有直條紋理
  const lift = (dy) => {
    const sh = new Shape();
    sh.moveTo(-half, dy);
    sh.quadraticCurveTo(-half * 0.25, height * 0.2 + dy, 0, height + dy);
    sh.quadraticCurveTo(half * 0.25, height * 0.2 + dy, half, dy);
    return sh;
  };
  const strip = lift(0.11);
  const inner = lift(0.03).getPoints(24).reverse();
  for (const p of inner) strip.lineTo(p.x, p.y);
  const stripGeom = new ExtrudeGeometry(strip, { depth: 0.13, bevelEnabled: false, curveSegments: 10 });
  stripGeom.translate(0, 0, -0.065);
  stripGeom.rotateY(-Math.PI / 2);
  const count = Math.floor(width / 0.42);
  const tiles = new InstancedMesh(stripGeom, mats.roofTile, count);
  const m4 = new Matrix4();
  for (let i = 0; i < count; i++) {
    m4.makeTranslation(-width / 2 + 0.21 + i * 0.42, 0, 0);
    tiles.setMatrixAt(i, m4);
  }
  roof.add(tiles);
  return roof;
}

export function makeHanok({ w, d, door = 'east', glow = true }) {
  const g = new Group();
  g.add(at(box(w + 0.8, 0.5, d + 0.8, mats.stone), 0, 0.25, 0));
  g.add(at(box(w, 2.2, d, mats.wall), 0, 1.6, 0));

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(at(cyl(0.15, 0.15, 2.3, mats.darkWood, 8), (sx * w) / 2, 1.65, (sz * d) / 2));
  }
  // 上緣橫樑
  g.add(at(box(w + 0.1, 0.22, 0.2, mats.darkWood), 0, 2.65, d / 2));
  g.add(at(box(w + 0.1, 0.22, 0.2, mats.darkWood), 0, 2.65, -d / 2));

  // 前後兩面的韓紙窗
  const winMat = glow ? mats.paperGlow : mats.paperDim;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const wx = sx * w * 0.24;
      const wz = sz * (d / 2 + 0.04);
      g.add(at(box(1.2, 0.95, 0.08, winMat), wx, 1.75, wz));
      // 窗櫺（창살）：直條與橫條木格
      for (const ox of [-0.3, 0, 0.3]) g.add(at(box(0.05, 0.95, 0.1, mats.darkWood), wx + ox, 1.75, wz + sz * 0.01));
      g.add(at(box(1.2, 0.05, 0.1, mats.darkWood), wx, 1.75, wz + sz * 0.01));
      g.add(at(box(1.3, 0.08, 0.12, mats.darkWood), wx, 2.25, wz + sz * 0.01));
    }
  }

  // 門
  const side = door === 'east' ? 1 : -1;
  g.add(at(box(0.1, 1.75, 1.3, mats.darkWood), side * (w / 2 + 0.05), 1.38, 0));
  g.add(at(box(0.12, 0.5, 0.5, glow ? mats.paperGlow : mats.paperDim), side * (w / 2 + 0.06), 1.8, 0));
  // 門前的마루（木廊）與石階
  g.add(at(box(0.8, 0.12, d * 0.86, mats.wood), side * (w / 2 + 0.4), 0.62, 0));
  for (let i = -2; i <= 2; i++) g.add(at(box(0.82, 0.02, 0.04, mats.darkWood), side * (w / 2 + 0.4), 0.69, (i * d * 0.86) / 5));
  for (const sz of [-1, 1]) g.add(at(box(0.12, 0.6, 0.12, mats.darkWood), side * (w / 2 + 0.75), 0.3, sz * d * 0.4));
  g.add(at(box(0.9, 0.25, 1.6, mats.stone), side * (w / 2 + 1.25), 0.13, 0));

  const roof = makeRoof(w + 1.8, d + 2.2, 1.7);
  roof.position.y = 2.75;
  g.add(roof);
  return g;
}

/** 倉庫（곳간）：門是可以打開的樞紐。 */
export function makeStorehouse({ w, d, door = 'west' }) {
  const g = new Group();
  g.add(at(box(w + 0.6, 0.6, d + 0.6, mats.darkStone), 0, 0.3, 0));
  g.add(at(box(w, 2.3, d, mats.wood), 0, 1.75, 0));
  for (let i = -2; i <= 2; i++) g.add(at(box(w + 0.02, 0.06, d + 0.02, mats.darkWood), 0, 1.75 + i * 0.42, 0));

  const side = door === 'west' ? -1 : 1;
  const hinge = new Group();
  hinge.position.set(side * (w / 2 + 0.06), 1.5, 0.7);
  const doorMesh = at(box(0.1, 1.9, 1.4, mats.darkWood), 0, 0, -0.7);
  hinge.add(doorMesh);
  const lock = at(box(0.16, 0.32, 0.26, new MeshLambertMaterial({ color: 0xd4a72c })), side * 0.08, 0.05, -1.3);
  hinge.add(lock);
  g.add(hinge);

  const roof = makeRoof(w + 1.4, d + 1.8, 1.3);
  roof.position.y = 2.9;
  g.add(roof);

  // 倉庫裡的米袋（門打開時看得到）
  for (let i = 0; i < 3; i++) g.add(at(new Mesh(new SphereGeometry(0.45, 8, 6), mats.paperDim), side * 1.2, 0.9, -0.9 + i * 0.9));

  return { group: g, door: hinge, lock, side };
}

export function makeWell() {
  const g = new Group();
  const ringMat = new MeshLambertMaterial({ color: 0x8e9096, side: DoubleSide });
  g.add(at(new Mesh(new CylinderGeometry(1.05, 1.1, 0.95, 16, 1, true), ringMat), 0, 0.48, 0));
  const rim = new Mesh(new TorusGeometry(1.06, 0.13, 6, 18), mats.stone);
  rim.rotation.x = Math.PI / 2;
  g.add(at(rim, 0, 0.95, 0));
  const water = new Mesh(new CylinderGeometry(0.98, 0.98, 0.05, 16), mats.black);
  g.add(at(water, 0, 0.7, 0));
  for (const sx of [-1, 1]) g.add(at(box(0.18, 2.2, 0.18, mats.darkWood), sx * 1.15, 1.1, 0));
  const roller = cyl(0.12, 0.12, 2.5, mats.wood, 8);
  roller.rotation.z = Math.PI / 2;
  g.add(at(roller, 0, 2.0, 0));
  g.add(at(cyl(0.03, 0.03, 1.0, mats.bark, 4), 0, 1.45, 0));
  g.add(at(cyl(0.22, 0.17, 0.32, mats.wood, 8), 0, 0.98, 0));
  return g;
}

export function makeJangseung({ female = false }) {
  const g = new Group();
  const pole = cyl(0.34, 0.42, 3.2, new MeshLambertMaterial({ color: 0xb59a74 }), 12);
  g.add(at(pole, 0, 1.6, 0));
  // 臉
  for (const sx of [-1, 1]) {
    g.add(at(new Mesh(new SphereGeometry(0.09, 6, 4), mats.black), sx * 0.14, 2.35, 0.33));
    g.add(at(box(0.22, 0.05, 0.05, mats.black), sx * 0.15, 2.52, 0.33));
  }
  g.add(at(box(0.1, 0.32, 0.12, new MeshLambertMaterial({ color: 0xa3865f })), 0, 2.15, 0.38));
  g.add(at(box(0.34, 0.06, 0.06, female ? new MeshLambertMaterial({ color: 0xb03030 }) : mats.black), 0, 1.9, 0.36));
  // 帽子（男）或髮髻（女）
  if (female) {
    g.add(at(cyl(0.3, 0.36, 0.25, mats.hair, 10), 0, 3.25, 0));
  } else {
    g.add(at(cyl(0.6, 0.6, 0.06, mats.hair, 14), 0, 3.22, 0));
    g.add(at(cyl(0.25, 0.3, 0.45, mats.hair, 10), 0, 3.47, 0));
  }
  // 柱身的直條（代表刻字）
  g.add(at(box(0.12, 1.3, 0.04, mats.darkWood), 0, 1.0, 0.41));
  return g;
}

/** 石燈（석등）：回傳 setLit() 控制燈火。 */
export function makeStoneLantern(carvingColor = 0x888888) {
  const g = new Group();
  g.add(at(box(0.95, 0.3, 0.95, mats.stone), 0, 0.15, 0));
  g.add(at(cyl(0.18, 0.22, 1.0, mats.stone, 8), 0, 0.8, 0));
  g.add(at(box(0.8, 0.14, 0.8, mats.stone), 0, 1.36, 0));
  const fireMat = new MeshBasicMaterial({ color: 0x1a1a1a });
  const fire = at(box(0.42, 0.42, 0.42, fireMat), 0, 1.65, 0);
  g.add(fire);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(0.1, 0.5, 0.1, mats.stone), sx * 0.27, 1.65, sz * 0.27));
  // 刻紋色牌（前後兩面），讓四盞燈遠看就能分辨
  const plaqueMat = new MeshLambertMaterial({ color: carvingColor, emissive: carvingColor, emissiveIntensity: 0.25 });
  for (const sz of [-1, 1]) g.add(at(box(0.26, 0.26, 0.04, plaqueMat), 0, 1.65, sz * 0.23));
  const cap = new Mesh(new ConeGeometry(0.72, 0.5, 4), mats.stone);
  cap.rotation.y = Math.PI / 4;
  g.add(at(cap, 0, 2.15, 0));
  g.add(at(new Mesh(new SphereGeometry(0.12, 6, 4), mats.stone), 0, 2.45, 0));

  const light = new PointLight(0xffa64d, 0, 11, 1.2);
  light.position.set(0, 1.7, 0);
  g.add(light);

  let lit = false;
  return {
    group: g,
    get lit() {
      return lit;
    },
    setLit(on) {
      lit = on;
      fireMat.color.setHex(on ? 0xf2bd68 : 0x1a1a1a);
      light.intensity = on ? 14 : 0;
      plaqueMat.emissiveIntensity = on ? 0.9 : 0.25;
    },
    /** 點錯時閃一下就熄 */
    sputter(k) {
      fireMat.color.setHex(k < 1 && Math.sin(k * 40) > 0 ? 0x8a5a2a : 0x1a1a1a);
    },
    flicker(t, phase) {
      if (lit) light.intensity = 13 + 3 * Math.sin(t * 9 + phase) * Math.sin(t * 3.7 + phase * 2);
    },
  };
}

// ---------- 自然 ----------

export function makeTree(kind, rand) {
  const g = new Group();
  const s = 0.85 + rand() * 0.4;
  if (kind === 'pine') {
    g.add(at(cyl(0.16, 0.24, 1.4, mats.bark, 6), 0, 0.7, 0));
    for (let i = 0; i < 3; i++) {
      const cone = new Mesh(new ConeGeometry(1.5 - i * 0.38, 1.6, 7), mats.pine);
      cone.rotation.y = rand() * Math.PI;
      g.add(at(cone, 0, 1.6 + i * 0.85, 0));
    }
  } else {
    g.add(at(cyl(0.18, 0.28, 1.8, mats.bark, 6), 0, 0.9, 0));
    const blobs = 3;
    for (let i = 0; i < blobs; i++) {
      const r = 1.0 + rand() * 0.6;
      const blob = new Mesh(new IcosahedronGeometry(r, 0), mats.leaf);
      blob.rotation.set(rand() * 3, rand() * 3, 0);
      g.add(at(blob, (rand() - 0.5) * 1.3, 2.2 + rand() * 0.9, (rand() - 0.5) * 1.3));
    }
  }
  g.scale.setScalar(s);
  g.rotation.y = rand() * Math.PI * 2;
  // 隨風搖擺用的參數（World 每幀更新）
  g.userData.sway = { phase: rand() * Math.PI * 2, amp: 0.025 + rand() * 0.025 };
  return g;
}

/** 서낭당老樹：粗樹幹 + 五色布條 + 石堆 */
export function makeShrineTree(rand) {
  const g = new Group();
  g.add(at(cyl(0.75, 1.15, 4.2, mats.bark, 10), 0, 2.1, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 2.3 + rand() * 0.8;
    const blob = new Mesh(new IcosahedronGeometry(1.9 + rand() * 0.7, 0), mats.leaf);
    g.add(at(blob, Math.cos(a) * r * 0.7, 5 + rand() * 1.2, Math.sin(a) * r * 0.7));
  }
  g.add(at(new Mesh(new IcosahedronGeometry(2.6, 0), mats.leaf), 0, 6.6, 0));

  // 綁在樹幹上的繩子和五色布條
  const rope = new Mesh(new TorusGeometry(0.95, 0.06, 4, 20), mats.wall);
  rope.rotation.x = Math.PI / 2;
  g.add(at(rope, 0, 2.4, 0));
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI * 2;
    const color = OBANGSAEK[i % OBANGSAEK.length];
    const len = 0.9 + rand() * 0.5;
    const geom = new BoxGeometry(0.16, len, 0.04);
    geom.translate(0, -len / 2, 0); // 支點移到布條頂端
    const strip = new Mesh(geom, new MeshLambertMaterial({ color }));
    strip.rotation.y = -a;
    strip.userData.flutter = rand() * Math.PI * 2;
    g.add(at(strip, Math.cos(a) * 1.0, 2.35, Math.sin(a) * 1.0));
  }
  // 石堆
  for (let i = 0; i < 7; i++) {
    const rock = new Mesh(new IcosahedronGeometry(0.35 + rand() * 0.2, 0), mats.stone);
    g.add(at(rock, 1.8 + (rand() - 0.5) * 0.8, 0.25 + (i > 4 ? 0.4 : 0), 0.9 + (rand() - 0.5) * 0.8));
  }
  return g;
}

export function makeAltar() {
  const g = new Group();
  g.add(at(box(2.4, 0.2, 1.4, mats.darkStone), 0, 0.1, 0));
  g.add(at(box(2.1, 0.6, 1.1, mats.stone), 0, 0.5, 0));

  const offerings = new Group();
  offerings.add(at(cyl(0.3, 0.2, 0.18, mats.wall, 10), -0.45, 0.9, 0));
  offerings.add(at(box(0.4, 0.14, 0.4, new MeshLambertMaterial({ color: 0x6b5a47 })), -0.45, 1.0, 0));
  offerings.add(at(new Mesh(new SphereGeometry(0.3, 10, 8), mats.onggi), 0.45, 1.05, 0));
  offerings.add(at(cyl(0.1, 0.14, 0.2, mats.onggi, 8), 0.45, 1.38, 0));
  offerings.visible = false;
  g.add(offerings);
  return { group: g, offerings };
}

/** 장독대：一群甕 */
export function makeJars(rand) {
  const g = new Group();
  g.add(at(box(3.2, 0.3, 2.2, mats.stone), 0, 0.15, 0));
  for (let i = 0; i < 6; i++) {
    const r = 0.35 + rand() * 0.2;
    const jar = new Mesh(new SphereGeometry(r, 10, 8), mats.onggi);
    jar.scale.y = 1.15;
    g.add(at(jar, -1.1 + (i % 3) * 1.1, 0.3 + r, i < 3 ? -0.5 : 0.5));
    g.add(at(cyl(r * 0.75, r * 0.75, 0.08, mats.darkWood, 10), -1.1 + (i % 3) * 1.1, 0.3 + r * 2.1, i < 3 ? -0.5 : 0.5));
  }
  return g;
}

export function makeWallSegment(length, along = 'x') {
  const mesh = box(along === 'x' ? length : 0.8, 1.1, along === 'x' ? 0.8 : length, mats.darkStone);
  mesh.position.y = 0.55;
  return mesh;
}

/**
 * 草叢與小花：用 InstancedMesh 一次畫上千片，讓地面在 ASCII 畫面裡有細節。
 * isFree(x, z) 回傳 false 的位置（建築、小路）不會長草。
 */
export function makeGrassField(count, bounds, rand, isFree) {
  const blade = new ConeGeometry(0.07, 0.5, 3);
  blade.translate(0, 0.25, 0);
  const grass = new InstancedMesh(blade, new MeshLambertMaterial({ color: 0xffffff }), count);
  const flowerCount = Math.round(count / 12);
  const flowers = new InstancedMesh(new IcosahedronGeometry(0.09, 0), new MeshLambertMaterial({ color: 0xffffff }), flowerCount);
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const sc = new Vector3();
  const greens = [0x2f6a3e, 0x3d7a45, 0x4b8a4a, 0x2a5a38, 0x5a8f4e];
  const petals = [0xf2b6c8, 0xf4f0e0, 0xe8c84a, 0xb8a0e8];
  const place = (mesh, n, colors, scaleFn, yOffset) => {
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 6; tries++) {
      const x = bounds.minX + rand() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + rand() * (bounds.maxZ - bounds.minZ);
      if (!isFree(x, z)) continue;
      e.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
      q.setFromEuler(e);
      const s = scaleFn();
      m.compose(p.set(x, yOffset, z), q, sc.set(s, s * (0.7 + rand() * 0.8), s));
      mesh.setMatrixAt(placed, m);
      mesh.setColorAt(placed, new Color(colors[Math.floor(rand() * colors.length)]));
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  };
  place(grass, count, greens, () => 0.7 + rand() * 0.9, 0);
  place(flowers, flowerCount, petals, () => 0.8 + rand() * 0.6, 0.32);
  const g = new Group();
  g.add(grass, flowers);
  return g;
}

/** 石砌煙囪（굴뚝），煙由 World 的粒子系統噴出 */
export function makeChimney() {
  const g = new Group();
  g.add(at(box(0.8, 0.4, 0.8, mats.darkStone), 0, 0.2, 0));
  g.add(at(cyl(0.3, 0.38, 2.2, mats.stone, 8), 0, 1.4, 0));
  g.add(at(cyl(0.36, 0.3, 0.2, mats.darkStone, 8), 0, 2.55, 0));
  return g;
}

/** 도깨비불（藍色鬼火） */
export function makeWisp(withLight) {
  const g = new Group();
  g.add(new Mesh(new SphereGeometry(0.22, 8, 6), mats.wisp));
  const halo = new Mesh(new SphereGeometry(0.4, 8, 6), new MeshBasicMaterial({ color: 0x2b6fb3, transparent: true, opacity: 0.35 }));
  g.add(halo);
  if (withLight) g.add(new PointLight(0x5aa8ff, 3, 7, 1.4));
  return g;
}

// ---------- 2.0 新增：금줄、池塘、腳印、甕、石階、踏腳石、落葉 ----------

/** 금줄（禁繩）：兩根木樁之間的稻草繩，掛著木炭、紅辣椒與白紙 */
export function makeRopeGate(width) {
  const g = new Group();
  const half = width / 2;
  for (const sx of [-1, 1]) g.add(at(cyl(0.12, 0.15, 1.6, mats.darkWood, 6), sx * half, 0.8, 0));
  const curve = new CatmullRomCurve3([
    new Vector3(-half, 1.35, 0),
    new Vector3(-half * 0.4, 1.05, 0),
    new Vector3(0, 0.98, 0),
    new Vector3(half * 0.4, 1.05, 0),
    new Vector3(half, 1.35, 0),
  ]);
  const rope = new Group();
  rope.add(new Mesh(new TubeGeometry(curve, 24, 0.05, 5), mats.straw));
  const charcoal = new MeshLambertMaterial({ color: 0x151515 });
  const pepper = new MeshLambertMaterial({ color: 0xd65f4c, emissive: 0x401010 });
  const paper = new MeshLambertMaterial({ color: 0xe2e8ef });
  for (let i = 1; i < 8; i++) {
    const p = curve.getPoint(i / 8);
    const kind = i % 3;
    if (kind === 0) rope.add(at(box(0.14, 0.12, 0.1, charcoal), p.x, p.y - 0.1, 0));
    else if (kind === 1) {
      const c = new Mesh(new ConeGeometry(0.05, 0.25, 5), pepper);
      c.rotation.x = Math.PI;
      rope.add(at(c, p.x, p.y - 0.16, 0));
    } else rope.add(at(box(0.08, 0.3, 0.01, paper), p.x, p.y - 0.18, 0));
  }
  g.add(rope);
  g.userData.rope = rope;
  return g;
}

/** 池塘：會泛起波光的水面（自訂 shader）＋一圈石頭與蘆葦 */
export function makePond(r, rand) {
  const g = new Group();
  const water = new Mesh(
    new CircleGeometry(r, 40),
    new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMoon: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime; uniform float uMoon; varying vec2 vP;
        void main(){
          float d = length(vP);
          float ripple = sin(d * 9.0 - uTime * 1.6) * 0.5 + 0.5;
          float sparkle = pow(max(0.0, sin(vP.x * 5.0 + uTime) * sin(vP.y * 6.0 - uTime * 1.3)), 6.0);
          vec3 deep = vec3(0.03, 0.06, 0.10);
          vec3 glint = mix(vec3(0.20, 0.42, 0.55), vec3(0.85, 0.82, 0.62), uMoon);
          // alpha 0.75 = 柔和表面（給 ASCII 的物件遮罩；原始 3D 模式不受影響）
          gl_FragColor = vec4(deep + glint * (ripple * 0.12 + sparkle * (0.5 + uMoon)), 0.75);
        }`,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.06;
  water.userData.noShadow = true;
  g.add(water);
  const n = Math.round(r * 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rock = new Mesh(new IcosahedronGeometry(0.28 + rand() * 0.18, 0), mats.stone);
    rock.scale.y = 0.6;
    g.add(at(rock, Math.cos(a) * (r + 0.15), 0.1, Math.sin(a) * (r + 0.15)));
  }
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    g.add(at(new Mesh(new ConeGeometry(0.04, 0.9 + rand() * 0.5, 3), mats.pine), Math.cos(a) * (r - 0.2), 0.5, Math.sin(a) * (r - 0.2)));
  }
  g.userData.water = water;
  return g;
}

/** 도깨비的發光腳印 */
export function makeFootprint() {
  const geom = new CircleGeometry(0.22, 10);
  geom.scale(0.75, 1.3, 1);
  const mesh = new Mesh(geom, new MeshBasicMaterial({ color: 0x67c5dc, transparent: true, opacity: 0.85 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.noShadow = true;
  return mesh;
}

/** 單一個甕（옹기），甕遊戲用 */
export function makeOnggi(scale = 1) {
  const g = new Group();
  const body = new Mesh(new SphereGeometry(0.34, 12, 10), mats.onggi);
  body.scale.set(1, 1.15, 1);
  g.add(at(body, 0, 0.38, 0));
  g.add(at(cyl(0.22, 0.26, 0.1, mats.darkWood, 12), 0, 0.78, 0));
  g.add(at(new Mesh(new SphereGeometry(0.06, 6, 4), mats.darkWood), 0, 0.86, 0));
  g.scale.setScalar(scale);
  return g;
}

/** 石階（往 -z 方向一階一階升高） */
export function makeSteps(count, width, rise, run) {
  const g = new Group();
  for (let i = 0; i < count; i++) g.add(at(box(width, rise * (i + 1), run, mats.stone), 0, (rise * (i + 1)) / 2, -i * run));
  return g;
}

/** 沿著小路排列的踏腳石（디딤돌）：points 為 [x, y, z] */
export function makeSteppingStones(points, rand) {
  const mesh = new InstancedMesh(new CylinderGeometry(0.32, 0.36, 0.08, 7), mats.stone, points.length);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const sc = new Vector3();
  points.forEach(([x, y, z], i) => {
    q.setFromEuler(new Euler(0, rand() * Math.PI, 0));
    const s = 0.8 + rand() * 0.5;
    m4.compose(new Vector3(x, y + 0.04, z), q, sc.set(s, 1, s * (0.8 + rand() * 0.3)));
    mesh.setMatrixAt(i, m4);
  });
  mesh.userData.noShadow = true;
  return mesh;
}

/** 散落的落葉：spots 為 [x, z] */
export function makeFallenLeaves(spots, rand, heightAt) {
  const geom = new PlaneGeometry(0.22, 0.14);
  geom.rotateX(-Math.PI / 2);
  const mesh = new InstancedMesh(geom, new MeshLambertMaterial({ color: 0xffffff, side: DoubleSide }), spots.length);
  const colors = [0xd65f4c, 0xd9873a, 0xc9a040, 0x8a5a2a];
  const m4 = new Matrix4();
  const q = new Quaternion();
  spots.forEach(([x, z], i) => {
    q.setFromEuler(new Euler((rand() - 0.5) * 0.3, rand() * Math.PI * 2, 0));
    m4.compose(new Vector3(x, heightAt(x, z) + 0.03, z), q, new Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, new Color(colors[Math.floor(rand() * colors.length)]));
  });
  mesh.userData.noShadow = true;
  return mesh;
}
