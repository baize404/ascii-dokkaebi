import { describe, expect, it } from 'vitest';
import { ParticleSystem } from '../../src/world/Particles.js';

describe('ParticleSystem', () => {
  it('噴出的粒子會在壽命結束後回收', () => {
    const ps = new ParticleSystem(50);
    ps.emit({ x: 0, y: 1, z: 0, count: 10, life: 0.5 });
    expect(ps.alive).toBe(10);
    ps.update(0.1);
    expect(ps.alive).toBe(10);
    for (let i = 0; i < 20; i++) ps.update(0.1);
    expect(ps.alive).toBe(0);
    expect(ps.geometry.drawRange.count).toBe(0);
  });

  it('數量不會超過上限', () => {
    const ps = new ParticleSystem(20);
    ps.emit({ x: 0, y: 0, z: 0, count: 50 });
    expect(ps.alive).toBe(20);
  });

  it('粒子不會掉到地面以下', () => {
    const ps = new ParticleSystem(5);
    ps.emit({ x: 0, y: 0.5, z: 0, count: 5, up: 0, gravity: 30, life: 5 });
    for (let i = 0; i < 30; i++) ps.update(0.05);
    for (let i = 0; i < ps.alive; i++) expect(ps.pos[i * 3 + 1]).toBeGreaterThan(0.019);
  });
});
