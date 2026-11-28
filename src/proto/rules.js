/**
 * 「斷橋與燈」的世界規則（純邏輯，不碰畫面，可以單元測試）。4.0 起是純 3D 垂直切片。
 *
 * 要驗證的核心問題：月魂燈籠＋靈界＋風，這組「可以組合的規則」能不能讓第一次玩的人
 * 靠觀察和推理解開謎題，而且覺得有趣。
 *
 * 規則（每一條都會在不同地方重複使用）：
 *   R1 燈火：燈籠有「火力」0～1。在有風的地方火力下降，避風時慢慢恢復；降到 0 就熄滅。熄了要到火源重新點。
 *   R2 舉燈：按住舉高燈籠，照得更遠、能讓石碑上的隱藏圖案顯現；但舉高時火更怕風（消耗 ×1.8）。
 *   R3 靈視：燈亮著時可以切換。靈視中看得到「記憶」（過去存在的東西），記憶物件變成實體、可以走。
 *            燈一熄，靈視立刻結束——站在記憶上的人會掉下去。
 *   R4 風：峽谷裡的風照固定節奏吹：平靜 → 預兆（煙開始傾斜）→ 陣風。火盆的煙、草、衣帶、聲音都看得出來。
 *            峽谷東邊的木閘門關得越多，吹進來的風越弱（漸進遮風，全關時燈火不會被吹熄）。
 *   R5 記憶的殘影：記憶物件在人間也看得到一點——斷橋缺口上有微弱的青色光塵沿著橋板的形狀飄著。
 *            玩家一開始就看得到，只是還不懂那是什麼。（3.x 是 ASCII 線條字元，4.0 改為純 3D 光塵）
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

/** 閘門全關時仍漏進來的風（比燈火的門檻低：全關時燈不會被吹熄） */
export const WIND_LEAK = 0.15;
/** 閘門開啟程度 open01（1 = 全開）對峽谷風力的倍率：連續變化，玩家看得出「關越多風越小」 */
export const gateShield = (open01) => WIND_LEAK + (1 - WIND_LEAK) * Math.max(0, Math.min(1, open01));
/** 某處燈火受到的風：峽谷外 0；峽谷裡 = 陣風強度 × 閘門倍率 */
export function windExposure(x, z, open01, strength) {
  return inRavine(x, z) ? strength * gateShield(open01) : 0;
}
/** 相容舊介面：布林閘門狀態 */
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
    // 山寺：基壇與台階
    box(-4.1, 4.1, -15.2, -10.95),
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
    const exposure = windExposure(0, z, shutterClosed ? 0 : 1, gustAt(t).strength);
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
 * 記憶物件的狀態（視覺、碰撞、導航都看同一個狀態，不會「畫面有橋但掉下去」）：
 *   hidden    人間：只看得到殘影光塵，不能走
 *   revealing 靈視剛開：光塵聚成橋板（REVEAL 秒），還不能走——碰撞要等完全成形
 *   stable    可以走
 *   unstable  可以走，但燈火快熄了（火力 < UNSTABLE_HEAT）：橋板閃爍、出現裂痕
 *   dissolving 靈視結束：橋板崩散（DISSOLVE 秒），站在上面的人還撐得住，散完才掉下去
 */
export const MEMORY = Object.freeze({ REVEAL: 0.6, DISSOLVE: 0.45, UNSTABLE_HEAT: 0.45 });
export const SOLID_STATES = new Set(['stable', 'unstable', 'dissolving']);

export class MemoryState {
  constructor() {
    this.state = 'hidden';
    this.t = 0; // 目前狀態經過的秒數
    this.form = 0; // 0 = 只剩光塵、1 = 完整的橋板（給畫面用）
  }

  get solid() {
    return SOLID_STATES.has(this.state);
  }

