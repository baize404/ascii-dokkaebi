import { LEVEL } from '../data/level.js';

const COLORS = {
  bg: '#0a121d',
  ground: '#15241d',
  path: '#3a372f',
  house: '#3a5268',
  wall: '#2a2f38',
  water: '#1d4a5c',
  mound: '#1f3328',
  fog: 'rgba(5, 8, 14, 0.92)',
  player: '#f2bd68',
  landmark: '#e2e8ef',
  quest: '#d65f4c',
};

/**
 * 探索地圖：走過的地方才會從迷霧中出現；顯示玩家位置、已發現的地標與已知的任務地點。
 * 同一份繪圖用在右上角的小地圖與面板裡的大地圖。
 */
export class Minimap {
  constructor() {
    const b = LEVEL.bounds;
    this.bounds = b;
    this.w = b.maxX - b.minX;
    this.h = b.maxZ - b.minZ;
  }

  /** 世界座標 → 畫布座標 */
  #toCanvas(x, z, W, H) {
    return [((x - this.bounds.minX) / this.w) * W, ((z - this.bounds.minZ) / this.h) * H];
  }

  #drawBase(ctx, W, H) {
    const S = W / this.w;
    const P = (x, z) => this.#toCanvas(x, z, W, H);
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, W, H);
    const m = LEVEL.mound;
    ctx.fillStyle = COLORS.mound;
    ctx.beginPath();
    ctx.arc(...P(m.x, m.z), m.wallRadius * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.path;
    for (const [x, z, w, d] of LEVEL.paths) {
      const [px, pz] = P(x - w / 2, z - d / 2);
      ctx.fillRect(px, pz, w * S, d * S);
    }
    ctx.fillStyle = COLORS.house;
    for (const h of LEVEL.houses) {
      const [px, pz] = P(h.x - h.w / 2, h.z - h.d / 2);
      ctx.fillRect(px, pz, h.w * S, h.d * S);
    }
    const s = LEVEL.storehouse;
    const [sx, sz] = P(s.x - s.w / 2, s.z - s.d / 2);
    ctx.fillRect(sx, sz, s.w * S, s.d * S);
    ctx.fillStyle = COLORS.water;
    ctx.beginPath();
    ctx.arc(...P(LEVEL.pond.x, LEVEL.pond.z), LEVEL.pond.r * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(...P(LEVEL.well.x, LEVEL.well.z), 1.1 * S, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * @param canvas 目標畫布
   * @param data { player:{x,z,yaw}, explored: Uint8Array（每 1m 一格）, landmarks: Set, markers: [{x,z}] }
   */
  render(canvas, data) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width * dpr));
    const H = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext('2d');
    this.#drawBase(ctx, W, H);

    // 迷霧：沒走過的格子蓋上去
    const cols = Math.ceil(this.w);
    const rows = Math.ceil(this.h);
    const cw = W / this.w;
    const ch = H / this.h;
    ctx.fillStyle = COLORS.fog;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!data.explored[r * cols + c]) ctx.fillRect(Math.floor(c * cw), Math.floor(r * ch), Math.ceil(cw) + 1, Math.ceil(ch) + 1);
      }
    }

    const fontSize = Math.max(8, Math.round(W / 14));
    ctx.font = `${fontSize}px 'Noto Serif CJK TC', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of LEVEL.landmarks) {
      if (!data.landmarks.has(l.id)) continue;
      const [x, y] = this.#toCanvas(l.x, l.z, W, H);
      ctx.fillStyle = COLORS.landmark;
      ctx.fillText(l.icon, x, y);
    }
    for (const mk of data.markers ?? []) {
      const [x, y] = this.#toCanvas(mk.x, mk.z, W, H);
      ctx.fillStyle = COLORS.quest;
      ctx.beginPath();
      ctx.moveTo(x, y - fontSize * 0.45);
      ctx.lineTo(x + fontSize * 0.35, y);
      ctx.lineTo(x, y + fontSize * 0.45);
      ctx.lineTo(x - fontSize * 0.35, y);
      ctx.closePath();
      ctx.fill();
    }

    // 玩家：朝向的小三角形
    const p = data.player;
    const [px, py] = this.#toCanvas(p.x, p.z, W, H);
    const r = Math.max(4, W / 28);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-p.yaw + Math.PI);
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.7, r * 0.8);
    ctx.lineTo(-r * 0.7, r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** 記錄走過的格子（每 1 公尺一格），radius 內都算看過 */
export class ExploredGrid {
  constructor(data) {
    const b = LEVEL.bounds;
    this.cols = Math.ceil(b.maxX - b.minX);
    this.rows = Math.ceil(b.maxZ - b.minZ);
    this.cells = new Uint8Array(this.cols * this.rows);
    if (typeof data === 'string') this.load(data);
  }

  reveal(x, z, radius = 7) {
    const b = LEVEL.bounds;
    const cx = x - b.minX;
    const cz = z - b.minZ;
    for (let r = Math.max(0, Math.floor(cz - radius)); r <= Math.min(this.rows - 1, Math.ceil(cz + radius)); r++) {
      for (let c = Math.max(0, Math.floor(cx - radius)); c <= Math.min(this.cols - 1, Math.ceil(cx + radius)); c++) {
        if ((c + 0.5 - cx) ** 2 + (r + 0.5 - cz) ** 2 <= radius * radius) this.cells[r * this.cols + c] = 1;
      }
    }
  }

  /** 壓縮成字串存檔（run-length） */
  save() {
    let out = '';
    let cur = this.cells[0];
    let n = 0;
    for (const v of this.cells) {
      if (v === cur) n++;
      else {
        out += `${cur}${n},`;
        cur = v;
        n = 1;
      }
    }
    return out + `${cur}${n}`;
  }

  load(str) {
    let i = 0;
    for (const part of str.split(',')) {
      const v = Number(part[0]);
      const n = Number(part.slice(1));
      if (!Number.isFinite(n)) return;
      for (let k = 0; k < n && i < this.cells.length; k++) this.cells[i++] = v ? 1 : 0;
    }
  }
}
