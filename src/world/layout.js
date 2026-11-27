import { makeBox } from './Collision.js';

/**
 * 依關卡資料算出所有碰撞盒（純函式，不依賴 Three.js）。
 * World 用它做碰撞，NavGrid 用它做尋路，單元測試也用它檢查每個互動點都走得到。
 * @param options.ropeOpen 금줄是否已經斷開
 */
export function buildColliders(level, { ropeOpen = false, kitchenDoorOpen = false } = {}) {
  const boxes = [];
  for (const h of level.houses) {
    if (h.walkIn) boxes.push(...kitchenColliders(h, kitchenDoorOpen));
    else boxes.push(makeBox(h.x, h.z, h.w + 0.8, h.d + 0.8));
  }

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

/** 廚房（可以走進去）：四面牆（東牆中間是門洞）、門扇、灶台、碗櫃、飯桌、水缸、米袋、柴堆、油燈 */
export const KITCHEN_LAYOUT = { wall: 0.16, doorHalf: 0.85, platform: { w: 1.15, d: 3.4 } };
export function kitchenColliders(h, doorOpen) {
  const { wall, doorHalf, platform } = KITCHEN_LAYOUT;
  const hw = h.w / 2;
  const hd = h.d / 2;
  const t = wall + 0.1;
  const eastLen = hd - doorHalf;
  const local = [
    [0, -hd, h.w + t, t],
    [0, hd, h.w + t, t],
    [-hw, 0, t, h.d + t],
    [hw, -(doorHalf + eastLen / 2), t, eastLen],
    [hw, doorHalf + eastLen / 2, t, eastLen],
    [-hw + wall / 2 + platform.w / 2, 0, platform.w + 0.1, platform.d + 0.1], // 灶台
    [1.3, -hd + 0.45, 1.7, 0.5], // 碗櫃
    [0.6, 1.0, 0.85, 0.85], // 飯桌
    [2.7, 2.0, 0.75, 0.75], // 水缸
    [2.6, -1.6, 0.7, 0.65], // 米袋
    [-hw + 1.4, 2.1, 0.75, 0.5], // 柴堆
    [-0.4, -1.7, 0.3, 0.3], // 油燈
  ];
  // 門關著時兩片門扇擋住門洞；打開後門扇貼在門洞兩側往內
  if (!doorOpen) local.push([hw, 0, t, doorHalf * 2]);
  else for (const s of [-1, 1]) local.push([hw - 0.4, s * (doorHalf - 0.02), 0.75, 0.12]);
  return local.map(([x, z, w, d]) => makeBox(h.x + x, h.z + z, w, d));
}
