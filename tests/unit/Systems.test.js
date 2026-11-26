import { describe, expect, it } from 'vitest';
import { LEVEL } from '../../src/data/level.js';
import { Settings } from '../../src/core/Settings.js';
import { Achievements } from '../../src/game/Achievements.js';
import { GameState } from '../../src/game/GameState.js';
import { Inventory } from '../../src/game/Inventory.js';
import { NavGrid } from '../../src/game/Pathfinding.js';
import { SaveSystem } from '../../src/game/SaveSystem.js';
import { ShellGame } from '../../src/game/ShellGame.js';
import { buildColliders } from '../../src/world/layout.js';

/** 假的 localStorage */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

describe('Pathfinding', () => {
  const grid = new NavGrid({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, [{ minX: 4, maxX: 6, minZ: 0, maxZ: 8 }]);

  it('會繞過障礙物', () => {
    const path = grid.findPath({ x: 2, z: 2 }, { x: 8, z: 2 });
    expect(path.unreachable).toBe(false);
    expect(path.reached).toBe(true);
    // 牆在 z<8，路徑一定要繞到 z>8 那一側
    expect(Math.max(...path.points.map((p) => p.z))).toBeGreaterThan(8);
    for (const p of path.points) expect(grid.walkableAt(p.x, p.z)).toBe(true);
  });

  it('目標在障礙物裡時改走到最近的可走位置', () => {
    const path = grid.findPath({ x: 2, z: 2 }, { x: 5, z: 4 });
    expect(path.reached).toBe(false);
    expect(path.unreachable).toBe(false);
  });

  it('完全被圍住的地方回報走不到', () => {
    const walled = new NavGrid({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, [{ minX: 0, maxX: 10, minZ: 4, maxZ: 6 }]);
    expect(walled.findPath({ x: 2, z: 2 }, { x: 2, z: 8 }).unreachable).toBe(true);
  });
});

describe('關卡可解性', () => {
  const closed = new NavGrid(LEVEL.bounds, buildColliders(LEVEL, { ropeOpen: false }));
  const open = new NavGrid(LEVEL.bounds, buildColliders(LEVEL, { ropeOpen: true }));
  const start = LEVEL.playerStart;
  const inside = (i) => i.id === 'altar';

  it('금줄斷開前，除了祭壇以外的互動點都走得到', () => {
    for (const it of LEVEL.interactables.filter((i) => !inside(i))) {
      const p = closed.findPath(start, it);
      expect(p.unreachable, it.id).toBe(false);
      expect(p.reached, it.id).toBe(true);
    }
    for (const stand of LEVEL.catStands) expect(closed.findPath(start, stand).reached).toBe(true);
  });

  it('금줄擋住山丘；斷開後祭壇走得到', () => {
    const altar = LEVEL.interactables.find(inside);
    expect(closed.findPath(start, altar).reached).toBe(false);
    expect(open.findPath(start, altar).reached).toBe(true);
  });

  it('每個互動點的站位都不在障礙物裡', () => {
    for (const it of LEVEL.interactables) expect(open.walkableAt(it.x, it.z), it.id).toBe(true);
  });
});

describe('SaveSystem', () => {
  it('存檔後可以讀回來', () => {
    const storage = memoryStorage();
    const saves = new SaveSystem(storage);
    const s = new GameState({ seed: 42 });
    s.readStele();
    s.visitKitchen();
    expect(saves.save(s, { x: 1.234, z: -5, yaw: 1 })).toBe(true);
    expect(saves.hasSave()).toBe(true);
    const loaded = saves.load();
    expect(loaded.state.inventory.list()).toEqual(['gourd']);
    expect(loaded.player).toEqual({ x: 1.23, z: -5, yaw: 1 });
  });

  it('損壞的存檔會被備份並清除，不會丟出錯誤', () => {
    const storage = memoryStorage();
    storage.setItem('ascii-dokkaebi.save', '{這不是 JSON');
    const saves = new SaveSystem(storage);
    expect(saves.load()).toBeNull();
    expect(saves.lastError).toBeTruthy();
    expect(storage.getItem('ascii-dokkaebi.save.corrupt')).toBe('{這不是 JSON');
    expect(saves.hasSave()).toBe(false);
  });

  it('版本不符的存檔不會載入', () => {
    const storage = memoryStorage();
    storage.setItem('ascii-dokkaebi.save', JSON.stringify({ version: 1, state: {}, player: { x: 0, z: 0 } }));
    expect(new SaveSystem(storage).load()).toBeNull();
  });

  it('已破關的存檔不算可以繼續', () => {
    const storage = memoryStorage();
    const saves = new SaveSystem(storage);
    const s = new GameState({ seed: 1 });
    s.flags.finished = true;
    saves.save(s, { x: 0, z: 0 });
    expect(saves.hasSave()).toBe(false);
  });
});

describe('Settings', () => {
  it('會驗證數值並保存', () => {
    const storage = memoryStorage();
    const events = [];
    const settings = new Settings({ emit: (t, p) => events.push(p) }, storage);
    expect(settings.set('musicVolume', 3)).toBe(true);
    expect(settings.get('musicVolume')).toBe(1);
    expect(settings.set('density', 'huge')).toBe(false);
    expect(settings.set('reduceMotion', true)).toBe(true);
    expect(events).toHaveLength(2);
    expect(new Settings(null, storage).get('reduceMotion')).toBe(true);
  });

  it('壞掉的設定資料會改用預設值', () => {
    const storage = memoryStorage();
    storage.setItem('ascii-dokkaebi.settings', '{"quality":"ultra","sfxVolume":"loud"}');
    const settings = new Settings(null, storage);
    expect(settings.get('quality')).toBe('auto');
    expect(settings.get('sfxVolume')).toBe(0.8);
  });
});

describe('Inventory 組合', () => {
  it('破帽子 + 針線 → 감투（順序無關）', () => {
    const inv = new Inventory(['needle', 'tornHat']);
    expect(inv.combine('needle', 'tornHat').output).toBe('hat');
    expect(inv.list()).toEqual(['hat']);
    expect(new Inventory(['muk', 'key']).combine('muk', 'key')).toBeNull();
  });
});

describe('ShellGame', () => {
  it('答案等於月亮那個甕最後所在的位置', () => {
    let seed = 1;
    const game = new ShellGame(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    for (let i = 0; i < 50; i++) {
      const round = game.newRound();
      const jarAt = [0, 1, 2];
      for (const [a, b] of round.swaps) [jarAt[a], jarAt[b]] = [jarAt[b], jarAt[a]];
      expect(jarAt[round.answer]).toBe(round.moonJar);
      for (const [a, b] of round.swaps) expect(a).not.toBe(b);
    }
  });
});

describe('Achievements', () => {
  it('達成條件時解鎖，並跨遊戲保存', () => {
    const storage = memoryStorage();
    const ach = new Achievements(storage);
    const fresh = ach.evaluate({ finished: true, ending: 'normal', hintsUsed: 0, exploration: 0.5, codexUnlocked: 1, codexTotal: 10, catStage: 0, seconds: 900, lanternsDone: true, lanternMistakes: 1, riddleMistakes: 0, shellMistakes: 0 });
    expect(fresh.map((a) => a.id)).toEqual(['moon', 'noHints', 'sharpEyes']);
    expect(new Achievements(storage).isUnlocked('moon')).toBe(true);
    expect(ach.evaluate({ finished: true, hintsUsed: 0 }).length).toBe(0);
  });
});
