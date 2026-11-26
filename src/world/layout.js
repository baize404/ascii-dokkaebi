import { makeBox } from './Collision.js';

/**
 * 依關卡資料算出所有碰撞盒（純函式，不依賴 Three.js）。
 * World 用它做碰撞，NavGrid 用它做尋路，單元測試也用它檢查每個互動點都走得到。
 * @param options.ropeOpen 금줄是否已經斷開
 */
export function buildColliders(level, { ropeOpen = false } = {}) {
  const boxes = [];
  for (const h of level.houses) boxes.push(makeBox(h.x, h.z, h.w + 0.8, h.d + 0.8));

  const kitchen = level.houses.find((h) => h.id === 'kitchen');
  boxes.push(makeBox(kitchen.x - kitchen.w / 2 - 1.0, kitchen.z - 1.2, 0.9, 0.9)); // 煙囪

  const s = level.storehouse;
  boxes.push(makeBox(s.x, s.z, s.w + 0.6, s.d + 0.6));
  boxes.push(makeBox(level.well.x, level.well.z, 2.6, 2.4));
  boxes.push(makeBox(level.jars.x, level.jars.z, 3.2, 2.2));
  boxes.push(makeBox(level.pond.x, level.pond.z, level.pond.r * 1.7, level.pond.r * 1.7));
  for (const j of level.jangseung) boxes.push(makeBox(j.x, j.z, 0.9, 0.9));
  for (const l of level.lanternSpots) boxes.push(makeBox(l.x, l.z, 1.0, 1.0));
  boxes.push(makeBox(level.altar.x, level.altar.z, 2.4, 1.4));
  boxes.push(makeBox(level.shrineTree.x, level.shrineTree.z, 2.4, 2.4));
  boxes.push(makeBox(level.catSpots[0].x, level.catSpots[0].z, 0.8, 0.8)); // 黑貓坐的石頭
  for (const t of level.trees) boxes.push(makeBox(t.x, t.z, 0.8, 0.8));

  // 山丘外圍的石牆：一圈小方塊，南邊留入口
  const m = level.mound;
  const steps = Math.ceil((Math.PI * 2 * m.wallRadius) / 0.9);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = m.x + Math.cos(a) * m.wallRadius;
    const z = m.z + Math.sin(a) * m.wallRadius;
    if (z > m.z && Math.abs(x - m.x) < m.openingHalfWidth + 0.5) continue;
    boxes.push(makeBox(x, z, 1.0, 1.0));
  }
  // 금줄
  if (!ropeOpen) boxes.push(makeBox(level.rope.x, level.rope.z, level.rope.w, level.rope.d));
  return boxes;
}

/** 山丘石牆每一塊石頭的位置（給 World 畫牆用，和碰撞一致） */
export function moundWallStones(level) {
  const m = level.mound;
  const steps = Math.ceil((Math.PI * 2 * m.wallRadius) / 0.9);
  const stones = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = m.x + Math.cos(a) * m.wallRadius;
    const z = m.z + Math.sin(a) * m.wallRadius;
    if (z > m.z && Math.abs(x - m.x) < m.openingHalfWidth + 0.5) continue;
    stones.push({ x, z, a });
  }
  return stones;
}
