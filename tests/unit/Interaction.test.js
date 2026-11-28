import { describe, expect, it } from 'vitest';
import { InteractionController } from '../../src/proto/Interaction.js';

/** 假的玩家：walkTo 立刻成功（或失敗），轉身瞬間完成 */
function fakePlayer({ reachable = true } = {}) {
  const p = { x: 0, z: 0, pending: null, faced: null };
  return {
    p,
    o: {
      position: () => p,
      walkTo: (pt, onArrive, onFail) => {
        if (!reachable) return { ok: false };
        p.pending = () => {
          p.x = pt.x;
          p.z = pt.z;
          onArrive();
        };
        return { ok: true };
      },
      stopWalking: () => (p.pending = null),
      face: (pt) => (p.faced = pt),
      yawError: () => 0,
    },
  };
}
const steps = (ic, n, ctx = {}) => {
  for (let i = 0; i < n; i++) ic.update(1 / 60, ctx);
};

describe('互動控制器', () => {
  it('完整流程：走過去 → 對齊 → 接觸 → 依實際進度生效（只一次）→ 收手', () => {
    const { p, o } = fakePlayer();
    const ic = new InteractionController(o);
    let gate = 0;
    let commits = 0;
    let cleaned = null;
    const def = {
      id: 'winch',
      stand: { x: 3, z: 0 },
      face: { x: 4, z: 0 },
      engage: () => {},
      contact: () => true,
      commit: (c, dt) => (gate = Math.min(1, gate + dt / 0.5)), // 機關自己決定多久轉完
      onCommit: () => commits++,
      recover: () => true,
      cleanup: (c, result) => (cleaned = result),
    };
    expect(ic.start(def)).toBe(true);
    expect(ic.state).toBe('approach');
    expect(ic.start(def)).toBe(false); // 連點不會開第二個
    p.pending();
    expect(ic.state).toBe('align');
    steps(ic, 2);
    expect(ic.state).toBe('commit');
    steps(ic, 20);
    expect(commits).toBe(0); // 機關還沒轉完，不生效
    steps(ic, 30);
    expect(commits).toBe(1);
    steps(ic, 5);
    expect(ic.state).toBe('idle');
    expect(cleaned).toBe('complete');
    expect(ic.log.map((l) => l.state)).toEqual(['approach', 'align', 'engage', 'contact', 'commit', 'recover', 'complete']);
  });

  it('走路途中推方向鍵就取消，而且之後抵達的回呼不會再觸發', () => {
    const { p, o } = fakePlayer();
    const ic = new InteractionController(o);
    let engaged = false;
    ic.start({ id: 'stele', stand: { x: 5, z: 5 }, engage: () => (engaged = true) });
    ic.update(1 / 60, { moving: true });
    expect(ic.lastResult).toEqual({ id: 'stele', result: 'cancel', reason: 'move' });
    expect(p.pending).toBe(null);
    expect(engaged).toBe(false);
  });

  it('走不到的地方：失敗並回報原因', () => {
    const { o } = fakePlayer({ reachable: false });
    const ic = new InteractionController(o);
    ic.start({ id: 'lamp', stand: { x: 9, z: 9 } });
    expect(ic.lastResult).toEqual({ id: 'lamp', result: 'failed', reason: 'unreachable' });
    expect(ic.busy).toBe(false);
  });

  it('生效中被外力中斷（例如掉落）：一定會收拾，且不會生效', () => {
    const { o } = fakePlayer();
    const ic = new InteractionController(o);
    let commits = 0;
    let cleaned = null;
    ic.start({ id: 'w', contact: () => true, commit: () => 0.3, onCommit: () => commits++, cleanup: (c, r, why) => (cleaned = `${r}:${why}`) });
    steps(ic, 4);
    expect(ic.state).toBe('commit');
    expect(ic.cancel()).toBe(false); // 生效中不能用一般取消
    ic.interrupt('fall');
    expect(cleaned).toBe('interrupted:fall');
    expect(commits).toBe(0);
    expect(ic.busy).toBe(false);
  });

  it('cancelDuringCommit：生效中推方向鍵可以停下（例如絞盤轉到一半）', () => {
    const { o } = fakePlayer();
    const ic = new InteractionController(o);
    let progress = 0;
    ic.start({ id: 'w', cancelDuringCommit: true, contact: () => true, commit: (c, dt) => (progress += dt) });
    steps(ic, 10);
    ic.update(1 / 60, { moving: true });
    expect(ic.lastResult.result).toBe('cancel');
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
  });
});
