import { Bone, BufferAttribute, BufferGeometry, Color, Matrix4, Skeleton, Vector3 } from 'three';

/**
 * 程序化蒙皮模型的組裝工具。
 *
 * 1. createBones：依「綁定姿勢下的世界座標」建立骨架階層（所有骨頭的綁定旋轉都是單位旋轉，
 *    手腳在綁定姿勢中自然下垂，動畫只要描述相對旋轉）。
 * 2. SkinBuilder：把多個 three 幾何體（Lathe、Sphere、Box…）變換到綁定姿勢的位置、上色，
 *    並用函式依頂點位置決定權重（例如手肘附近在上臂與前臂之間平滑過渡），最後合併成一個 SkinnedMesh 幾何體。
 */
export function createBones(defs) {
  const byName = {};
  const world = {};
  const bones = [];
  for (const d of defs) {
    const bone = new Bone();
    bone.name = d.name;
    world[d.name] = new Vector3(...d.pos);
    const parentPos = d.parent ? world[d.parent] : new Vector3();
    bone.position.copy(world[d.name]).sub(parentPos);
    if (d.parent) byName[d.parent].add(bone);
    byName[d.name] = bone;
    bones.push(bone);
  }
  const index = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  return { bones, byName, index, world, skeleton: new Skeleton(bones), root: bones[0] };
}

/** 依 y 座標在兩根骨頭之間平滑過渡的權重（用於手肘、膝蓋、腰部） */
export function blendY(upperBone, lowerBone, jointY, width) {
  return (p) => {
    const k = Math.min(1, Math.max(0, (p.y - (jointY - width)) / (2 * width)));
    const s = k * k * (3 - 2 * k);
    return [
      [upperBone, s],
      [lowerBone, 1 - s],
    ];
  };
}

/** 沿著某個方向軸在兩根骨頭之間過渡（用於橫向的部位，例如腳掌往前到腳趾） */
export function blendAxis(axis, aBone, bBone, joint, width) {
  return (p) => {
    const v = p[axis];
    const k = Math.min(1, Math.max(0, (v - (joint - width)) / (2 * width)));
    const s = k * k * (3 - 2 * k);
    return [
      [aBone, 1 - s],
      [bBone, s],
    ];
  };
}

const tmpColor = new Color();

export class SkinBuilder {
  constructor(boneIndex) {
    this.boneIndex = boneIndex;
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.indices = [];
    this.vertexCount = 0;
  }

  /**
   * @param geometry three BufferGeometry（會被複製後變換）
   * @param o.matrix 變換到綁定姿勢位置的矩陣
   * @param o.color 顏色，或依頂點位置回傳顏色的函式
   * @param o.weights 骨頭名稱，或 (位置) => [[骨頭名稱, 權重], ...]
   * @param o.displace 可選：(位置, 法線) => 位移量（做衣服摺痕、肌肉起伏）
   */
  add(geometry, { matrix = new Matrix4(), color = 0xffffff, weights, displace = null }) {
    const g = geometry.index ? geometry.clone() : geometry.clone();
    g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const p = new Vector3();
    const n = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nor, i);
      if (displace) p.addScaledVector(n, displace(p, n));
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(n.x, n.y, n.z);
      tmpColor.set(typeof color === 'function' ? color(p, n) : color);
      this.colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      let w = typeof weights === 'string' ? [[weights, 1]] : weights(p);
      w = w.filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = w.reduce((s, [, v]) => s + v, 0) || 1;
      for (let k = 0; k < 4; k++) {
        const entry = w[k];
        this.skinIndex.push(entry ? this.boneIndex[entry[0]] : 0);
        this.skinWeight.push(entry ? entry[1] / total : 0);
      }
    }
    const base = this.vertexCount;
    if (g.index) for (let i = 0; i < g.index.count; i++) this.indices.push(base + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.indices.push(base + i);
    this.vertexCount += pos.count;
    g.dispose();
    return this;
  }

  build() {
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geom.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geom.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geom.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(this.skinIndex), 4));
    geom.setAttribute('skinWeight', new BufferAttribute(new Float32Array(this.skinWeight), 4));
    geom.setIndex(this.indices);
    geom.computeBoundingSphere();
    return geom;
  }
}

/** 位置＋縮放＋旋轉 → 矩陣 */
export function place(x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  const m = new Matrix4().makeRotationFromEuler({ x: rx, y: ry, z: rz, order: 'XYZ', isEuler: true });
  m.scale(new Vector3(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
}
