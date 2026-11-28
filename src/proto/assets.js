import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { makeFlame } from '../world/Fire.js';

/**
 * 「斷橋與燈」4.0 的程序化美術資產。全部用程式產生（沒有外部模型或貼圖），
 * 風格：風格化低多邊形＋明確輪廓，靠光影、霧與材質層次建立氣氛（見 docs/v4/ART-BIBLE.md）。
 */

// ---------- 雜訊 ----------
function hash(x, y, z = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
const smooth = (t) => t * t * (3 - 2 * t);
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
export function fbm(x, y, seed = 0, oct = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * noise2(x * f, y * f, seed + i * 17);
    f *= 2.03;
    amp *= 0.5;
  }
  return v;
}
/** 可重現的亂數 */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- 材質 ----------
export const MAT = {
  rock: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
  ground: new MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  wood: new MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.85 }),
  woodDark: new MeshStandardMaterial({ color: 0x3f2b1f, roughness: 0.9 }),
  woodRed: new MeshStandardMaterial({ color: 0x7a3426, roughness: 0.8 }), // 석간주（紅土色）柱子
  woodGreen: new MeshStandardMaterial({ color: 0x3e6a58, roughness: 0.8 }), // 뇌록（青綠）樑底
  stone: new MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.92, flatShading: true }),
  stoneLight: new MeshStandardMaterial({ color: 0xa8a69e, roughness: 0.9, flatShading: true }),
  plaster: new MeshStandardMaterial({ color: 0xd9d2c0, roughness: 1 }),
  tile: new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
  rope: new MeshStandardMaterial({ color: 0xa88a5a, roughness: 1 }),
  iron: new MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.6, metalness: 0.6 }),
  pine: new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
  bark: new MeshStandardMaterial({ color: 0x5b3a2a, roughness: 1, flatShading: true }),
  void: new MeshBasicMaterial({ color: 0x03050a }),
};

const at = (obj, x, y, z) => {
  obj.position.set(x, y, z);
  return obj;
};
export function shadow(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => at(new Mesh(new BoxGeometry(w, h, d), mat), x, y, z);
const cyl = (rt, rb, h, seg, mat, x = 0, y = 0, z = 0) => at(new Mesh(new CylinderGeometry(rt, rb, h, seg), mat), x, y, z);

/** 兩點之間的一段（繩子、木條）：沿著 a→b 放一個圓柱 */
const UP = new Vector3(0, 1, 0);
export function segment(mesh, a, b) {
  const d = new Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  mesh.scale.set(1, Math.max(len, 1e-3), 1);
  return mesh;
}
export const ropeMesh = (r = 0.025, mat = MAT.rope) => new Mesh(new CylinderGeometry(r, r, 1, 6), mat);

function setColors(geom, fn) {
  const pos = geom.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v, c, i);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geom.setAttribute('color', new Float32BufferAttribute(col, 3));
}

// ---------- 地形 ----------

/**
 * 懸崖壁：垂直的岩壁，沿法線做雜訊位移＋水平岩層，頂端長青苔。
 * along：'x'（沿 x 軸延伸，面向 ±z）或 'z'（沿 z 軸延伸，面向 ±x）
 */
export function makeCliff({ along = 'x', from, to, at: offset, facing = 1, top = 0, bottom = -16, seed = 1 }) {
  const len = Math.abs(to - from);
  const geom = new PlaneGeometry(len, top - bottom, Math.max(4, Math.round(len * 2.2)), 26);
  const pos = geom.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const y = v.y + (top + bottom) / 2; // 世界高度
    const u = v.x + (from + to) / 2;
    const depth = -y; // 0 在頂端
    const edge = Math.min(1, depth / 0.6); // 頂端邊緣不位移，和地面接得起來
    const strata = 0.22 * Math.sin(y * 2.4 + fbm(u * 0.3, y * 0.2, seed) * 3);
    const n = (fbm(u * 0.35, y * 0.5, seed) - 0.5) * 1.6 + strata;
    const overhang = 0.4 * Math.sin(depth * 0.35 + u * 0.15) * Math.min(1, depth / 3);
    pos.setZ(i, (n + overhang) * edge);
  }
  geom.computeVertexNormals();
  setColors(geom, (p, c) => {
    const y = p.y + (top + bottom) / 2;
    const band = 0.5 + 0.5 * Math.sin(y * 2.4 + fbm(p.x * 0.2, y * 0.3, seed + 3) * 4);
    const base = new Color(0x3b3f47).lerp(new Color(0x5a5049), band * 0.6);
    const depthDark = Math.min(1, -y / 14);
    base.multiplyScalar(1 - depthDark * 0.55);
    if (y > -0.9) base.lerp(new Color(0x34502f), (1 - (-y / 0.9)) * 0.85 * fbm(p.x, y, seed + 9) * 1.4); // 頂端青苔
    c.copy(base);
  });
  const mesh = new Mesh(geom, MAT.rock);
  mesh.position.y = (top + bottom) / 2;
  if (along === 'x') {
    mesh.position.x = (from + to) / 2;
    mesh.position.z = offset;
    if (facing < 0) mesh.rotation.y = Math.PI;
  } else {
    mesh.position.z = (from + to) / 2;
    mesh.position.x = offset;
    mesh.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  mesh.receiveShadow = true;
  return mesh;
}

/** 平台頂面：平的（玩法高度 0），顏色有草地、泥土、青苔的變化 */
export function makeGround(minX, maxX, minZ, maxZ, seed = 2, pathFn = null) {
  const w = maxX - minX;
  const d = maxZ - minZ;
  const geom = new PlaneGeometry(w, d, Math.round(w * 1.5), Math.round(d * 1.5));
  geom.rotateX(-Math.PI / 2);
  geom.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  setColors(geom, (p, c) => {
    const n = fbm(p.x * 0.25, p.z * 0.25, seed);
    c.set(0x2c3b2a).lerp(new Color(0x4a4a36), n * 0.9);
    const m = fbm(p.x * 0.9, p.z * 0.9, seed + 5);
    if (m > 0.62) c.lerp(new Color(0x3d5a33), (m - 0.62) * 2);
    if (pathFn) c.lerp(new Color(0x5c5a52), pathFn(p.x, p.z) * 0.7);
  });
  const mesh = new Mesh(geom, MAT.ground);
  mesh.receiveShadow = true;
  mesh.userData.walkable = true;
  return mesh;
}

