import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { angleDelta, BASIS_TRACK_RATE, CameraDirector, occlusionStep, OCCLUSION, trackBasis } from '../../src/proto/CameraDirector.js';

const make = (aspect = 16 / 9) => {
  const cam = new PerspectiveCamera(50, aspect, 0.1, 200);
  const d = new CameraDirector(cam);
  d.setAspect(aspect);
  d.follow(new Vector3(0, 0, 0), null, true);
  d.snap();
  d.update(1 / 60);
  return d;
};
const run = (d, seconds, hz = 60, each = null) => {
  const n = Math.round(seconds * hz);
  for (let i = 0; i < n; i++) {
    each?.(i, n);
    d.update(1 / hz);
  }
};

describe('移動基準：鏡頭轉動時方向鍵不會突然反向', () => {
  it('沒按方向鍵時直接等於鏡頭方位', () => {
    expect(trackBasis(0, 2.5, false, 1 / 60)).toBe(2.5);
  });
  it('按著方向鍵時以有限速率追上，不會一格跳過去', () => {
    let b = 0;
    b = trackBasis(b, Math.PI, true, 1 / 60);
    expect(Math.abs(b)).toBeCloseTo(BASIS_TRACK_RATE / 60, 5);
    for (let i = 0; i < 600; i++) b = trackBasis(b, Math.PI, true, 1 / 60);
    expect(Math.abs(angleDelta(b, Math.PI))).toBeLessThan(1e-6);
  });
});

describe('遮擋：快速拉近、延遲後慢慢退回', () => {
  it('被擋住時一兩格內就拉近，不會讓牆擋住角色', () => {
    const s = { dist: 10, clearFor: 0 };
    for (let i = 0; i < 12; i++) occlusionStep(s, 10, 4, 1 / 60);
    expect(s.dist).toBeLessThan(6);
  });
  it('障礙物消失後先等一下，再慢慢退回，不會來回抖', () => {
    const s = { dist: 3.5, clearFor: 0 };
    occlusionStep(s, 10, null, OCCLUSION.releaseDelay * 0.5);
    expect(s.dist).toBe(3.5);
    const trace = [];
    for (let i = 0; i < 240; i++) trace.push(occlusionStep(s, 10, null, 1 / 60));
    expect(trace.at(-1)).toBeGreaterThan(9);
    for (let i = 1; i < trace.length; i++) expect(trace[i]).toBeGreaterThanOrEqual(trace[i - 1]); // 單調，沒有來回
  });
});

describe('鏡頭導演', () => {
  it('演出結束後恢復玩家原本的模式、方位、俯仰與縮放（不是重設成預設）', () => {
    const d = make();
    d.setUserMode('third', { instant: true });
    d.orbit(120, -30);
    d.zoomBy(0.2);
    const before = { mode: d.userMode, yaw: d.yaw, pitch: d.pitch, zoom: { ...d.zoom } };
    d.play({ kind: 'inspect', pose: (t, o) => o.pos.set(5, 2, 5) && o.look.set(0, 1, 0) && (o.fov = 40) });
    run(d, 1);
    d.orbit(500, 200); // 調查中的拖曳不會改到自由鏡頭的設定
    expect(d.info().shot).toBe('inspect');
    d.end();
    expect({ mode: d.userMode, yaw: d.yaw, pitch: d.pitch, zoom: d.zoom }).toEqual(before);
  });

  it('轉場平滑：每格位移有上限；中途被另一段演出打斷也不跳', () => {
    const d = make();
    let maxStep = 0;
    let maxJerk = 0;
    let lastStep = 0;
    let prev = d.camera.position.clone();
    const track = () => {
      const step = prev.distanceTo(d.camera.position);
      maxStep = Math.max(maxStep, step);
      maxJerk = Math.max(maxJerk, Math.abs(step - lastStep));
      lastStep = step;
      prev = d.camera.position.clone();
    };
    d.play({ kind: 'action', blendIn: 0.6, pose: (t, o) => (o.pos.set(-8, 3, 4), o.look.set(0, 1, 0), (o.fov = 42)) });
    for (let i = 0; i < 15; i++) (d.update(1 / 60), track());
    d.play({ kind: 'cinematic', blendIn: 0.6, pose: (t, o) => (o.pos.set(8, 6, -6), o.look.set(0, 0, -3), (o.fov = 45)) });
    for (let i = 0; i < 60; i++) (d.update(1 / 60), track());
    expect(maxStep).toBeLessThan(0.9); // 18 公尺的轉場，每格最多不到 1 公尺
    expect(maxJerk).toBeLessThan(0.12); // 打斷時速度連續：沒有突然停住或彈跳
    expect(d.camera.position.distanceTo(new Vector3(8, 6, -6))).toBeLessThan(0.01);
  });

  it('自由鏡頭跟隨和幀率無關（30 Hz 與 144 Hz 的結果接近）', () => {
    const sim = (hz) => {
      const d = make();
      const p = new Vector3();
      run(d, 3, hz, (i, n) => {
        p.set(0, 0, -6 * (i / n));
        d.follow(p, new Vector3(0, 0, -2));
      });
      return d.camera.position.clone();
    };
    expect(sim(30).distanceTo(sim(144))).toBeLessThan(0.12);
  });

  it('直式畫面拉遠並加寬視角，避免切掉重要物件', () => {
    const wide = make(16 / 9);
    const tall = make(390 / 844);
    run(wide, 1);
    run(tall, 1);
    const dist = (d) => d.camera.position.distanceTo(d.pose.look);
    expect(dist(tall)).toBeGreaterThan(dist(wide) * 1.2);
    expect(tall.camera.fov).toBeGreaterThan(wide.camera.fov);
  });

  it('演出期間鎖住移動，恢復後解鎖；硬切（blendIn 0）直接到位', () => {
    const d = make();
    d.play({ kind: 'recovery', blendIn: 0, pose: (t, o) => (o.pos.set(1, 9, 1), o.look.set(0, 0, 0), (o.fov = 50)) });
    d.update(1 / 60);
    expect(d.inputLocked).toBe(true);
    expect(d.camera.position.distanceTo(new Vector3(1, 9, 1))).toBeLessThan(1e-6);
    d.end();
    expect(d.inputLocked).toBe(false);
  });

  it('過橋輔助只在玩家沒有手動轉鏡頭時作用', () => {
    const d = make();
    d.yaw = 1.2;
    d.setAssist({ yaw: 0, weight: 1, pitch: 0.1 });
    run(d, 2);
    expect(Math.abs(d.yaw)).toBeLessThan(0.1);
    d.orbit(-200, 0);
    const manual = d.yaw;
    run(d, 1);
    expect(d.yaw).toBeCloseTo(manual, 5); // 手動轉過的 3 秒內不輔助
  });
});
