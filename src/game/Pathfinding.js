/**
 * 網格 A* 尋路（XZ 平面）。
 * 每格 0.5 公尺；障礙物（AABB）依角色半徑往外擴，算出的路徑再用視線檢查拉直。
 */
const SQRT2 = Math.SQRT2;
const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/** 簡單的二元堆積（以 f 值排序） */
class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(node, f) {
    const a = this.items;
    a.push({ node, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.node;
  }
}

export class NavGrid {
  /**
   * @param bounds {minX,maxX,minZ,maxZ}
   * @param boxes 障礙物 AABB 陣列
   * @param radius 角色半徑（障礙物往外擴這麼多）
   */
  constructor(bounds, boxes, radius = 0.45, cell = 0.5) {
    this.bounds = bounds;
    this.cell = cell;
    this.radius = radius;
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.rebuild(boxes);
  }

  rebuild(boxes) {
    const { cols, rows, cell, radius, bounds } = this;
    this.blocked = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = bounds.minX + (c + 0.5) * cell;
        const z = bounds.minZ + (r + 0.5) * cell;
        const edge = x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius;
        if (edge || boxes.some((b) => x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius)) {
          this.blocked[r * cols + c] = 1;
        }
      }
    }
  }

  toCell(x, z) {
    return {
      c: Math.floor((x - this.bounds.minX) / this.cell),
      r: Math.floor((z - this.bounds.minZ) / this.cell),
    };
  }

  center(c, r) {
    return { x: this.bounds.minX + (c + 0.5) * this.cell, z: this.bounds.minZ + (r + 0.5) * this.cell };
  }

  inside(c, r) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  walkable(c, r) {
    return this.inside(c, r) && !this.blocked[r * this.cols + c];
  }

  walkableAt(x, z) {
    const { c, r } = this.toCell(x, z);
    return this.walkable(c, r);
  }

  /** 找離 (c, r) 最近的可走格子（BFS，最多 maxDist 格） */
  nearestWalkable(c, r, maxDist = 8) {
    if (this.walkable(c, r)) return { c, r };
    for (let d = 1; d <= maxDist; d++) {
      let best = null;
      let bestDist = Infinity;
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
          if (!this.walkable(c + dc, r + dr)) continue;
          const dist = dc * dc + dr * dr;
          if (dist < bestDist) {
            bestDist = dist;
            best = { c: c + dc, r: r + dr };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** 兩點之間是否一路都可走（取樣檢查） */
  lineOfSight(a, b) {
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(dist / (this.cell * 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.walkableAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /**
   * 從 from 找路到 to。回傳 { points, reached, unreachable }：
   * points 是路點（不含起點）；目標不可走時改走到最近的可走位置（reached=false）；
   * 完全到不了時 unreachable=true、points 為空。
   */
  findPath(from, to) {
    const startRaw = this.toCell(from.x, from.z);
    const start = this.nearestWalkable(startRaw.c, startRaw.r, 4);
    const goalRaw = this.toCell(to.x, to.z);
    const goal = this.nearestWalkable(goalRaw.c, goalRaw.r, 8);
    if (!start || !goal) return { points: [], reached: false, unreachable: true };
    const exact = goal.c === goalRaw.c && goal.r === goalRaw.r;

    const { cols } = this;
    const idx = (c, r) => r * cols + c;
    const startI = idx(start.c, start.r);
    const goalI = idx(goal.c, goal.r);
    const g = new Float32Array(this.cols * this.rows).fill(Infinity);
    const came = new Int32Array(this.cols * this.rows).fill(-1);
    const closed = new Uint8Array(this.cols * this.rows);
    const h = (c, r) => {
      const dx = Math.abs(c - goal.c);
      const dz = Math.abs(r - goal.r);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
    };
    const open = new MinHeap();
    g[startI] = 0;
    open.push(startI, h(start.c, start.r));

    let found = startI === goalI;
    while (open.size && !found) {
      const cur = open.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goalI) {
        found = true;
        break;
      }
      const cc = cur % cols;
      const cr = (cur / cols) | 0;
      for (const [dc, dr, cost] of NEIGHBORS) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (!this.walkable(nc, nr)) continue;
        // 斜走時兩側都要可走，避免切過牆角
        if (dc && dr && (!this.walkable(cc + dc, cr) || !this.walkable(cc, cr + dr))) continue;
        const ni = idx(nc, nr);
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          open.push(ni, ng + h(nc, nr));
        }
      }
    }
    if (!found) return { points: [], reached: false, unreachable: true };

    const cells = [];
    for (let i = goalI; i !== -1 && i !== startI; i = came[i]) cells.push(i);
    cells.reverse();
    const raw = cells.map((i) => this.center(i % cols, (i / cols) | 0));
    if (exact) raw[raw.length - 1] = { x: to.x, z: to.z };
    if (raw.length === 0 && exact) raw.push({ x: to.x, z: to.z });

    // 拉直：能直接看到的路點就跳過中間的
    const points = [];
    let anchor = { x: from.x, z: from.z };
    let i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      while (j > i && !this.lineOfSight(anchor, raw[j])) j--;
      points.push(raw[j]);
      anchor = raw[j];
      i = j + 1;
    }
    return { points, reached: exact, unreachable: false };
  }
}
