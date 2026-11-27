import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LEVEL } from '../../src/data/level.js';
import { CameraRig } from '../../src/game/CameraRig.js';

function settle(rig, seconds = 6) {
  for (let i = 0; i < seconds * 30; i++) rig.update(1 / 30);
}

/** 角色（約 1.2 m 高）在畫面上占的高度比例 */
function screenFraction(camera, target, height = 1.2) {
  camera.updateMatrixWorld();
  const a = target.clone().project(camera);
  const b = target.clone().setY(target.y + height).project(camera);
  return Math.abs(b.y - a.y) / 2;
}

describe('CameraRig 視角', () => {
  const make = () => {
    const camera = new PerspectiveCamera(38, 16 / 10, 0.1, 400);
    const rig = new CameraRig(camera);
    rig.setAspect(16 / 10);
    return { camera, rig };
  };

  it('遠景與近景的操作方向相同（切換視角不會讓按鍵方向改變）', () => {
    const { rig } = make();
    const a = rig.groundAxes();
    rig.setView('close');
    const b = rig.groundAxes();
    expect(a.forward.distanceTo(b.forward)).toBeLessThan(1e-9);
    expect(a.right.distanceTo(b.right)).toBeLessThan(1e-9);
  });

  it('近景時主角占畫面高度約 25%～45%，遠景時較小', () => {
    const { camera, rig } = make();
    const target = new Vector3(0, 0, 10);
    rig.follow(target, true);
    settle(rig);
    const far = screenFraction(camera, target);
    rig.setView('close');
    settle(rig);
    const near = screenFraction(camera, target);
    expect(far).toBeLessThan(0.15);
    expect(near).toBeGreaterThan(0.25);
    expect(near).toBeLessThan(0.45);
    // 鏡頭方位角不變（從同一側看）
    const dir = camera.position.clone().sub(target).setY(0).normalize();
    expect(dir.x).toBeGreaterThan(0.5);
    expect(dir.z).toBeGreaterThan(0.5);
  });

  it('切換視角是平滑過渡，不會瞬間跳動', () => {
    const { camera, rig } = make();
    const target = new Vector3(0, 0, 0);
    rig.follow(target, true);
    settle(rig, 2);
    rig.setView('close');
    let prev = camera.position.clone();
    let maxStep = 0;
    for (let i = 0; i < 90; i++) {
      rig.update(1 / 30);
      maxStep = Math.max(maxStep, camera.position.distanceTo(prev));
      prev = camera.position.clone();
    }
    expect(maxStep).toBeLessThan(2.5);
  });

  it('對話鏡頭同時拍到兩個角色，調查鏡頭看著物件', () => {
    const { camera, rig } = make();
    const player = new Vector3(0, 0, 0);
    const npc = new Vector3(2, 0, -1);
    rig.follow(player, true);
    rig.frame(player, npc, 'dialogue');
    settle(rig);
    camera.updateMatrixWorld();
    for (const p of [player, npc]) {
      const v = p.clone().setY(1).project(camera);
      expect(Math.abs(v.x)).toBeLessThan(0.9);
      expect(Math.abs(v.y)).toBeLessThan(0.9);
    }
    const thing = new Vector3(0, 0, -2);
    rig.frame(player, thing, 'inspect', 1.5);
    settle(rig);
    camera.updateMatrixWorld();
    const v = thing.clone().setY(1.2).project(camera);
    expect(Math.abs(v.x)).toBeLessThan(0.35);
    expect(camera.position.distanceTo(thing)).toBeLessThan(4.5);
  });
});

describe('地圖上的地點', () => {
  it('每個互動點都有地點名稱，名稱和互動提示有共同的字（玩家認得出來）', async () => {
    const { PLACE_NAMES } = await import('../../src/game/Session.js');
    const shares = (a, b) => {
      const clean = (s) => s.replace(/[\s（）()「」：:,，。·]/g, '');
      const x = clean(a);
      for (let i = 0; i < x.length - 1; i++) if (clean(b).includes(x.slice(i, i + 2))) return true;
      return false;
    };
    for (const it of LEVEL.interactables) {
      expect(PLACE_NAMES[it.id], it.id).toBeTruthy();
      expect(shares(PLACE_NAMES[it.id], it.label), `${PLACE_NAMES[it.id]} ↔ ${it.label}`).toBe(true);
    }
  });
});
