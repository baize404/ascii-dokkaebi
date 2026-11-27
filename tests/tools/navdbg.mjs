import { buildColliders } from '../../src/world/layout.js';
import { NavGrid } from '../../src/game/Pathfinding.js';
import { LEVEL } from '../../src/data/level.js';
const g = new NavGrid(LEVEL.bounds, buildColliders(LEVEL, { kitchenDoorOpen: true }));
const k = LEVEL.houses[0];
let out = '';
for (let z = k.z - 3; z <= k.z + 3; z += 0.5) {
  let row = '';
  for (let x = k.x - 4; x <= k.x + 6; x += 0.5) row += (g.walkableAt(x, z) ? '.' : "#");
  out += z.toFixed(1).padStart(6) + ' ' + row + '\n';
}
console.log(out);