/** 石板路：每塊略有大小、角度、高度變化 */
export function makePath(points, { width = 1.4, step = 0.62, seed = 5 } = {}) {
  const r = rng(seed);
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(p[0], 0, p[1])));
  const len = curve.getLength();
  const n = Math.round(len / step);
  const geom = new BoxGeometry(1, 0.08, 1);
  const mesh = new InstancedMesh(geom, MAT.stoneLight, n * 2);
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Object3D();
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const side = new Vector3(-tan.z, 0, tan.x);
    const pieces = r() < 0.45 ? 2 : 1;
    for (let j = 0; j < pieces; j++) {
      const off = pieces === 2 ? (j - 0.5) * width * 0.5 : (r() - 0.5) * 0.2;
      e.position.copy(p).addScaledVector(side, off);
      e.position.y = 0.01 + r() * 0.015;
      e.rotation.set(0, Math.atan2(tan.x, tan.z) + (r() - 0.5) * 0.35, 0);
      const sw = pieces === 2 ? width * 0.45 : width * (0.75 + r() * 0.2);
      e.scale.set(sw, 1, step * (0.75 + r() * 0.2));
      e.updateMatrix();
      mesh.setMatrixAt(k++, e.matrix);
    }
  }
  mesh.count = k;
  mesh.receiveShadow = true;
  void m;
  void q;
  return mesh;
}

/** 岩石：雜訊變形的多面體 */
export function makeRock(size = 1, seed = 1, mat = MAT.stone) {
  const geom = new IcosahedronGeometry(size, 1);
  const pos = geom.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 0.75 + 0.5 * fbm(v.x * 1.3 + seed, v.z * 1.3, seed);
    v.multiplyScalar(n);
    v.y *= 0.62;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geom.computeVertexNormals();
  const mesh = new Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 韓國赤松（소나무）：彎曲的樹幹、扁平分層的樹冠。回傳 { group, clumps }（clumps 隨風擺） */
export function makePine(seed = 1, height = 6) {
  const r = rng(seed);
  const group = new Group();
  const lean = (r() - 0.5) * 0.9;
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push(new Vector3(Math.sin(t * 2.2 + seed) * 0.45 * t + lean * t * t * 1.6, t * height, Math.cos(t * 1.7 + seed) * 0.3 * t));
  }
  const curve = new CatmullRomCurve3(pts);
  const trunkGeom = new TubeGeometry(curve, 16, 0.16, 6, false);
  // 樹幹往上變細
  const tp = trunkGeom.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < tp.count; i++) {
    v.fromBufferAttribute(tp, i);
    const t = Math.max(0, Math.min(1, v.y / height));
    const c = curve.getPointAt(t);
    const k = 1.15 - 0.75 * t;
    tp.setXYZ(i, c.x + (v.x - c.x) * k, v.y, c.z + (v.z - c.z) * k);
  }
  trunkGeom.computeVertexNormals();
  group.add(new Mesh(trunkGeom, MAT.bark));
  const clumps = [];
  const layers = 3 + Math.floor(r() * 2);
  for (let i = 0; i < layers; i++) {
    const t = 0.55 + (i / layers) * 0.45;
    const c = curve.getPointAt(Math.min(1, t));
    const pivot = new Group();
    pivot.position.copy(c);
    const ang = r() * Math.PI * 2;
    const reach = (1 - t) * 2.2 + 0.4;
    const g = new IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      v.fromBufferAttribute(p, j);
      const n = 0.8 + 0.4 * noise2(v.x * 2 + seed, v.z * 2 + i, seed);
      p.setXYZ(j, v.x * 1.45 * n, v.y * 0.42 * n, v.z * 1.25 * n);
    }
    g.computeVertexNormals();
    setColors(g, (q, col) => col.set(0x1d3a2c).lerp(new Color(0x2f5a3c), Math.max(0, q.y) * 1.6));
    const blob = new Mesh(g, MAT.pine);
    blob.position.set(Math.cos(ang) * reach, 0.15, Math.sin(ang) * reach);
    blob.scale.setScalar(0.75 + (1 - t) * 0.9);
    pivot.add(blob);
    // 支撐的枝幹
    const branch = segment(new Mesh(new CylinderGeometry(0.045, 0.07, 1, 5), MAT.bark), new Vector3(), blob.position.clone().multiplyScalar(0.85));
    pivot.add(branch);
    pivot.userData.phase = r() * Math.PI * 2;
    pivot.userData.stiff = 0.6 + r() * 0.5;
    group.add(pivot);
    clumps.push(pivot);
  }
  shadow(group);
  return { group, clumps };
}

/**
 * 草：InstancedMesh 草葉，頂點著色器依共用風場擺動（峽谷附近受陣風影響更大）。
 * uniforms：uTime、uGust（峽谷陣風 × 閘門倍率）、uAmbient
 */
