import { describe, expect, it } from 'vitest';
import { GESTURE, GestureTracker } from '../../src/core/Gesture.js';

describe('手勢狀態機', () => {
  it('短按不移動是輕觸', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    expect(g.state).toBe(GESTURE.PRESS);
    expect(g.up(1, 103, 101, 120)).toEqual([{ type: 'tap', x: 103, y: 101 }]);
    expect(g.state).toBe(GESTURE.IDLE);
  });

  it('拖曳超過容許範圍就不算輕觸', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    g.move(1, 140, 100);
    expect(g.state).toBe(GESTURE.DRAG);
    expect(g.up(1, 100, 100, 200)).toEqual([]);
  });

  it('長按太久不算輕觸', () => {
    const g = new GestureTracker({ tapMaxMs: 500 });
    g.down(1, 10, 10, 0);
    expect(g.up(1, 10, 10, 900)).toEqual([]);
  });

  it('雙指縮放產生縮放事件，結束時剩下的手指放開不會變成點擊', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 10);
    expect(g.state).toBe(GESTURE.PINCH);
    const ev = g.move(2, 300, 100);
    expect(ev[0].type).toBe('zoom');
    expect(ev[0].delta).toBeLessThan(0); // 手指張開 = 拉近
    expect(g.up(2, 300, 100, 300)).toEqual([]);
    expect(g.state).toBe(GESTURE.PINCH);
    // 第一根手指幾乎沒動，但因為剛剛在縮放，放開時不能算點擊地面
    expect(g.up(1, 100, 100, 320)).toEqual([]);
    expect(g.state).toBe(GESTURE.IDLE);
  });

  it('取消與重設後回到 idle', () => {
    const g = new GestureTracker();
    g.down(1, 0, 0, 0);
    g.down(2, 50, 0, 0);
    g.reset();
    expect(g.state).toBe(GESTURE.IDLE);
    expect(g.up(1, 0, 0, 10)).toEqual([]);
    g.down(3, 0, 0, 0);
    g.cancel(3);
    expect(g.state).toBe(GESTURE.IDLE);
  });

  it('沒按下就移動或放開不會出錯', () => {
    const g = new GestureTracker();
    expect(g.move(9, 1, 1)).toEqual([]);
    expect(g.up(9, 1, 1, 0)).toEqual([]);
  });
});
