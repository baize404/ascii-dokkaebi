import { Bone, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { makeCatModel, makeDokkaebiModel, makeGrandmaModel, makePlayerModel } from '../../src/world/characters.js';
import { solveTwoBone } from '../../src/world/rig/IK.js';
import { triangleCount } from '../../src/world/rig/humanoid.js';
import { PLAYER_STATES } from '../../src/world/rig/poses.js';
import { SpringChain } from '../../src/world/rig/Spring.js';

const REQUIRED = ['Root', 'Pelvis', 'Spine', 'Chest', 'Neck', 'Head', ...['Clavicle', 'Shoulder', 'Elbow', 'Wrist', 'Hand', 'Finger', 'Thumb', 'Hip', 'Knee', 'Ankle', 'Foot', 'Toe'].flatMap((b) => [`${b}.L`, `${b}.R`])];

describe('骨架角色', () => {
  const player = makePlayerModel();

  it('主角有完整的骨架（含手指、腳趾與次級骨）', () => {
    for (const name of REQUIRED) expect(player.bones[name], name).toBeInstanceOf(Bone);
    for (const name of ['Skirt.F', 'Skirt.B', 'Goreum1', 'Braid1', 'Braid3', 'Ribbon']) expect(player.bones[name], name).toBeInstanceOf(Bone);
  });

  it('每個頂點的蒙皮權重加總為 1，骨頭編號有效', () => {
    for (const m of [player, makeGrandmaModel(), makeDokkaebiModel(), makeCatModel()]) {
      const w = m.mesh.geometry.attributes.skinWeight;
      const idx = m.mesh.geometry.attributes.skinIndex;
      const n = m.mesh.skeleton.bones.length;
      for (let i = 0; i < w.count; i++) {
        const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
        expect(Math.abs(sum - 1)).toBeLessThan(1e-4);
        expect(idx.getX(i)).toBeLessThan(n);
      }
    }
  });

  it('綁定姿勢的蒙皮結果與原始幾何一致（反綁定矩陣正確）', () => {
    const m = makePlayerModel();
    m.root.updateMatrixWorld(true);
    const v = new Vector3();
    const b = new Vector3();
    const pos = m.mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 37) {
      b.fromBufferAttribute(pos, i);
      m.mesh.getVertexPosition(i, v);
      expect(v.distanceTo(b)).toBeLessThan(1e-4);
    }
  });

  it('三角面數在預算內（主角 9k–35k、NPC 25k 以下）', () => {
    const counts = { player: triangleCount(player), grandma: triangleCount(makeGrandmaModel()), dokkaebi: triangleCount(makeDokkaebiModel()), cat: triangleCount(makeCatModel()) };
    expect(counts.player).toBeGreaterThan(9000);
    console.log('三角面數', counts);
    expect(counts.player).toBeLessThan(35000);
    for (const k of ['grandma', 'dokkaebi']) expect(counts[k]).toBeLessThan(25000);
    expect(counts.cat).toBeLessThan(8000);
  });

  it('主角有計畫要求的 22 個動畫狀態', () => {
    for (const s of PLAYER_STATES) expect(player.animator.actions[s], s).toBeTruthy();
    for (const s of ['Idle', 'Walk', 'Run', 'Crouch', 'Talk', 'CrankWell']) expect(player.animator.clips[s].userData.loop, s).toBe(true);
    expect(player.animator.clips.Pickup.userData.events.map((e) => e.name)).toContain('contact');
    expect(player.animator.clips.OpenDoor.userData.events.map((e) => e.name)).toEqual(['grab', 'unlock', 'swing', 'release']);
  });
});

