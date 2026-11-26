import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PointLight,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from 'three';
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
      g.add(at(box(1.2, 0.95, 0.08, winMat), sx * w * 0.24, 1.75, sz * (d / 2 + 0.04)));
      g.add(at(box(0.06, 0.95, 0.1, mats.darkWood), sx * w * 0.24, 1.75, sz * (d / 2 + 0.05)));
    }
  }

  // 門
  const side = door === 'east' ? 1 : -1;
  g.add(at(box(0.1, 1.75, 1.3, mats.darkWood), side * (w / 2 + 0.05), 1.38, 0));
  g.add(at(box(0.12, 0.5, 0.5, glow ? mats.paperGlow : mats.paperDim), side * (w / 2 + 0.06), 1.8, 0));
  // 門前石階
  g.add(at(box(0.9, 0.25, 1.6, mats.stone), side * (w / 2 + 0.85), 0.13, 0));

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
export function makeStoneLantern() {
  const g = new Group();
  g.add(at(box(0.95, 0.3, 0.95, mats.stone), 0, 0.15, 0));
  g.add(at(cyl(0.18, 0.22, 1.0, mats.stone, 8), 0, 0.8, 0));
  g.add(at(box(0.8, 0.14, 0.8, mats.stone), 0, 1.36, 0));
  const fireMat = new MeshBasicMaterial({ color: 0x1a1a1a });
  const fire = at(box(0.42, 0.42, 0.42, fireMat), 0, 1.65, 0);
  g.add(fire);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(0.1, 0.5, 0.1, mats.stone), sx * 0.27, 1.65, sz * 0.27));
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
      fireMat.color.setHex(on ? 0xffb04a : 0x1a1a1a);
      light.intensity = on ? 14 : 0;
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
    const strip = box(0.16, 0.9 + rand() * 0.5, 0.04, new MeshLambertMaterial({ color }));
    strip.rotation.y = -a;
    g.add(at(strip, Math.cos(a) * 1.0, 1.85, Math.sin(a) * 1.0));
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

/** 도깨비불（藍色鬼火） */
export function makeWisp(withLight) {
  const g = new Group();
  g.add(new Mesh(new SphereGeometry(0.22, 8, 6), mats.wisp));
  const halo = new Mesh(new SphereGeometry(0.4, 8, 6), new MeshBasicMaterial({ color: 0x2b6fb3, transparent: true, opacity: 0.35 }));
  g.add(halo);
  if (withLight) g.add(new PointLight(0x5aa8ff, 3, 7, 1.4));
  return g;
}