export function makeGrass(count, place, { ravine }) {
  const geom = new PlaneGeometry(0.06, 0.42, 1, 3);
  geom.translate(0, 0.21, 0);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 0.42;
    pos.setX(i, pos.getX(i) * (1 - y * 0.85));
  }
  const mat = new MeshStandardMaterial({ color: 0x5f7a4a, roughness: 1, side: DoubleSide });
  const uniforms = { uTime: { value: 0 }, uGust: { value: 0 }, uAmbient: { value: 0.25 }, uRavine: { value: new Vector2(ravine.minZ, ravine.maxZ) } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGust;\nuniform float uAmbient;\nuniform vec2 uRavine;\nvarying float vH;')
      .replace(
        '#include <project_vertex>',
        `vec4 wp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
wp = instanceMatrix * wp;
#endif
float h = position.y / 0.42;
vH = h;
float dz = max(0.0, max(uRavine.x - wp.z, wp.z - uRavine.y));
float near = exp(-dz * dz * 0.06);
float flutter = sin(uTime * 3.1 + wp.x * 1.7 + wp.z * 1.3) * 0.5 + 0.5;
float amp = (uAmbient * (0.6 + 0.4 * flutter) + uGust * near * (0.9 + 0.4 * flutter)) * h * h;
wp.x -= amp * 0.55;
wp.z += amp * 0.12 * sin(uTime * 1.7 + wp.x);
wp.y -= amp * amp * 0.08;
vec4 mvPosition = modelViewMatrix * wp;
gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( mix(diffuse * 0.45, diffuse * 1.15, vH), opacity );');
  };
  const mesh = new InstancedMesh(geom, mat, count);
  const e = new Object3D();
  let k = 0;
  const r = rng(77);
  for (let i = 0; i < count * 4 && k < count; i++) {
    const p = place(r);
    if (!p) continue;
    e.position.set(p.x, 0, p.z);
    e.rotation.set(0, r() * Math.PI, 0);
    const s = 0.6 + r() * 0.8;
    e.scale.set(s, s * (0.7 + r() * 0.6), s);
    e.updateMatrix();
    mesh.setMatrixAt(k++, e.matrix);
  }
  mesh.count = k;
  mesh.userData.fullCount = k;
  mesh.receiveShadow = true;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

// ---------- 霧、月亮、遠山 ----------

function noiseTexture(size = 128, seed = 3, soft = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 可平鋪：在環面上取樣
      const a = (x / size) * Math.PI * 2;
      const b = (y / size) * Math.PI * 2;
      const n = fbm(Math.cos(a) * 1.6 + 3, Math.sin(a) * 1.6 + Math.cos(b) * 1.6, seed, 5) * 0.6 + fbm(Math.sin(b) * 2 + 7, Math.cos(a + b) * 2, seed + 1, 4) * 0.4;
      const v = soft ? Math.max(0, Math.min(1, (n - 0.35) * 2.4)) : n;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** 峽谷底部的薄霧：幾層隨風緩慢流動的半透明平面 */
export function makeMist({ minX, maxX, minZ, maxZ }) {
  const group = new Group();
  const tex = noiseTexture(128, 11);
  const layers = [];
  for (const [y, op, scale] of [
    [-3.2, 0.09, 2.2],
    [-6, 0.18, 3],
    [-9.5, 0.34, 3.6],
  ]) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(((maxX - minX) / 10) * (scale / 3), ((maxZ - minZ) / 10) * (scale / 3));
    const mat = new MeshBasicMaterial({ color: 0x6a7c9c, map: t, transparent: true, opacity: op, depthWrite: false, fog: true });
    const m = new Mesh(new PlaneGeometry(maxX - minX, maxZ - minZ), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
    m.renderOrder = 2;
    m.userData.noShadow = true;
    group.add(m);
    layers.push({ mesh: m, tex: t, speed: 0.008 + Math.abs(y) * 0.002 });
  }
  return { group, layers };
}

function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}
export const GLOW_TEXTURE = /* @__PURE__ */ (() => (typeof document === 'undefined' ? null : glowTexture()))();

export function makeMoon() {
  const group = new Group();
  const disc = new Mesh(new SphereGeometry(5, 24, 16), new MeshBasicMaterial({ color: new Color(1.6, 1.55, 1.4), fog: false }));
  group.add(disc);
  const halo = new Mesh(new PlaneGeometry(40, 40), new MeshBasicMaterial({ map: GLOW_TEXTURE, color: 0x7f9bd6, transparent: true, opacity: 0.45, depthWrite: false, blending: AdditiveBlending, fog: false }));
  group.add(halo);
  group.userData.halo = halo;
  group.userData.disc = disc;
  return group;
}

/** 遠山剪影：幾層鋸齒狀的平面，越遠越淡 */
export function makeMountains(seed = 4) {
  const group = new Group();
  const layers = [
    { z: -70, h: 26, color: 0x182335, w: 220 },
    { z: -48, h: 16, color: 0x121b29, w: 180 },
  ];
  for (const [i, L] of layers.entries()) {
    const n = 60;
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const x = -L.w / 2 + (k / n) * L.w;
      const y = L.h * (0.35 + 0.65 * fbm(k * 0.18, i * 3, seed + i, 4)) * (0.6 + 0.4 * Math.cos((k / n - 0.5) * Math.PI));
      pts.push([x, y]);
    }
    const pos = [];
    for (let k = 0; k < n; k++) {
      const [x0, y0] = pts[k];
      const [x1, y1] = pts[k + 1];
      pos.push(x0, -20, 0, x1, -20, 0, x1, y1, 0, x0, -20, 0, x1, y1, 0, x0, y0, 0);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new Mesh(g, new MeshBasicMaterial({ color: L.color, fog: true }));
    m.position.z = L.z;
    group.add(m);
  }
  return group;
}

// ---------- 斷橋 ----------

/** 一段橋板（沿 z 排列），回傳 InstancedMesh；broken：最後幾片參差不齊 */
export function makePlanks(z0, z1, { width = 1.5, seed = 9, broken = 0, mat = MAT.wood, thickness = 0.07 } = {}) {
  const r = rng(seed);
  const pitch = 0.3;
  const n = Math.max(1, Math.round(Math.abs(z1 - z0) / pitch));
  const mesh = new InstancedMesh(new BoxGeometry(1, thickness, 0.26), mat, n);
  const e = new Object3D();
  const dir = Math.sign(z1 - z0);
  for (let i = 0; i < n; i++) {
    const z = z0 + dir * (i + 0.5) * pitch;
    const k = broken ? Math.max(0, (i - (n - broken)) / broken) : 0;
    const w = width * (1 - k * (0.3 + r() * 0.5));
    e.position.set((r() - 0.5) * 0.06 + (k ? (r() - 0.5) * 0.4 * k : 0), -thickness / 2 - k * r() * 0.08, z);
    e.rotation.set(k * (r() - 0.5) * 0.25, (r() - 0.5) * 0.04, k * (r() - 0.5) * 0.3);
    e.scale.set(w, 1, 1);
    e.updateMatrix();
    mesh.setMatrixAt(i, e.matrix);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.walkable = true;
  return mesh;
}

/** 橋頭木柱（含繩結） */
export function makeBridgePost(x, z) {
  const g = new Group();
  g.add(cyl(0.09, 0.11, 1.35, 7, MAT.woodDark, 0, 0.55, 0));
  g.add(at(new Mesh(new TorusGeometry(0.11, 0.03, 5, 10), MAT.rope), 0, 0.95, 0));
  g.children[1].rotation.x = Math.PI / 2;
  g.position.set(x, 0, z);
  return shadow(g);
}

/** 下垂的繩子：a 到 b，中間下垂 sag 公尺 */
export function makeRope(a, b, sag = 0.2, r = 0.022, mat = MAT.rope, dangle = null) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= sag;
  const pts = dangle ? [a, a.clone().lerp(dangle, 0.5).add(new Vector3(0, -0.1, 0)), dangle] : [a, a.clone().lerp(mid, 0.5).add(new Vector3(0, -sag * 0.25, 0)), mid, b.clone().lerp(mid, 0.5).add(new Vector3(0, -sag * 0.25, 0)), b];
  const mesh = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 20, r, 5, false), mat);
  mesh.castShadow = true;
  return mesh;
}

// ---------- 石碑 ----------

/** 刻在石碑上的圖案（白色線條、透明背景） */
export function drawPictogram(kind, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / 512;
  g.scale(s, s);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineWidth = 26;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (kind === 'eye') {
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
    g.lineWidth = 18;
    // 下半：閘門（垂直的木條擋板）從上方降下，擋住風
    g.strokeRect(362, 290, 110, 190);
    for (const x of [390, 418, 446]) {
      g.beginPath();
      g.moveTo(x, 290);
      g.lineTo(x, 480);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(417, 290);
    g.lineTo(417, 250);
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
  return c;
}

/** 石材表面：顆粒、裂縫、淺淺的刮痕（還沒顯影前，玩家看得到「好像刻了什麼」） */
function stoneFaceTexture(seed) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = '#7d7f84';
  g.fillRect(0, 0, 256, 384);
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.floor(r() * 70);
    g.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + r() * 0.3})`;
    g.fillRect(r() * 256, r() * 384, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  // 青苔（下緣、角落）
  for (let i = 0; i < 160; i++) {
    const y = 384 - Math.pow(r(), 2) * 120;
    g.fillStyle = `rgba(${50 + r() * 30},${80 + r() * 40},${45 + r() * 20},${0.25 + r() * 0.35})`;
    g.beginPath();
    g.arc(r() * 256, y, 2 + r() * 7, 0, Math.PI * 2);
    g.fill();
  }
  // 裂縫
  g.strokeStyle = 'rgba(30,30,34,0.7)';
  g.lineWidth = 1.6;
  for (let k = 0; k < 4; k++) {
    let x = r() * 256;
    let y = r() < 0.5 ? 0 : r() * 384;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 7; j++) {
      x += (r() - 0.5) * 40;
      y += 12 + r() * 28;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // 淺刻痕：讓人覺得「上面好像有東西」
  g.strokeStyle = 'rgba(205,200,185,0.28)';
  g.lineWidth = 2;
  for (let k = 0; k < 9; k++) {
    g.beginPath();
    const x = 50 + r() * 156;
    const y = 90 + r() * 200;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - 0.5) * 80, y + (r() - 0.5) * 60, x + (r() - 0.5) * 90, y + (r() - 0.5) * 80);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * 石碑：碑座、碑身（侵蝕的邊緣）、顯影用的刻紋層。
 * 刻紋顯影用「照到的地方才浮現」的遮罩（revealCanvas），由調查時的燈光掃過。
 * 回傳 { group, face（碑面中心，世界座標由 group 換算）, reveal(u, v, radius, amount), coverage(), carve }
 */
export function makeStele(kind, seed = 3) {
  const group = new Group();
  const W = 1.25;
  const H = 1.9;
  const D = 0.32;
  group.add(shadow(box(1.7, 0.28, 0.75, MAT.stone, 0, 0.14, 0)));
  const geom = new BoxGeometry(W, H, D, 6, 10, 2);
  const pos = geom.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const edge = Math.max(Math.abs(v.x) / (W / 2), Math.abs(v.y) / (H / 2));
    const n = (fbm(v.x * 3 + seed, v.y * 3, seed) - 0.5) * 0.05 * edge * edge;
    // 頂端圓弧
    const topRound = v.y > H / 2 - 0.25 ? -Math.pow(Math.abs(v.x) / (W / 2), 3) * 0.12 : 0;
    pos.setXYZ(i, v.x + n, v.y + topRound + n * 0.5, v.z + (Math.abs(v.z) > 0 ? n : 0));
  }
  geom.computeVertexNormals();
  const faceTex = stoneFaceTexture(seed);
  const bodyMat = new MeshStandardMaterial({ color: 0xffffff, map: faceTex, roughness: 0.95 });
  const body = new Mesh(geom, bodyMat);
  body.position.y = 0.28 + H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // 刻紋層：圖案 × 顯影遮罩
  const pic = drawPictogram(kind, 256);
  const picCtx = pic.getContext('2d');
  const picData = picCtx.getImageData(0, 0, 256, 256).data;
  const mask = document.createElement('canvas');
  mask.width = mask.height = 128;
  const mctx = mask.getContext('2d');
  const out = document.createElement('canvas');
  out.width = out.height = 256;
  const octx = out.getContext('2d');
  const carveTex = new CanvasTexture(out);
  carveTex.colorSpace = SRGBColorSpace;
  const carveMat = new MeshStandardMaterial({
    color: 0x3a3226,
    emissive: 0xffc060,
    emissiveMap: carveTex,
    emissiveIntensity: 0,
    alphaMap: carveTex,
    transparent: true,
    depthWrite: false,
    roughness: 1,
  });
  const carve = new Mesh(new PlaneGeometry(1.0, 1.0), carveMat);
  carve.position.set(0, 0.28 + H * 0.55, D / 2 + 0.006);
  carve.userData.noShadow = true;
  group.add(carve);
  let inkCount = 0;
  for (let i = 3; i < picData.length; i += 16) if (picData[i] > 128) inkCount++;
  let dirty = true;
  const api = {
    group,
    body,
    carve,
    kind,
    width: W,
    height: H,
    /** 碑面上的刻紋區（區域座標）：中心與半邊長 */
    carveCenter: carve.position.clone(),
    carveHalf: 0.5,
    /** 在 (u, v)（0–1，左上為 0）位置顯影 */
    reveal(u, vv, radius = 0.16, amount = 0.5) {
      const x = u * 128;
      const y = vv * 128;
      const grd = mctx.createRadialGradient(x, y, 0, x, y, radius * 128);
      grd.addColorStop(0, `rgba(255,255,255,${Math.min(1, amount)})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      mctx.fillStyle = grd;
      mctx.fillRect(x - radius * 128, y - radius * 128, radius * 256, radius * 256);
      dirty = true;
    },
    /** 已顯影的比例（只算刻紋的筆畫） */
    coverage() {
      const m = mctx.getImageData(0, 0, 128, 128).data;
      let hit = 0;
      let k = 0;
      for (let y = 0; y < 256; y += 2) {
        for (let x = 0; x < 256; x += 2) {
          const pi = (y * 256 + x) * 4 + 3;
          if (picData[pi] > 128) {
            const mi = ((y >> 1) * 128 + (x >> 1)) * 4 + 3;
            if (m[mi] > 140) hit++;
            k++;
          }
        }
      }
      return k ? hit / k : 0;
    },
    /** 直接全部顯影（已經看過的石碑再調查時） */
    revealAll() {
      mctx.fillStyle = '#fff';
      mctx.fillRect(0, 0, 128, 128);
      dirty = true;
    },
    /** 每格：把遮罩 × 圖案合成到刻紋貼圖；glow 是顯影的亮度（燈光照著時較亮） */
    update(glow) {
      carveMat.emissiveIntensity = glow;
      if (!dirty) return;
      dirty = false;
      octx.clearRect(0, 0, 256, 256);
      octx.globalCompositeOperation = 'source-over';
      octx.drawImage(pic, 0, 0);
      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(mask, 0, 0, 256, 256);
      // alphaMap 讀綠色通道：轉成白色
      octx.globalCompositeOperation = 'source-in';
      octx.fillStyle = '#fff';
      octx.fillRect(0, 0, 256, 256);
      carveTex.needsUpdate = true;
    },
    pictogramDataUrl: () => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#2b2d33';
      g.fillRect(0, 0, 128, 128);
      g.globalCompositeOperation = 'source-over';
      const tint = document.createElement('canvas');
      tint.width = tint.height = 256;
      const tg = tint.getContext('2d');
      tg.drawImage(pic, 0, 0);
      tg.globalCompositeOperation = 'source-in';
      tg.fillStyle = '#ffd48a';
      tg.fillRect(0, 0, 256, 256);
      g.drawImage(tint, 8, 8, 112, 112);
      return c.toDataURL();
    },
    inkCount,
  };
  return api;
}

// ---------- 火盆 ----------
export function makeBrazier() {
  const group = new Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = segment(new Mesh(new CylinderGeometry(0.035, 0.035, 1, 5), MAT.iron), new Vector3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42), new Vector3(Math.cos(a) * 0.22, 0.62, Math.sin(a) * 0.22));
    group.add(leg);
  }
  const bowlPts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    bowlPts.push(new Vector2(0.12 + Math.sin(t * Math.PI * 0.5) * 0.42, 0.55 + t * 0.28));
  }
  bowlPts.push(new Vector2(0.56, 0.83));
  group.add(new Mesh(new LatheGeometry(bowlPts, 12), MAT.iron));
  const r = rng(21);
  for (let i = 0; i < 5; i++) {
    const log = segment(new Mesh(new CylinderGeometry(0.05, 0.05, 1, 6), MAT.woodDark), new Vector3((r() - 0.5) * 0.5, 0.78, (r() - 0.5) * 0.5), new Vector3((r() - 0.5) * 0.5, 0.86, (r() - 0.5) * 0.5));
    group.add(log);
  }
  const embers = new Mesh(new SphereGeometry(0.3, 10, 6), new MeshBasicMaterial({ color: new Color(1.3, 0.42, 0.1) }));
  embers.scale.y = 0.25;
  embers.position.y = 0.8;
  group.add(embers);
  shadow(group);
  embers.castShadow = false;
  const flame = makeFlame({ height: 0.95, width: 0.55 });
  flame.group.position.y = 0.8;
  group.add(flame.group);
  const light = new PointLight(0xff9a48, 7, 11, 1.6);
  light.position.y = 1.3;
  group.add(light);
  return { group, flame, light, embers };
}

// ---------- 絞盤與閘門 ----------

/**
 * 絞盤：A 字木架、轉軸、繞了繩子的捲筒、大小齒輪、止逆棘爪、手柄。
 * 轉軸沿 x 軸；手柄軸在捲筒北側、同一個高度（孩子站著就搆得到），手柄在西端（玩家站的那一側，左手轉）。
 * 回傳 { group, setAngle(handleAngle), handleWorld(out), drumRadius, ratio }
 */
export function makeWinch() {
  const group = new Group();
  const H = 0.95; // 轉軸高度（孩子的腰到胸口）
  const CZ = -0.42; // 手柄軸在捲筒北側（兩個齒輪半徑和）
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.32, 0.32]) group.add(segment(new Mesh(new CylinderGeometry(0.05, 0.06, 1, 6), MAT.woodDark), new Vector3(x, 0, z), new Vector3(x, H + 0.08, 0)));
    group.add(box(0.12, 0.1, 0.8, MAT.woodDark, x, 0.05, 0));
  }
  group.add(box(0.95, 0.1, 0.12, MAT.woodDark, 0, 0.05, 0.36));
  group.add(box(0.95, 0.1, 0.12, MAT.woodDark, 0, 0.05, -0.36));
  // 捲筒（轉）
  const drum = new Group();
  drum.position.set(0.05, H, 0);
  const drumR = 0.17;
  const dm = cyl(drumR, drumR, 0.62, 12, MAT.wood);
  dm.rotation.z = Math.PI / 2;
  drum.add(dm);
  for (const x of [-0.32, 0.32]) {
    const rim = cyl(0.24, 0.24, 0.05, 12, MAT.woodDark, x, 0, 0);
    rim.rotation.z = Math.PI / 2;
    drum.add(rim);
  }
  // 繞在捲筒上的繩圈
  const wraps = new Group();
  for (let i = 0; i < 7; i++) {
    const w = new Mesh(new TorusGeometry(drumR + 0.02, 0.022, 4, 14), MAT.rope);
    w.rotation.y = Math.PI / 2;
    w.position.x = -0.24 + i * 0.075;
    wraps.add(w);
  }
  drum.add(wraps);
  // 捲筒上的小齒輪
  const gearSmallDrum = new Group();
  const gs = cyl(0.13, 0.13, 0.05, 10, MAT.iron);
  gs.rotation.z = Math.PI / 2;
  gearSmallDrum.add(gs);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    gearSmallDrum.add(box(0.05, 0.045, 0.045, MAT.iron, 0, Math.cos(a) * 0.145, Math.sin(a) * 0.145));
  }
  gearSmallDrum.position.x = 0.38;
  drum.add(gearSmallDrum);
  group.add(drum);
  // 手柄軸（帶大齒輪：手柄轉一圈，捲筒轉 2.3 圈）
  const crank = new Group();
  crank.position.set(-0.05, H, CZ);
  const shaft = cyl(0.03, 0.03, 1.05, 8, MAT.iron);
  shaft.rotation.z = Math.PI / 2;
  crank.add(shaft);
  const gearBig = cyl(0.29, 0.29, 0.05, 20, MAT.iron, 0.43, 0, 0);
  gearBig.rotation.z = Math.PI / 2;
  crank.add(gearBig);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    crank.add(box(0.05, 0.05, 0.05, MAT.iron, 0.43, Math.cos(a) * 0.31, Math.sin(a) * 0.31));
  }
  // 手柄：曲臂＋握把（西側）
  const ARM = 0.2;
  crank.add(box(0.04, ARM + 0.06, 0.06, MAT.iron, -0.53, ARM / 2, 0));
  const grip = cyl(0.028, 0.028, 0.2, 8, MAT.wood, -0.63, ARM, 0);
  grip.rotation.z = Math.PI / 2;
  crank.add(grip);
  group.add(crank);
  // 支撐手柄軸的立柱（兩根）
  for (const x of [-0.44, 0.3]) group.add(box(0.08, H + 0.04, 0.08, MAT.woodDark, x, (H + 0.04) / 2, CZ));
  group.add(box(0.95, 0.1, 0.1, MAT.woodDark, 0, 0.05, CZ));
  // 止逆棘爪
  const pawl = box(0.04, 0.16, 0.04, MAT.iron, 0.38, H + 0.36, 0.05);
  pawl.rotation.x = 0.4;
  group.add(pawl);
  shadow(group);
  const ratio = 2.3;
  const local = new Vector3();
  return {
    group,
    drum,
    crank,
    pawl,
    drumRadius: drumR + 0.02,
    ratio,
    axleHeight: H,
    /** 手柄角度（弧度）：捲筒反方向、以齒輪比轉動；棘爪每齒跳一下 */
    setAngle(a) {
      crank.rotation.x = a;
      drum.rotation.x = -a * ratio;
      pawl.rotation.x = 0.4 + 0.12 * Math.abs(Math.sin(a * ratio * 4.5));
    },
    /** 握把在世界座標的位置（手部 IK 目標） */
    handleWorld(out) {
      local.set(-0.6, ARM, 0);
      return crank.localToWorld(out.copy(local));
    },
  };
}

/**
 * 擋風閘門：橫跨峽谷的高木架、上方的滑輪、垂直木條擋板（從上方降下關閉）。
 * 繩子：絞盤 → 南柱頂滑輪 → 橫樑 → 擋板兩個吊點。
 * open01：1 = 擋板拉到上方（風吹得進來），0 = 降下擋住峽谷。
 */
export function makeWindGate({ x, zSouth, zNorth, winchDrumWorld }) {
  const group = new Group();
  const H = 10;
  const posts = [zSouth + 0.5, zNorth - 0.5];
  for (const z of posts) {
    group.add(box(0.5, H + 1, 0.5, MAT.woodDark, x, (H + 1) / 2 - 1, z));
    // 斜撐
    group.add(segment(new Mesh(new CylinderGeometry(0.1, 0.12, 1, 6), MAT.woodDark), new Vector3(x - 1.6, 0, z), new Vector3(x, 4, z)));
    group.add(segment(new Mesh(new CylinderGeometry(0.1, 0.12, 1, 6), MAT.woodDark), new Vector3(x + 1.6, 0, z), new Vector3(x, 4, z)));
  }
  const beamLen = posts[0] - posts[1] + 0.8;
  group.add(box(0.6, 0.55, beamLen, MAT.woodDark, x, H, (posts[0] + posts[1]) / 2));
  group.add(box(0.75, 0.18, beamLen + 0.5, MAT.wood, x, H + 0.36, (posts[0] + posts[1]) / 2));
  // 擋板
  const width = zSouth - zNorth - 0.3;
  const height = 7.2;
  const shutter = new Group();
  const n = 14;
  for (let i = 0; i < n; i++) {
    const z = -width / 2 + ((i + 0.5) / n) * width;
    shutter.add(box(0.14, height * (0.97 + 0.03 * Math.sin(i * 7.3)), width / n - 0.03, i % 2 ? MAT.wood : MAT.woodDark, 0, -height / 2, z));
  }
  for (const y of [-0.5, -height / 2, -height + 0.6]) shutter.add(box(0.24, 0.26, width, MAT.woodDark, 0.02, y, 0));
  shutter.position.set(x, 0, (zSouth + zNorth) / 2);
  group.add(shutter);
  // 滑輪
  const pulleys = [];
  const pulley = (px, py, pz) => {
    const p = new Group();
    const wheel = cyl(0.22, 0.22, 0.1, 12, MAT.iron);
    wheel.rotation.x = Math.PI / 2;
    p.add(wheel);
    p.add(box(0.06, 0.5, 0.06, MAT.iron, 0, 0.2, 0));
    p.position.set(px, py, pz);
    group.add(p);
    pulleys.push(p);
    return p;
  };
  const hangZ = [(zSouth + zNorth) / 2 + width * 0.3, (zSouth + zNorth) / 2 - width * 0.3];
  const pTop = pulley(x - 0.45, H - 0.35, posts[0]);
  const pA = pulley(x - 0.45, H - 0.35, hangZ[0]);
  const pB = pulley(x - 0.45, H - 0.35, hangZ[1]);
  // 繩子（每格更新）
  const ropes = { lead: ropeMesh(0.03), beam: ropeMesh(0.03), dropA: ropeMesh(0.03), dropB: ropeMesh(0.03) };
  for (const r of Object.values(ropes)) group.add(r);
  // 布條（祭壇用的五色布，跟著風飄）：掛在南柱上
  const cloths = [];
  const clothColors = [0x3d63c9, 0xc8402e, 0xe0c050, 0xeeeeee, 0x1e1e22]; // 오방색：青、赤、黃、白、黑
  for (let i = 0; i < 5; i++) {
    const pivot = new Group();
    pivot.position.set(x - 0.3, 3.2 - i * 0.05, posts[0] - 0.2 + i * 0.1);
    const c = new Mesh(new PlaneGeometry(0.16, 1.1, 1, 4), new MeshStandardMaterial({ color: clothColors[i], side: DoubleSide, roughness: 1 }));
    c.position.y = -0.55;
    pivot.add(c);
    pivot.userData.phase = i * 1.3;
    group.add(pivot);
    cloths.push(pivot);
  }
  shadow(group);
  const OPEN_Y = height + 1.4; // 擋板底部在地面上方 1.4 公尺
  const CLOSED_Y = 1.2;
  const travel = OPEN_Y - CLOSED_Y;
  const tmpA = new Vector3();
  const tmpB = new Vector3();
  let lastOpen = null;
  const api = {
    group,
    shutter,
    cloths,
    pulleys,
    travel,
    setOpen(open01) {
      shutter.position.y = CLOSED_Y + travel * open01;
      const top = shutter.position.y - 0.2;
      // 拉繩：捲筒 → 南柱頂滑輪
      segment(ropes.lead, winchDrumWorld, tmpA.copy(pTop.position).add(new Vector3(0, -0.2, 0.15)));
      segment(ropes.beam, tmpA.copy(pTop.position).add(new Vector3(0, 0.2, 0)), tmpB.copy(pB.position).add(new Vector3(0, 0.2, 0)));
      segment(ropes.dropA, tmpA.copy(pA.position).add(new Vector3(0.18, 0, 0)), tmpB.set(x - 0.27, top, hangZ[0]));
      segment(ropes.dropB, tmpA.copy(pB.position).add(new Vector3(0.18, 0, 0)), tmpB.set(x - 0.27, top, hangZ[1]));
      if (lastOpen !== null) {
        const d = (open01 - lastOpen) * travel;
        for (const p of pulleys) p.children[0].rotation.y += d / 0.22;
      }
      lastOpen = open01;
    },
  };
  api.setOpen(1);
  return api;
}

// ---------- 山寺小殿與石燈 ----------

/** 띠살 格子門窗的貼圖（木框＋韓紙） */
function latticeTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e8dcc0';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#5a3a26';
  g.fillRect(0, 0, 128, 8);
  g.fillRect(0, 248, 128, 8);
  g.fillRect(0, 0, 8, 256);
  g.fillRect(120, 0, 8, 256);
  for (let x = 20; x < 120; x += 14) g.fillRect(x, 0, 3, 256);
  for (const y of [40, 46, 52, 120, 126, 132, 200, 206, 212]) g.fillRect(0, y, 128, 3);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** 屋頂坡面：eave（屋簷兩端）到 ridge（屋脊兩端）的曲面，屋角上翹，瓦溝起伏 */
function roofSlope(e0, e1, r0, r1, { segU = 24, segV = 10, lift = 0.4, tiles = 18 } = {}) {
  const pos = [];
  const col = [];
  const P = (u, v) => {
    const e = e0.clone().lerp(e1, u);
    const r = r0.clone().lerp(r1, u);
    const p = e.clone().lerp(r, v);
    const corner = Math.pow(Math.abs(2 * u - 1), 4);
    p.y += lift * corner * (1 - v) + -0.35 * Math.sin(v * Math.PI) * 0.6; // 屋角上翹＋凹曲屋面
    p.y += 0.035 * Math.abs(Math.sin(u * tiles * Math.PI)); // 瓦溝
    return p;
  };
  const dark = new Color(0x2a2e35);
  const light = new Color(0x464c56);
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const u0 = i / segU;
      const u1 = (i + 1) / segU;
      const v0 = j / segV;
      const v1 = (j + 1) / segV;
      const a = P(u0, v0);
      const b = P(u1, v0);
      const c = P(u1, v1);
      const d = P(u0, v1);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      const k = 0.5 + 0.5 * Math.sin(((u0 + u1) / 2) * tiles * Math.PI * 2);
      const cc = dark.clone().lerp(light, k * 0.7);
      for (let q = 0; q < 6; q++) col.push(cc.r, cc.g, cc.b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new Mesh(g, MAT.tile);
  m.material.side = DoubleSide;
  return m;
}

/**
 * 山寺小殿（전각）：石造基壇與台階、紅土色圓柱、青綠樑、白牆、띠살 格子窗、
 * 中間一間門真的開著（看得到裡面的供桌），팔작지붕 式的瓦屋頂。屋簷下掛四盞韓紙燈籠（結局時點亮）。
 * 석등（石燈）常見於寺院殿堂前（例如浮石寺無量壽殿前石燈），所以這裡設定為寺院小殿，不叫祠堂。
 */
export function makeShrine({ cx = 0, front = -11.4, back = -14.4 }) {
  const group = new Group();
  const W = 7.2;
  const baseH = 0.6;
  const depth = back - front; // 負數
  const midZ = (front + back) / 2;
  // 基壇與台階
  group.add(box(W + 0.8, baseH, -depth + 0.8, MAT.stone, cx, baseH / 2, midZ));
  const platFront = front + 0.4;
  for (let k = 0; k < 2; k++) group.add(box(2.4, 0.2 * (k + 1), 0.35, MAT.stoneLight, cx, 0.1 * (k + 1), platFront + 0.175 + 0.35 * (1 - k)));
  // 柱子
  const colH = 2.6;
  const xs = [-3, -1, 1, 3];
  const pillars = [];
  for (const x of xs) {
    for (const z of [front - 0.15, back + 0.25]) {
      const p = cyl(0.14, 0.16, colH, 10, MAT.woodRed, cx + x, baseH + colH / 2, z);
      group.add(p);
      pillars.push(p);
      group.add(cyl(0.22, 0.24, 0.12, 8, MAT.stoneLight, cx + x, baseH + 0.06, z));
    }
  }
  // 樑
  const beamY = baseH + colH;
  for (const z of [front - 0.15, back + 0.25]) {
    group.add(box(W + 0.4, 0.28, 0.24, MAT.woodGreen, cx, beamY, z));
    group.add(box(W + 0.6, 0.12, 0.3, MAT.woodRed, cx, beamY + 0.2, z));
  }
  for (const x of xs) group.add(box(0.2, 0.26, -depth, MAT.woodGreen, cx + x, beamY, midZ));
  // 牆：後牆、兩側牆（白牆＋木框）
  const wall = (w, h, x, y, z, rotY = 0) => {
    const m = box(w, h, 0.12, MAT.plaster, x, y, z);
    m.rotation.y = rotY;
    group.add(m);
  };
  wall(W - 0.2, colH - 0.2, cx, baseH + colH / 2, back + 0.25);
  wall(-depth - 0.4, colH - 0.2, cx - 3, baseH + colH / 2, midZ, Math.PI / 2);
  wall(-depth - 0.4, colH - 0.2, cx + 3, baseH + colH / 2, midZ, Math.PI / 2);
  // 前面：兩側間是格子窗（牆＋窗），中間開門
  const lattice = latticeTexture();
  const latMat = new MeshStandardMaterial({ map: lattice, roughness: 1, emissive: 0xffb060, emissiveIntensity: 0, emissiveMap: lattice });
  for (const x of [-2, 2]) {
    group.add(box(1.8, colH - 0.2, 0.1, MAT.plaster, cx + x, baseH + colH / 2, front - 0.1));
    group.add(box(1.2, 1.4, 0.06, latMat, cx + x, baseH + 1.5, front - 0.02));
  }
  const doors = [];
  for (const side of [-1, 1]) {
    const hinge = new Group();
    hinge.position.set(cx + side * 0.95, baseH + 0.05, front - 0.12);
    const leaf = box(0.9, colH - 0.25, 0.06, latMat, -side * 0.45, (colH - 0.25) / 2, 0);
    hinge.add(leaf);
    hinge.add(box(0.06, 0.06, 0.06, MAT.iron, -side * 0.82, (colH - 0.25) / 2, 0.05)); // 門環
    hinge.rotation.y = side * 1.35; // 開著（往內）
    group.add(hinge);
    doors.push(hinge);
  }
  // 室內：地板、供桌、香爐（看得到的真實空間）
  group.add(box(W - 0.4, 0.06, -depth - 0.5, MAT.woodDark, cx, baseH + 0.03, midZ));
  const table = box(1.6, 0.5, 0.6, MAT.woodRed, cx, baseH + 0.3, back + 0.9);
  group.add(table);
  group.add(cyl(0.12, 0.09, 0.16, 10, MAT.iron, cx, baseH + 0.63, back + 0.9));
  const inner = new PointLight(0xffb070, 0, 6, 1.8);
  inner.position.set(cx, baseH + 1.4, midZ);
  group.add(inner);
  // 屋頂（팔작지붕 簡化：前後坡＋兩側三角坡＋屋脊）
  const ov = 1.1;
  const eaveY = beamY + 0.35;
  const ridgeY = beamY + 2.05;
  const fz = front + ov;
  const bz = back - ov;
  const ex0 = cx - W / 2 - ov;
  const ex1 = cx + W / 2 + ov;
  const rx0 = cx - W / 2 + 1.4;
  const rx1 = cx + W / 2 - 1.4;
  const rz = midZ;
  const V = (x, y, z) => new Vector3(x, y, z);
  group.add(roofSlope(V(ex0, eaveY, fz), V(ex1, eaveY, fz), V(rx0, ridgeY, rz), V(rx1, ridgeY, rz)));
  group.add(roofSlope(V(ex1, eaveY, bz), V(ex0, eaveY, bz), V(rx1, ridgeY, rz), V(rx0, ridgeY, rz)));
  group.add(roofSlope(V(ex0, eaveY, bz), V(ex0, eaveY, fz), V(rx0, ridgeY, rz), V(rx0, ridgeY, rz), { segU: 10, tiles: 8 }));
  group.add(roofSlope(V(ex1, eaveY, fz), V(ex1, eaveY, bz), V(rx1, ridgeY, rz), V(rx1, ridgeY, rz), { segU: 10, tiles: 8 }));
  const ridge = box(rx1 - rx0 + 0.6, 0.32, 0.36, MAT.woodDark, cx, ridgeY + 0.12, rz);
  ridge.material = new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.7 });
  group.add(ridge);
  for (const x of [rx0 - 0.3, rx1 + 0.3]) {
    const end = box(0.25, 0.55, 0.4, ridge.material, x, ridgeY + 0.3, rz);
    end.rotation.z = x < cx ? 0.35 : -0.35;
    group.add(end);
  }
  // 屋簷下的韓紙燈籠（結局點亮）
  const hanging = [];
  for (const x of [-3, -1, 1, 3]) {
    const g = new Group();
    g.position.set(cx + x, eaveY - 0.2, front + 0.45);
    g.add(at(new Mesh(new CylinderGeometry(0.004, 0.004, 0.35, 4), MAT.rope), 0, -0.17, 0));
    const silkTop = new MeshStandardMaterial({ color: 0xe8dcc0, emissive: 0xffc070, emissiveIntensity: 0, roughness: 1, side: DoubleSide });
    const silkBot = new MeshStandardMaterial({ color: 0xe8dcc0, emissive: 0xffb060, emissiveIntensity: 0, roughness: 1, side: DoubleSide });
    g.add(at(new Mesh(new CylinderGeometry(0.15, 0.17, 0.12, 12, 1, true), silkTop), 0, -0.4, 0));
    g.add(at(new Mesh(new CylinderGeometry(0.17, 0.14, 0.22, 12, 1, true), silkBot), 0, -0.57, 0));
    g.add(at(new Mesh(new CylinderGeometry(0.11, 0.15, 0.04, 10), MAT.woodDark), 0, -0.33, 0));
    g.add(at(new Mesh(new CylinderGeometry(0.14, 0.1, 0.04, 10), MAT.woodDark), 0, -0.69, 0));
    const light = new PointLight(0xffa860, 0, 5, 1.8);
    light.position.y = -0.5;
    g.add(light);
    group.add(g);
    hanging.push({ group: g, mats: [silkTop, silkBot], light, lit: 0 });
  }
  shadow(group);
  for (const d of doors) d.traverse((o) => (o.castShadow = false));
  return { group, doors, hanging, inner, latMat, pillars, occluders: [ridge, ...pillars] };
}

/** 석등（石燈）：八角基座、蓮花座、柱身、火室（四面開窗）、屋蓋石、寶珠。玩家要點亮的就是這座 */
export function makeStoneLantern() {
  const group = new Group();
  const S = MAT.stoneLight;
  group.add(cyl(0.55, 0.6, 0.22, 8, S, 0, 0.11, 0));
  group.add(cyl(0.38, 0.5, 0.2, 8, S, 0, 0.32, 0));
  // 蓮花座（下）
  const lotus = new LatheGeometry([new Vector2(0.12, 0), new Vector2(0.34, 0.06), new Vector2(0.4, 0.16), new Vector2(0.2, 0.24)], 8);
  group.add(at(new Mesh(lotus, S), 0, 0.42, 0));
  group.add(cyl(0.12, 0.14, 0.62, 8, S, 0, 0.96, 0));
  group.add(at(new Mesh(new LatheGeometry([new Vector2(0.14, 0), new Vector2(0.38, 0.12), new Vector2(0.4, 0.18), new Vector2(0.3, 0.2)], 8), S), 0, 1.26, 0));
  // 火室：四根角柱＋上下板（四面開窗）
  const fireY = 1.46;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    group.add(box(0.1, 0.42, 0.1, S, Math.cos(a) * 0.22, fireY + 0.21, Math.sin(a) * 0.22));
  }
  group.add(cyl(0.3, 0.3, 0.05, 8, S, 0, fireY, 0));
  // 屋蓋石
  group.add(at(new Mesh(new LatheGeometry([new Vector2(0.1, 0.22), new Vector2(0.5, 0.04), new Vector2(0.56, 0), new Vector2(0.52, -0.04), new Vector2(0.28, 0)], 8), S), 0, fireY + 0.46, 0));
  group.add(cyl(0.08, 0.1, 0.12, 8, S, 0, fireY + 0.74, 0));
  group.add(at(new Mesh(new SphereGeometry(0.09, 10, 8), S), 0, fireY + 0.86, 0));
  shadow(group);
  const flame = makeFlame({ height: 0.3, width: 0.16 });
  flame.group.position.y = fireY + 0.04;
  group.add(flame.group);
  const light = new PointLight(0xffb060, 0, 9, 1.6);
  light.position.y = fireY + 0.22;
  group.add(light);
  const state = { lit: 0, target: 0 };
  return {
    group,
    fireY,
    get lit() {
      return state.target > 0.5;
    },
    setLit(on) {
      state.target = on ? 1 : 0;
    },
    /** 火焰形成：從小火苗慢慢長大（不是瞬間出現） */
    update(time, dt, wind) {
      state.lit += (state.target - state.lit) * (1 - Math.exp(-dt * 1.6));
      const k = state.lit;
      flame.update(time, wind, k);
      flame.group.scale.setScalar(0.3 + 0.7 * k);
      light.intensity = k * (6 + Math.sin(time * 9) * 0.4);
    },
    get glow() {
      return state.lit;
    },
  };
}

// ---------- 靈界 ----------

/** 記憶材質：半透明、冷色自發光；opacity 由狀態控制 */
export function memoryMaterial() {
  return new MeshStandardMaterial({
    color: 0x9fe8f0,
    emissive: 0x39c6d8,
    emissiveIntensity: 1.1,
    roughness: 0.6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
}

/** 靈視開啟時從燈籠擴散的光波 */
export function makeSpiritWave() {
  const mat = new MeshBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0, side: DoubleSide, blending: AdditiveBlending, depthWrite: false });
  const m = new Mesh(new SphereGeometry(1, 32, 16), mat);
  m.visible = false;
  m.userData.noShadow = true;
  m.renderOrder = 8;
  return m;
}