describe('動畫狀態機', () => {
  it('開始走 → 走路 → 停下 → 待機，步伐相位依距離推進（腳不打滑）', () => {
    const m = makePlayerModel();
    const a = m.animator;
    for (let i = 0; i < 10; i++) {
      a.setMove(0, 0);
      a.update(1 / 30);
    }
    const p0 = a.phase;
    for (let i = 0; i < 30; i++) {
      a.setMove(2.2, 2.2 / 30);
      a.update(1 / 30);
    }
    expect(a.history).toContain('StartMoving');
    expect(a.state).toBe('Walk');
    // 走了 2.2 公尺，步幅 1.25 → 相位前進約 1.76 圈
    const advanced = (a.phase - p0 + 2) % 1;
    expect(Math.abs(advanced - ((2.2 / 1.25) % 1))).toBeLessThan(0.05);
    for (let i = 0; i < 40; i++) {
      a.setMove(0, 0);
      a.update(1 / 30);
    }
    expect(a.history).toContain('StopMoving');
    expect(a.state).toBe('Idle');
  });

  it('速度超過走路就混合成跑步', () => {
    const a = makePlayerModel().animator;
    for (let i = 0; i < 40; i++) {
      a.setMove(5.2, 5.2 / 30);
      a.update(1 / 30);
    }
    expect(a.state).toBe('Run');
    expect(a.actions.Run.getEffectiveWeight()).toBeGreaterThan(0.8);
  });

  it('動作事件依時間點觸發，結束後才 resolve；狀態回到待機', async () => {
    const a = makePlayerModel().animator;
    const log = [];
    const done = a.play('Pickup', { events: { contact: () => log.push('contact'), stow: () => log.push('stow') } }).then(() => log.push('done'));
    expect(a.state).toBe('Pickup');
    for (let i = 0; i < 20; i++) a.update(1 / 30);
    expect(log).toEqual(['contact']);
    for (let i = 0; i < 30; i++) a.update(1 / 30);
    await done;
    expect(log).toEqual(['contact', 'stow', 'done']);
    expect(a.busy).toBe(false);
  });

  it('取消非關鍵動作時，還沒觸發的事件會立刻補發（規則與畫面一致）', async () => {
    const a = makePlayerModel().animator;
    const log = [];
    const done = a.play('OpenDoor', { cancelable: true, events: { grab: () => log.push('grab'), unlock: () => log.push('unlock'), swing: () => log.push('swing'), release: () => log.push('release') } });
    a.update(0.1);
    expect(a.cancel()).toBe(true);
    await done;
    expect(log).toEqual(['grab', 'unlock', 'swing', 'release']);
  });

  it('不可取消的動作不會被取消', () => {
    const a = makePlayerModel().animator;
    a.play('OfferItem', { cancelable: false });
    expect(a.cancel()).toBe(false);
    expect(a.busy).toBe(true);
  });

  it('連續播放動作：前一個動作會先結束並補發事件，不會卡住', async () => {
    const a = makePlayerModel().animator;
    const log = [];
    const first = a.play('Pickup', { events: { contact: () => log.push('first') } });
    a.update(0.05);
    const second = a.play('Cheer');
    await first;
    expect(log).toEqual(['first']);
    for (let i = 0; i < 60; i++) a.update(1 / 30);
    await second;
    expect(a.busy).toBe(false);
  });
});

describe('IK 與彈簧骨', () => {
  it('雙骨 IK：手可以到達範圍內的目標', () => {
    const m = makePlayerModel();
    m.root.updateMatrixWorld(true);
    const b = m.bones;
    const shoulder = b['Shoulder.L'].getWorldPosition(new Vector3());
    const target = shoulder.clone().add(new Vector3(0.05, -0.12, 0.25));
    const err = solveTwoBone(b['Shoulder.L'], b['Elbow.L'], b['Wrist.L'], target, shoulder.clone().add(new Vector3(0.3, -0.3, -0.2)));
    expect(err).toBeLessThan(0.01);
  });

  it('雙骨 IK：目標太遠時手臂伸直朝向目標，不會出現 NaN', () => {
    const m = makePlayerModel();
    m.root.updateMatrixWorld(true);
    const b = m.bones;
    const err = solveTwoBone(b['Shoulder.L'], b['Elbow.L'], b['Wrist.L'], new Vector3(3, 1, 3), new Vector3(0, 0, -1));
    expect(Number.isFinite(err)).toBe(true);
    expect(err).toBeGreaterThan(1);
    expect(Number.isFinite(b['Elbow.L'].quaternion.x)).toBe(true);
  });

  it('彈簧骨：劇烈移動 300 幀後仍然穩定、長度不變', () => {
    const m = makePlayerModel();
    const chain = m.springs.find((s) => s.links.length === 4);
    const braid = m.bones.Braid1;
    const len = m.bones.Braid2.position.length();
    for (let i = 0; i < 300; i++) {
      m.root.position.set(Math.sin(i * 0.3) * 2, 0, Math.cos(i * 0.21) * 2);
      m.root.rotation.y = i * 0.2;
      m.root.updateMatrixWorld(true);
      chain.update(1 / 30, new Vector3(2, 0, 1));
    }
    for (const l of chain.links) expect(Number.isFinite(l.pos.x)).toBe(true);
    expect(m.bones.Braid2.getWorldPosition(new Vector3()).distanceTo(braid.getWorldPosition(new Vector3()))).toBeCloseTo(len, 4);
  });

  it('黑貓：四足骨架與動畫（走路、跳躍、舔毛、伸懶腰）', () => {
    const cat = makeCatModel();
    for (const b of ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'Ear.L', 'FrontUpper.L', 'FrontPaw.R', 'BackHock.L', 'Tail5']) expect(cat.bones[b], b).toBeTruthy();
    for (const c of ['Idle', 'Walk', 'Jump', 'Lick', 'Stretch']) expect(cat.animator.actions[c], c).toBeTruthy();
    expect(cat.animator.clips.Jump.userData.events.map((e) => e.name)).toEqual(['takeoff', 'land']);
  });

  it('NPC：할머니、도깨비的專屬動作', () => {
    const g = makeGrandmaModel();
    for (const c of ['Sleep', 'RubEyes', 'StandUp', 'Wave', 'Nod', 'Sew']) expect(g.animator.actions[c], c).toBeTruthy();
    const d = makeDokkaebiModel();
    for (const c of ['Idle', 'Laugh', 'Talk', 'Startled', 'Cheer', 'Sulk']) expect(d.animator.actions[c], c).toBeTruthy();
    expect(d.bones.Belly).toBeTruthy();
  });
});

export { SpringChain };
