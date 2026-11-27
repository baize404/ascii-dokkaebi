import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../src/game/Pathfinding.js';
import { GUST, LAYOUT, Lantern, colliders, exposedAt, gustAt, inBridgeGap, nextHint, onMemory, simulateCrossing } from '../../src/proto/rules.js';

describe('原型規則：風', () => {
  it('風有固定節奏：平靜 → 預兆 → 陣風', () => {
    expect(gustAt(1).phase).toBe('calm');
    expect(gustAt(GUST.calm + 0.4).phase).toBe('warn');
    expect(gustAt(GUST.calm + GUST.warn + 0.5).phase).toBe('gust');
    expect(gustAt(GUST.period + 1).phase).toBe('calm');
    expect(gustAt(GUST.calm + 0.1).strength).toBeLessThan(gustAt(GUST.calm + 0.7).strength);
  });
  it('只有峽谷裡、木閘門開著時才吹得到風', () => {
    expect(exposedAt(0, 0, false)).toBe(true);
    expect(exposedAt(0, 0, true)).toBe(false);
    expect(exposedAt(0, 10, false)).toBe(false);
  });
});

describe('原型規則：燈籠', () => {
  it('陣風中約 0.75 秒熄滅，舉高更快；避風時慢慢恢復', () => {
    const a = new Lantern();
    let t = 0;
    while (a.lit) {
      a.update(1 / 60, 1);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(0.6);
    expect(t).toBeLessThan(0.9);
    const b = new Lantern();
    b.raised = true;
    let tb = 0;
    while (b.lit) {
      b.update(1 / 60, 1);
      tb += 1 / 60;
    }
    expect(tb).toBeLessThan(t * 0.7);
    const c = new Lantern();
    c.update(0.3, 1);
    const low = c.heat;
    c.update(0.5, 0);
    expect(c.heat).toBeGreaterThan(low);
  });
  it('燈熄了不能靈視；靈視中熄滅會立刻結束靈視', () => {
    const l = new Lantern();
    expect(l.toggleSpirit()).toBe(true);
    let ev = [];
    while (l.lit) ev = l.update(1 / 60, 1);
    expect(ev).toContain('spiritOff');
    expect(l.spirit).toBe(false);
    expect(l.toggleSpirit()).toBe(false);
    l.ignite();
    expect(l.toggleSpirit()).toBe(true);
  });
});

describe('原型規則：記憶與碰撞', () => {
  it('人間走不過斷橋缺口，靈視時可以', () => {
    const human = new NavGrid(LAYOUT.bounds, colliders(false));
    const spirit = new NavGrid(LAYOUT.bounds, colliders(true));
    const from = LAYOUT.safeSouth;
    const to = { x: LAYOUT.lamp.x + 1.2, z: LAYOUT.lamp.z + 1 };
    expect(human.findPath(from, to).reached).toBe(false);
    expect(spirit.findPath(from, to).reached).toBe(true);
  });
  it('石碑 B 在溝的另一邊：只有靈視（記憶木板）才到得了', () => {
    const stele = LAYOUT.steles.find((s) => s.id === 'stele-wind');
    const near = { x: stele.x + 1.4, z: stele.z };
    expect(new NavGrid(LAYOUT.bounds, colliders(false)).findPath(LAYOUT.start, near).reached).toBe(false);
    expect(new NavGrid(LAYOUT.bounds, colliders(true)).findPath(LAYOUT.start, near).reached).toBe(true);
  });
  it('火盆、絞盤、石碑 A 在人間就走得到（不會一開始就卡住）', () => {
    const nav = new NavGrid(LAYOUT.bounds, colliders(false));
    for (const p of [LAYOUT.brazier, LAYOUT.winch, LAYOUT.steles[0]]) expect(nav.findPath(LAYOUT.start, { x: p.x, z: p.z + 1.4 }).reached).toBe(true);
  });
  it('記憶的位置判斷', () => {
    expect(inBridgeGap(0, 0)).toBe(true);
    expect(inBridgeGap(0, 3)).toBe(false);
    expect(onMemory(-5.5, LAYOUT.plank.z)).toBe(true);
    expect(onMemory(-5.5, LAYOUT.plank.z + 2)).toBe(false);
  });
});

describe('原型謎題可解性（模擬過橋）', () => {
  it('解法一：關上木閘門，任何時間出發都過得去（舉著燈也可以）', () => {
    for (let t0 = 0; t0 < GUST.period; t0 += 0.25) {
      expect(simulateCrossing({ t0, shutterClosed: true }).ok).toBe(true);
      expect(simulateCrossing({ t0, shutterClosed: true, raised: true }).ok).toBe(true);
    }
  });
  it('解法二：看煙，在風剛停（平靜開始）時出發就過得去', () => {
    expect(simulateCrossing({ t0: 0 }).ok).toBe(true);
    expect(simulateCrossing({ t0: 0.5 }).ok).toBe(true);
  });
  it('不看時機隨便走：大部分時間會被吹熄掉下去（需要觀察，不是送分）', () => {
    let ok = 0;
    let n = 0;
    for (let t0 = 0; t0 < GUST.period; t0 += 0.1) {
      n++;
      if (simulateCrossing({ t0 }).ok) ok++;
    }
    expect(ok / n).toBeGreaterThan(0.15);
    expect(ok / n).toBeLessThan(0.45);
  });
  it('陣風中出發一定失敗；失敗時人在記憶橋上（看得到掉下去）', () => {
    const r = simulateCrossing({ t0: GUST.calm + GUST.warn + 0.2 });
    expect(r.ok).toBe(false);
    expect(inBridgeGap(0, r.fellAt)).toBe(true);
  });
});

describe('原型提示', () => {
  const base = () => ({ revealed: new Set(), revealedAt: {}, usedSpirit: false, nearSteleEye: 0, falls: 0, shutterClosed: false });
  it('只在玩家卡住時給，依序：舉燈 → 靈視 → 看煙 → 木閘門', () => {
    const p = base();
    expect(nextHint(p, 10)).toBeNull();
    p.nearSteleEye = 7;
    expect(nextHint(p, 10).id).toBe('raise');
    p.revealed.add('stele-eye');
    p.revealedAt['stele-eye'] = 20;
    expect(nextHint(p, 25)).toBeNull();
    expect(nextHint(p, 40).id).toBe('spirit');
    p.usedSpirit = true;
    const shown = new Set(['raise', 'spirit']);
    p.falls = 2;
    expect(nextHint(p, 60, shown).id).toBe('smoke');
    shown.add('smoke');
    expect(nextHint(p, 61, shown)).toBeNull();
    p.falls = 4;
    expect(nextHint(p, 80, shown).id).toBe('gate');
    p.shutterClosed = true;
    expect(nextHint(p, 90, new Set())).toBeNull();
  });
});
