import { describe, expect, it } from 'vitest';
import { DOOR, DoorController } from '../../src/world/DoorController.js';

const run = (d, seconds, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) d.update(dt);
};

describe('門窗控制器', () => {
  it('鎖住 → 開鎖 → 關著 → 開門 → 全開', async () => {
    const states = [];
    const d = new DoorController({ locked: true, onStateChange: (s) => states.push(s) });
    expect(d.state).toBe(DOOR.LOCKED);
    expect(await Promise.race([d.open(), Promise.resolve('x')])).toBe(DOOR.LOCKED); // 鎖著打不開
    const u = d.unlock();
    run(d, 0.6);
    expect(await u).toBe(DOOR.CLOSED);
    const o = d.open();
    run(d, 1.2);
    expect(await o).toBe(DOOR.OPEN);
    expect(d.open01).toBe(1);
    expect(states).toEqual([DOOR.UNLOCKING, DOOR.CLOSED, DOOR.OPENING, DOOR.OPEN]);
  });

  it('開門角度依 dt 推進，與幀率無關', () => {
    const a = new DoorController({ openSeconds: 1 });
    const b = new DoorController({ openSeconds: 1 });
    a.open();
    b.open();
    run(a, 0.5, 1 / 144);
    run(b, 0.5, 1 / 20);
    expect(Math.abs(a.open01 - b.open01)).toBeLessThan(0.06);
  });

  it('開到一半改成關門：平順反轉，不會跳到全開或全關', () => {
    const d = new DoorController({ openSeconds: 1 });
    d.open();
    run(d, 0.4);
    const mid = d.open01;
    d.close();
    d.update(1 / 30);
    expect(d.state).toBe(DOOR.CLOSING);
    expect(Math.abs(d.open01 - mid)).toBeLessThan(0.05);
  });

  it('關門時有人擋住 → Blocked → 自動重新打開，不會把人推進牆裡', () => {
    let someone = true;
    const states = [];
    const d = new DoorController({ isBlocked: () => someone, onStateChange: (s) => states.push(s) });
    d.open();
    run(d, 1.2);
    d.close();
    run(d, 0.2);
    expect(states).toContain(DOOR.BLOCKED);
    run(d, 1.5);
    expect(d.state).toBe(DOOR.OPEN);
    someone = false;
    d.close();
    run(d, 1.5);
    expect(d.state).toBe(DOOR.CLOSED);
  });

  it('連續快速操作不會錯亂；重複呼叫等待同一個結果', async () => {
    const d = new DoorController({ openSeconds: 0.5 });
    const p1 = d.open();
    const p2 = d.open();
    d.close();
    d.open();
    d.close();
    d.open();
    run(d, 1);
    expect(d.state).toBe(DOOR.OPEN);
    expect(await p1).toBe(DOOR.OPEN);
    expect(await p2).toBe(DOOR.OPEN);
  });

  it('存檔：開到一半算開著；讀檔直接套用角度', () => {
    const d = new DoorController();
    d.open();
    d.update(0.1);
    expect(d.toJSON()).toBe(DOOR.OPEN);
    const e = new DoorController();
    let angle = -1;
    e.onAngle = (a) => (angle = a);
    e.restore(DOOR.OPEN);
    expect(e.state).toBe(DOOR.OPEN);
    expect(angle).toBe(1);
    expect(e.blocksPassage).toBe(false);
  });
});

describe('動態門窗碰撞與尋路', async () => {
  const { buildColliders } = await import('../../src/world/layout.js');
  const { NavGrid } = await import('../../src/game/Pathfinding.js');
  const { LEVEL } = await import('../../src/data/level.js');
  const k = LEVEL.houses.find((h) => h.id === 'kitchen');
  const outside = { x: -6.2, z: 9.5 };
  const table = { x: k.x + 1.9, z: k.z + 0.6 };

  it('廚房門關著：走不進屋裡；打開：可以從門口走到飯桌前', () => {
    const closed = new NavGrid(LEVEL.bounds, buildColliders(LEVEL, { kitchenDoorOpen: false }));
    const open = new NavGrid(LEVEL.bounds, buildColliders(LEVEL, { kitchenDoorOpen: true }));
    expect(closed.findPath(outside, table).reached).toBe(false);
    const path = open.findPath(outside, table);
    expect(path.reached).toBe(true);
    // 路徑經過門洞（x 接近東牆時，z 在門洞範圍內）
    const atWall = path.points.filter((p) => Math.abs(p.x - (k.x + k.w / 2)) < 0.4);
    for (const p of atWall) expect(Math.abs(p.z - k.z)).toBeLessThan(0.85);
  });

  it('不能穿牆：屋外到屋裡的路徑不會穿過牆壁', () => {
    const open = new NavGrid(LEVEL.bounds, buildColliders(LEVEL, { kitchenDoorOpen: true }));
    const south = { x: k.x, z: k.z + k.d / 2 + 1.2 };
    const path = open.findPath(south, table);
    expect(path.reached).toBe(true);
    const length = path.points.reduce((s, p, i, arr) => s + (i ? Math.hypot(p.x - arr[i - 1].x, p.z - arr[i - 1].z) : 0), 0);
    expect(length).toBeGreaterThan(Math.hypot(south.x - table.x, south.z - table.z) + 1);
  });
});
