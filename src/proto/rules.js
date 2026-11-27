/**
 * Gate 1 原型「斷橋與燈」的世界規則（純邏輯，不碰畫面，可以單元測試）。
 *
 * 要驗證的核心問題：月魂燈籠＋靈界＋風，這組「可以組合的規則」能不能讓第一次玩的人
 * 靠觀察和推理解開謎題，而且覺得有趣。
 *
 * 規則（每一條都會在不同地方重複使用）：
 *   R1 燈火：燈籠有「火力」0～1。在有風的地方火力下降，避風時慢慢恢復；降到 0 就熄滅。熄了要到火源重新點。
 *   R2 舉燈：按住舉高燈籠，照得更遠、能讓石碑上的隱藏圖案顯現；但舉高時火更怕風（消耗 ×1.8）。
 *   R3 靈視：燈亮著時可以切換。靈視中看得到「記憶」（過去存在的東西），記憶物件變成實體、可以走。
 *            燈一熄，靈視立刻結束——站在記憶上的人會掉下去。
 *   R4 風：峽谷裡的風照固定節奏吹：平靜 → 預兆（煙開始傾斜）→ 陣風。火盆的煙、聲音都看得出來。
 *            關上峽谷東邊的木閘門，風就吹不進來。
 *   R5 記憶的線條：記憶物件在人間也看得到——只剩下青色的線條字元。玩家一開始就看得到斷橋上的線，
 *            只是還不懂那是什麼。
 */

export const LAYOUT = Object.freeze({
  bounds: { minX: -10, maxX: 10, minZ: -15, maxZ: 17 },
  start: { x: 1.5, z: 14.5 },
  /** 峽谷（人間是深淵）：橫跨整個地圖 */
  ravine: { minZ: -4.5, maxZ: 3.5 },
  /** 橋所在的走道 |x| < half */
  bridge: { x: 0, half: 0.75 },
  /** 人間殘留的橋板（z 範圍，由南到北） */
  remnantSouth: { maxZ: 3.5, minZ: 2.1 },
  remnantNorth: { maxZ: -3.2, minZ: -4.5 },
  /** 西側的溝（人間是深淵），記憶木板橫跨過去通往小平台 */
  trench: { minX: -6.4, maxX: -4.6, minZ: 3.5, maxZ: 17.5 },
  plank: { z: 11.5, half: 0.8 },
  ledge: { minX: -10, maxX: -6.4, minZ: 3.5, maxZ: 17 },
  brazier: { x: -3.2, z: 4.7 },
  winch: { x: 6.2, z: 4.5 },
  shutterX: 8.6,
  steles: [
    { id: 'stele-eye', x: 4.2, z: 10.4, picture: 'eye' },
    { id: 'stele-wind', x: -8.4, z: 11.5, picture: 'wind' },
  ],
  lamp: { x: 0, z: -10.2 },
  /** 掉下去後回到的地方（橋頭） */
  safeSouth: { x: 0, z: 4.6 },
  safeTrench: { x: -3.6, z: 11.5 },
});

/** 風的節奏（秒） */
export const GUST = Object.freeze({ period: 7, calm: 3.8, warn: 0.8 });

/** 某個時間點的風：phase = calm | warn | gust，strength 0.15～1 */
export function gustAt(t) {
  const u = ((t % GUST.period) + GUST.period) % GUST.period;
  if (u < GUST.calm) return { phase: 'calm', strength: 0.15, u };
  if (u < GUST.calm + GUST.warn) {
    const k = (u - GUST.calm) / GUST.warn;
    return { phase: 'warn', strength: 0.15 + 0.85 * k * k, u };
  }
  return { phase: 'gust', strength: 1, u };
}

export const FLAME = Object.freeze({ drain: 1.9, raisedFactor: 1.8, recover: 0.8, threshold: 0.3 });
/** 走在記憶上要放慢（記憶很脆弱） */
export const MEMORY_WALK_SPEED = 1.8;

export const inRavine = (x, z) => z > LAYOUT.ravine.minZ && z < LAYOUT.ravine.maxZ;
const onStrip = (x) => Math.abs(x - LAYOUT.bridge.x) < LAYOUT.bridge.half;
/** 斷橋中間的缺口（人間是深淵、靈界有記憶的橋板） */
export const inBridgeGap = (x, z) => onStrip(x) && z < LAYOUT.remnantSouth.minZ && z > LAYOUT.remnantNorth.maxZ;
export const inTrench = (x, z) => x > LAYOUT.trench.minX && x < LAYOUT.trench.maxX && z > LAYOUT.trench.minZ && z < LAYOUT.trench.maxZ;
export const onPlank = (x, z) => inTrench(x, z) && Math.abs(z - LAYOUT.plank.z) < LAYOUT.plank.half;
/** 站在記憶物件上（只有靈視時才站得住） */
export const onMemory = (x, z) => inBridgeGap(x, z) || onPlank(x, z);

/** 風吹得到的地方：峽谷裡，而且木閘門沒關 */
export const exposedAt = (x, z, shutterClosed) => inRavine(x, z) && !shutterClosed;