  /**
   * @param spirit 靈視是否開著；heat 燈籠火力
   * @returns 這一格的狀態轉換事件（例如 'stable'、'hidden'），沒有就是 null
   */
  update(dt, { spirit, heat }) {
    const before = this.state;
    this.t += dt;
    if (spirit) {
      if (this.state === 'hidden' || this.state === 'dissolving') this.#go('revealing');
      if (this.state === 'revealing' && this.t >= MEMORY.REVEAL) this.#go('stable');
      if (this.state === 'stable' && heat < MEMORY.UNSTABLE_HEAT) this.#go('unstable');
      if (this.state === 'unstable' && heat >= MEMORY.UNSTABLE_HEAT + 0.05) this.#go('stable');
    } else {
      if (this.state === 'revealing') this.#go('hidden');
      if (this.state === 'stable' || this.state === 'unstable') this.#go('dissolving');
      if (this.state === 'dissolving' && this.t >= MEMORY.DISSOLVE) this.#go('hidden');
    }
    const target = this.state === 'revealing' ? Math.min(1, this.t / MEMORY.REVEAL) : this.state === 'dissolving' ? Math.max(0, 1 - this.t / MEMORY.DISSOLVE) : this.state === 'hidden' ? 0 : 1;
    this.form = target;
    return this.state !== before ? this.state : null;
  }

  #go(state) {
    this.state = state;
    this.t = 0;
  }
}

/**
 * 擋風閘門的機構（純邏輯）：open01 由絞盤手柄的實際轉動決定（不是固定時間）。
 * 狀態：open | closing | closed | opening | blocked（關的路徑上有東西擋住時，停在原處）
 */
export const GATE = Object.freeze({ travel: 7.4, drumRadius: 0.19, ratio: 2.3, crankSpeed: 7 });
/** 手柄轉幾弧度可以從全開到全關 */
export const GATE_FULL_ANGLE = GATE.travel / (GATE.drumRadius * GATE.ratio);

export class GateMechanism {
  constructor({ isBlocked = () => false } = {}) {
    this.open01 = 1;
    this.crank = 0; // 手柄累計角度
    this.state = 'open';
    this.isBlocked = isBlocked;
  }

  /** 轉手柄 dAngle 弧度（正 = 放下擋板／關，負 = 拉起／開）。回傳實際轉動的角度 */
  turn(dAngle) {
    if (!dAngle) return 0;
    const closing = dAngle > 0;
    if (closing && this.isBlocked()) {
      this.state = 'blocked';
      return 0;
    }
    const before = this.open01;
    this.open01 = Math.max(0, Math.min(1, this.open01 - dAngle / GATE_FULL_ANGLE));
    const actual = (before - this.open01) * GATE_FULL_ANGLE;
    this.crank += actual;
    this.state = this.open01 <= 0 ? 'closed' : this.open01 >= 1 ? 'open' : closing ? 'closing' : 'opening';
    return actual;
  }

  /** 停手：closing／opening 停在半途就保持（擋板有棘爪，不會自己掉下去） */
  settle() {
    if (this.state === 'closing' || this.state === 'opening' || this.state === 'blocked') this.state = this.open01 <= 0 ? 'closed' : this.open01 >= 1 ? 'open' : 'partial';
  }
}

/** 掉下去的原因：每一種給不同的回饋 */
export const FALL_REASONS = Object.freeze({
  wind: '燈火被風吹熄，記憶的橋散了。',
  manual: '你收起了靈視，腳下的記憶跟著散了。',
});

/**
 * 給玩家的階段性提示：依玩家已經做過的事決定（不是固定時間表），同一條只給一次。
 * @param shown 已經給過的提示 id
 */
export function nextHint(progress, seconds, shown = new Set()) {
  const p = progress;
  const candidates = [
    ['raise', !p.revealed.has('stele-eye') && p.nearSteleEye > 6, '石碑上好像有什麼，但太暗了。走近調查，把燈籠舉高（F／舉燈）照照看。'],
    ['spirit', p.revealed.has('stele-eye') && !p.usedSpirit && seconds - p.revealedAt['stele-eye'] > 15, '一隻眼睛望著月亮……用燈籠看看月亮的另一面（Q／靈視）。'],
    ['smoke', p.falls >= 2 && !p.shutterClosed, '看看火盆的煙：煙往旁邊倒的時候，峽谷的風最強。'],
    ['gate', p.falls >= 4 && !p.shutterClosed, '峽谷東邊有一扇木閘門，旁邊的絞盤也許能把它關上。'],
  ];
  for (const [id, when, text] of candidates) if (when && !shown.has(id)) return { id, text };
  return null;
}
