import { AnimationMixer, LoopOnce, LoopRepeat, Vector3 } from 'three';
import { solveTwoBone } from './IK.js';

/**
 * 角色動畫狀態機（建立在 three 的 AnimationMixer 上）。
 *
 * - 移動層：Idle／Walk／Run 依速度混合（1D blend），步伐的相位依「實際走過的距離 ÷ 步幅」推進，
 *   速度怎麼變都不會腳底打滑；開始走、停下、原地轉身會自動疊上過渡動作。
 * - 動作層：一次性動作（撿拾、開門…）或循環動作（說話、轉轆轤）以 crossfade 蓋過移動層，
 *   在指定時間點觸發事件（contact、unlock…）；非關鍵動作可以取消，取消時尚未觸發的事件會立刻補發，
 *   規則與畫面不會不同步。
 * - 後處理：腳踩地形的雙骨 IK、手部 IK 目標（轉轆轤、點燈）、看向目標、眨眼與說話嘴型、彈簧骨。
 */
export class CharacterAnimator {
  constructor(model, clips, { locomotion = null, heightAt = null, wind = null } = {}) {
    this.model = model;
    this.bones = model.bones;
    this.mixer = new AnimationMixer(model.root);
    this.actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      const action = this.mixer.clipAction(clip);
      action.setLoop(clip.userData.loop ? LoopRepeat : LoopOnce, Infinity);
      action.clampWhenFinished = true;
      this.actions[name] = action;
    }
    this.clips = clips;
    this.loco = locomotion; // { idle, walk, run, walkSpeed, runSpeed, walkStride, runStride }
    this.heightAt = heightAt;
    this.wind = wind;
    this.phase = 0;
    this.speed = 0;
    this.moveWeight = 0;
    this.runWeight = 0;
    this.overlay = null;
    this.base = locomotion ? null : 'Idle';
    this.transition = null;
    this.lookTarget = null;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.handTargets = {};
    this.footIK = !!heightAt;
    this.talking = false;
    this.blinkTimer = 2 + Math.random() * 3;
    this.time = 0;
    this.state = 'Idle';
    this.history = []; // 最近的狀態轉換（測試與除錯用）
    for (const name of locomotion ? [locomotion.idle, locomotion.walk, locomotion.run] : []) {
      const a = this.actions[name];
      a.play();
      a.setEffectiveWeight(name === locomotion.idle ? 1 : 0);
    }
    if (!locomotion && this.actions.Idle) this.setBase('Idle');
  }

  #setState(s) {
    if (s === this.state) return;
    this.state = s;
    this.history.push(s);
    if (this.history.length > 40) this.history.shift();
  }

  /** NPC 的基本循環動作（沒有移動層的角色） */
  setBase(name, fade = 0.3) {
    if (this.base === name && this.actions[name]?.isRunning()) return;
    const next = this.actions[name];
    if (!next) return;
    const prev = this.base ? this.actions[this.base] : null;
    next.reset().setEffectiveWeight(1).play();
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
    this.base = name;
    if (!this.overlay) this.#setState(name);
  }

  /**
   * 每幀呼叫（移動層）：speed 是實際速度（公尺／秒），distance 是這一幀實際走過的距離
   */
  setMove(speed, distance) {
    if (!this.loco) return;
    const L = this.loco;
    const wasMoving = this.speed > 0.3;
    this.speed += (speed - this.speed) * 0.35;
    const moving = this.speed > 0.3;
    const runK = Math.min(1, Math.max(0, (this.speed - L.walkSpeed) / (L.runSpeed - L.walkSpeed)));
    const stride = L.walkStride + (L.runStride - L.walkStride) * runK;
    this.phase = (this.phase + distance / stride) % 1;
    if (moving && !wasMoving && !this.overlay) this.#transition('StartMoving', 0.55);
    if (!moving && wasMoving && !this.overlay) this.#transition('StopMoving', 0.7);
    this.targetMove = moving ? 1 : 0;
    this.targetRun = runK;
  }

  /** 原地轉身：角度大時播放轉身步伐 */
  turn(delta) {
    if (!this.loco || this.overlay || this.speed > 0.3 || Math.abs(delta) < 0.7) return;
    if (this.transition?.name?.startsWith('Turn')) return;
    this.#transition(delta > 0 ? 'TurnLeft' : 'TurnRight', 0.8);
  }

  #transition(name, maxWeight) {
    const a = this.actions[name];
    if (!a) return;
    this.transition?.action.stop();
    a.reset().setEffectiveWeight(0).play();
    this.transition = { name, action: a, t: 0, duration: a.getClip().duration, maxWeight };
    this.#setState(name);
  }

  /**
   * 播放動作。@returns Promise（一次性動作結束、或循環動作被 stop 時 resolve）
   * @param o.events { 事件名稱: 函式 }，在片段標記的時間點呼叫
   * @param o.cancelable 是否允許玩家移動時中斷（中斷會立刻補發剩下的事件）
   */
  play(name, { fadeIn = 0.18, fadeOut = 0.22, events = {}, cancelable = false, timeScale = 1 } = {}) {
    const action = this.actions[name];
    if (!action) return Promise.resolve(false);
    this.#finishOverlay(true);
    const clip = action.getClip();
    action.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(0).play();
    return new Promise((resolve) => {
      this.overlay = {
        name,
        action,
        t: 0,
        weight: 0,
        fadeIn,
        fadeOut,
        loop: clip.userData.loop,
        duration: clip.duration / timeScale,
        marks: clip.userData.events.map((e) => ({ ...e, fired: false })),
        lastTime: 0,
        events,
        cancelable,
        stopping: false,
        resolve,
      };
      this.#setState(name);
    });
  }

  /** 停止循環動作（淡出） */
  stop(name = this.overlay?.name) {
    const o = this.overlay;
    if (!o || o.name !== name) return;
    o.stopping = true;
    o.stopT = 0;
  }

  /** 玩家想移動時取消非關鍵動作（剩下的事件立刻觸發，所以遊戲狀態一致） */
  cancel() {
    const o = this.overlay;
    if (!o || !o.cancelable) return false;
    this.#finishOverlay(false);
    return true;
  }

  get busy() {
    return !!this.overlay && !this.overlay.stopping;
  }

  #fire(o, upTo) {
    for (const m of o.marks) {
      if (!m.fired && m.t * o.duration <= upTo) {
        m.fired = true;
        o.events[m.name]?.();
      }
    }
  }

  #finishOverlay(immediate) {
    const o = this.overlay;
    if (!o) return;
    this.#fire(o, Infinity);
    o.action.fadeOut(immediate ? 0.05 : 0.12);
    this.fading = o.action;
    this.overlay = null;
    o.resolve(true);
    this.#setState(this.base ?? (this.speed > 0.3 ? 'Walk' : 'Idle'));
  }

  /** @param root 角色根物件的世界位置已經更新好之後呼叫 */
  update(dt) {
    this.time += dt;
    const o = this.overlay;
    let overlayW = 0;
    if (o) {
      o.t += dt;
      if (o.loop) {
        // 循環動作的事件每圈都觸發
        const cycle = o.duration;
        const prev = o.lastTime;
        const now = o.t % cycle;
        if (now < prev) for (const m of o.marks) m.fired = false;
        o.lastTime = now;
        this.#fire(o, now);
      } else this.#fire(o, o.t);
      o.weight = Math.min(1, o.t / Math.max(0.01, o.fadeIn));
      if (!o.loop) o.weight *= Math.min(1, Math.max(0, (o.duration - o.t) / Math.max(0.01, o.fadeOut)) + (o.t < o.duration ? 0.0 : 0));
      if (o.stopping) {
        o.stopT += dt;
        o.weight *= Math.max(0, 1 - o.stopT / o.fadeOut);
      }
      overlayW = Math.max(0, Math.min(1, o.weight));
      o.action.setEffectiveWeight(overlayW);
      if ((!o.loop && o.t >= o.duration) || (o.stopping && o.stopT >= o.fadeOut)) {
        o.action.stop();
        this.#finishOverlay(true);
        overlayW = 0;
      }
    }

    if (this.loco) {
      const L = this.loco;
      this.moveWeight += ((this.targetMove ?? 0) - this.moveWeight) * Math.min(1, dt * 8);
      this.runWeight += ((this.targetRun ?? 0) - this.runWeight) * Math.min(1, dt * 6);
      let trW = 0;
      const tr = this.transition;
      if (tr) {
        tr.t += dt;
        const k = tr.t / tr.duration;
        trW = Math.sin(Math.PI * Math.min(1, k)) * tr.maxWeight * (1 - overlayW);
        tr.action.setEffectiveWeight(trW);
        if (k >= 1) {
          tr.action.stop();
          this.transition = null;
          trW = 0;
          if (!this.overlay) this.#setState(this.speed > 0.3 ? (this.runWeight > 0.5 ? 'Run' : 'Walk') : 'Idle');
        }
      }
      const rest = (1 - overlayW) * (1 - trW);
      const idle = this.actions[L.idle];
      const walk = this.actions[L.walk];
      const run = this.actions[L.run];
      idle.setEffectiveWeight(rest * (1 - this.moveWeight));
      walk.setEffectiveWeight(rest * this.moveWeight * (1 - this.runWeight));
      run.setEffectiveWeight(rest * this.moveWeight * this.runWeight);
      // 步伐相位由距離推進：直接設定時間，不讓 mixer 自己跑
      walk.time = this.phase * walk.getClip().duration;
      run.time = this.phase * run.getClip().duration;
      walk.timeScale = 0;
      run.timeScale = 0;
      if (!this.overlay && !this.transition) this.#setState(this.moveWeight > 0.5 ? (this.runWeight > 0.5 ? 'Run' : 'Walk') : 'Idle');
    }

    this.mixer.update(dt);
    this.model.root.updateMatrixWorld(true);
    this.#feet();
    this.#hands();
    this.#look(dt);
    this.model.root.updateMatrixWorld(true);
    const wind = this.wind?.(this.model.root.position) ?? null;
    for (const s of this.model.springs) s.update(dt, wind);
    this.#face(dt);
  }

  /** 腳掌貼地：依兩腳下方的地形高度調整骨盆與雙骨 IK */
  #feet() {
    if (!this.footIK || !this.heightAt) return;
    const b = this.bones;
    const root = this.model.root;
    const h0 = this.heightAt(root.position.x, root.position.z);
    const ankles = ['L', 'R'].map((s) => b[`Ankle.${s}`].getWorldPosition(new Vector3()));
    const d = ankles.map((p) => this.heightAt(p.x, p.z) - h0);
    if (Math.abs(d[0]) < 0.004 && Math.abs(d[1]) < 0.004) return;
    b.Pelvis.position.y += Math.min(0, Math.min(d[0], d[1])) / root.scale.y;
    root.updateMatrixWorld(true);
    ['L', 'R'].forEach((s, i) => {
      const knee = b[`Knee.${s}`];
      const target = b[`Ankle.${s}`].getWorldPosition(new Vector3());
      target.y += d[i] - Math.min(0, Math.min(d[0], d[1]));
      const pole = knee.getWorldPosition(new Vector3()).add(new Vector3(0, 0, 0.5).applyQuaternion(root.quaternion));
      solveTwoBone(b[`Hip.${s}`], knee, b[`Ankle.${s}`], target, pole);
    });
  }

  /** 手部 IK：{ L: { target, pole, weight } }（例如轉轆轤時手要握住把手） */
  #hands() {
    const b = this.bones;
    for (const [side, h] of Object.entries(this.handTargets)) {
      const weight = this.#envelope(h);
      if (!h || !(weight > 0)) continue;
      const pole = h.pole ?? b[`Elbow.${side}`].getWorldPosition(new Vector3()).add(new Vector3(side === 'L' ? 0.4 : -0.4, -0.4, -0.2).applyQuaternion(this.model.root.quaternion));
      solveTwoBone(b[`Shoulder.${side}`], b[`Elbow.${side}`], b[`Wrist.${side}`], h.target, pole, weight);
    }
  }

  /**
   * 手部 IK 的權重包絡：envelope = [a, b, c, d]（動作時間的比例），
   * a→b 慢慢伸手到目標、c→d 慢慢收回；沒有 envelope 時用固定權重。
   */
  #envelope(h) {
    if (!h) return 0;
    if (!h.envelope) return h.weight;
    const o = this.overlay;
    if (!o) return 0;
    const u = Math.min(1, o.t / o.duration);
    const [a, b, c, d] = h.envelope;
    const s = (x) => x * x * (3 - 2 * x);
    if (u <= a || u >= d) return 0;
    if (u < b) return h.weight * s((u - a) / (b - a));
    if (u > c) return h.weight * s(1 - (u - c) / (d - c));
    return h.weight;
  }

  /** 頭部看向目標（限制角度、平滑） */
  #look(dt) {
    const head = this.bones.Head;
    const neck = this.bones.Neck;
    let yaw = 0;
    let pitch = 0;
    if (this.lookTarget) {
      const root = this.model.root;
      const local = root.worldToLocal(this.lookTarget.clone());
      const headPos = root.worldToLocal(head.getWorldPosition(new Vector3()));
      const dx = local.x - headPos.x;
      const dz = local.z - headPos.z;
      const dy = local.y - headPos.y;
      yaw = Math.max(-1.1, Math.min(1.1, Math.atan2(dx, dz)));
      if (dz < -0.2) yaw = 0; // 目標在背後就不硬轉
      pitch = Math.max(-0.5, Math.min(0.5, -Math.atan2(dy, Math.hypot(dx, dz))));
    }
    const k = Math.min(1, dt * 5);
    this.lookYaw += (yaw - this.lookYaw) * k;
    this.lookPitch += (pitch - this.lookPitch) * k;
    if (Math.abs(this.lookYaw) + Math.abs(this.lookPitch) < 1e-3) return;
    neck.rotateY(this.lookYaw * 0.4);
    head.rotateY(this.lookYaw * 0.6);
    head.rotateX(this.lookPitch * 0.7);
  }

  /** 眨眼與說話嘴型 */
  #face(dt) {
    const f = this.model.face;
    if (!f?.eyes.length) return;
    this.blinkTimer -= dt;
    let lid = 1;
    if (this.blinkTimer < 0) {
      lid = Math.max(0.08, Math.abs(this.blinkTimer + 0.07) / 0.07);
      if (this.blinkTimer < -0.14) this.blinkTimer = 2.5 + Math.random() * 3.5;
    }
    if (this.eyesClosed) lid = 0.08;
    for (const e of f.eyes) e.scale.y = f.eyeBase.y * lid;
    if (f.mouth) {
      const open = this.talking ? 0.35 + 0.65 * Math.abs(Math.sin(this.time * 13) * Math.sin(this.time * 7.3)) : this.mouthOpen ?? 0;
      f.mouth.scale.y = f.mouthBase.y * (1 + open * 1.8);
    }
    const raise = this.browRaise ?? 0;
    f.brows.forEach((b, i) => {
      b.position.y = f.browBase[i].y + raise * 0.02;
    });
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model.root);
  }
}
