/**
 * 2D（XZ 平面）碰撞：玩家是圓形，障礙物是軸對齊矩形（AABB）。
 */
export function makeBox(x, z, w, d) {
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

/** 把圓心推出所有重疊的矩形，回傳修正後的位置 {x, z}。 */
export function resolveCircle(pos, radius, boxes) {
  let { x, z } = pos;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;
      if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        x = cx + (dx / dist) * radius;
        z = cz + (dz / dist) * radius;
      } else {
        // 圓心在矩形裡面：往最近的邊推出去
        const pushes = [
          [b.minX - radius - x, 0],
          [b.maxX + radius - x, 0],
          [0, b.minZ - radius - z],
          [0, b.maxZ + radius - z],
        ];
        pushes.sort((a, c) => Math.hypot(...a) - Math.hypot(...c));
        x += pushes[0][0];
        z += pushes[0][1];
      }
    }
  }
  return { x, z };
}

export function clampToBounds(pos, radius, bounds) {
  return {
    x: Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, pos.x)),
    z: Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, pos.z)),
  };
}