/** 碰撞盒（AABB）。spirit = 靈視中：記憶的橋與木板可以走 */
export function colliders(spirit) {
  const L = LAYOUT;
  const box = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
  const out = [
    // 峽谷：橋走道兩側永遠是深淵
    box(L.bounds.minX - 1, L.bridge.x - L.bridge.half, L.ravine.minZ, L.ravine.maxZ),
    box(L.bridge.x + L.bridge.half, L.bounds.maxX + 1, L.ravine.minZ, L.ravine.maxZ),
    // 溝：木板以外永遠是深淵
    box(L.trench.minX, L.trench.maxX, L.trench.minZ, L.plank.z - L.plank.half),
    box(L.trench.minX, L.trench.maxX, L.plank.z + L.plank.half, L.trench.maxZ),
    // 擺設
    box(L.brazier.x - 0.45, L.brazier.x + 0.45, L.brazier.z - 0.45, L.brazier.z + 0.45),
    box(L.winch.x - 0.4, L.winch.x + 0.4, L.winch.z - 0.4, L.winch.z + 0.4),
    box(L.lamp.x - 0.45, L.lamp.x + 0.45, L.lamp.z - 0.45, L.lamp.z + 0.45),
    ...L.steles.map((s) => (s.id === 'stele-wind' ? box(s.x - 0.2, s.x + 0.2, s.z - 0.65, s.z + 0.65) : box(s.x - 0.65, s.x + 0.65, s.z - 0.2, s.z + 0.2))),
    // 祠堂後牆
    box(-4, 4, -13.4, -12.8),
  ];
  if (!spirit) {
    // 人間：斷橋缺口與木板的位置是空的
    out.push(box(L.bridge.x - L.bridge.half, L.bridge.x + L.bridge.half, L.remnantNorth.maxZ, L.remnantSouth.minZ));
    out.push(box(L.trench.minX, L.trench.maxX, L.plank.z - L.plank.half, L.plank.z + L.plank.half));
  }
  return out;
}

/**
 * 燈籠：火力、舉燈、靈視。
 * update 回傳這一格發生的事件（'out' 熄滅、'spiritOff' 靈視結束）。
 */
export class Lantern {
  constructor() {
    this.heat = 1;
    this.lit = true;
    this.raised = false;
    this.spirit = false;
  }

  update(dt, exposure) {
    const events = [];
    if (!this.lit) return events;
    const wind = Math.max(0, exposure - FLAME.threshold);
    if (wind > 0) this.heat -= dt * wind * FLAME.drain * (this.raised ? FLAME.raisedFactor : 1);
    else this.heat = Math.min(1, this.heat + dt * FLAME.recover);
    if (this.heat <= 0) {
      this.heat = 0;
      this.lit = false;
      events.push('out');
      if (this.spirit) {
        this.spirit = false;
        events.push('spiritOff');
      }
    }
    return events;
  }

  /** 切換靈視；燈熄著時不行（回傳 false） */
  toggleSpirit() {
    if (!this.lit) return false;
    this.spirit = !this.spirit;
    return true;
  }

  ignite() {
    this.lit = true;
    this.heat = 1;
  }
}

/**
 * 模擬一次過橋（給可解性測試與設計調整用）：
 * 從南橋頭 (z = remnantSouth.maxZ) 在時間 t0 出發、開著靈視往北走，
 * 回傳 { ok, fellAt, exposedSeconds }。跑步速度走殘橋，記憶橋板上用 MEMORY_WALK_SPEED。
 */
export function simulateCrossing({ t0, shutterClosed = false, raised = false, runSpeed = 5.2, dt = 1 / 60 }) {
  const L = LAYOUT;
  const lantern = new Lantern();
  lantern.spirit = true;
  lantern.raised = raised;
  let z = L.ravine.maxZ + 0.01;
  let t = t0;
  let exposedSeconds = 0;
  while (z > L.ravine.minZ) {
    const exposure = exposedAt(0, z, shutterClosed) ? gustAt(t).strength : 0;
    if (exposure > FLAME.threshold) exposedSeconds += dt;
    const ev = lantern.update(dt, exposure);
    if (ev.includes('spiritOff') && inBridgeGap(0, z)) return { ok: false, fellAt: z, exposedSeconds };
    const speed = inBridgeGap(0, z) ? MEMORY_WALK_SPEED : runSpeed;
    z -= speed * dt;
    t += dt;
  }
  return { ok: true, fellAt: null, exposedSeconds };
}

/**
 * 給玩家的階段性提示：依玩家已經做過的事決定（不是固定時間表），同一條只給一次。
 * @param shown 已經給過的提示 id
 */
export function nextHint(progress, seconds, shown = new Set()) {
  const p = progress;
  const candidates = [
    ['raise', !p.revealed.has('stele-eye') && p.nearSteleEye > 6, '石碑上好像有什麼，但太暗了。按住 F（手機：舉燈）把燈籠舉高。'],
    ['spirit', p.revealed.has('stele-eye') && !p.usedSpirit && seconds - p.revealedAt['stele-eye'] > 15, '一隻眼睛望著月亮……按 Q（手機：靈視）用燈籠看看月亮的另一面。'],
    ['smoke', p.falls >= 2 && !p.shutterClosed, '看看火盆的煙：煙往旁邊倒的時候，峽谷的風最強。'],
    ['gate', p.falls >= 4 && !p.shutterClosed, '峽谷東邊有一扇木閘門，旁邊的絞盤也許能把它關上。'],
  ];
  for (const [id, when, text] of candidates) if (when && !shown.has(id)) return { id, text };
  return null;
}
