import { LEVEL } from '../data/level.js';

/**
 * 環境音：風聲、蟲鳴、偶爾的貓頭鷹，以及靠近水井／池塘時的水聲、靠近樹時的樹葉沙沙聲。
 * setListener() 每幀由遊戲呼叫，依玩家位置調整各層音量。
 */
export class Ambience {
  constructor(audio) {
    this.audio = audio;
    this.listener = { x: 0, z: 20 };
    this.mood = 'night';
  }

  start() {
    const a = this.audio;
    const ctx = a.ctx;
    // 風：循環噪音 → 低通，截止頻率慢慢飄動
    const wind = ctx.createBufferSource();
    wind.buffer = a.noiseBuffer;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 380;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.12;
    wind.connect(this.windFilter).connect(this.windGain).connect(a.buses.ambience);
    wind.start();

    // 水聲（靠近水井或池塘才聽得到）
    const water = ctx.createBufferSource();
    water.buffer = a.noiseBuffer;
    water.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 900;
    wf.Q.value = 1.5;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    water.connect(wf).connect(this.waterGain).connect(a.buses.ambience);
    water.start();

    this.timer = setInterval(() => this.#tick(), 250);
  }

  setListener(x, z) {
    this.listener = { x, z };
  }

  /** night（預設）／shrine（山丘上，風更大）／moon（月亮回來後蟲鳴更熱鬧、風變小） */
  setMood(mood) {
    this.mood = mood;
  }

  #tick() {
    const a = this.audio;
    if (!a.ready) return;
    const t = a.ctx.currentTime;
    const { x, z } = this.listener;
    const shrine = Math.hypot(x - LEVEL.mound.x, z - LEVEL.mound.z) < 9;
    const windBase = this.mood === 'moon' ? 0.06 : shrine ? 0.2 : 0.12;
    this.windFilter.frequency.setTargetAtTime(300 + Math.sin(t * 0.3) * 150 + Math.random() * 60, t, 0.8);
    this.windGain.gain.setTargetAtTime(windBase + Math.max(0, Math.sin(t * 0.21)) * 0.08, t, 0.8);

    const dWell = Math.hypot(x - LEVEL.well.x, z - LEVEL.well.z);
    const dPond = Math.hypot(x - LEVEL.pond.x, z - LEVEL.pond.z);
    const near = Math.max(0, 1 - Math.min(dWell, dPond) / 7);
    this.waterGain.gain.setTargetAtTime(near * 0.08, t, 0.5);

    // 蟲鳴：隨機的高頻短音
    const cricketRate = this.mood === 'moon' ? 0.9 : 0.55;
    if (Math.random() < cricketRate) {
      const f = 4200 + Math.random() * 900;
      for (let i = 0; i < 3; i++) a.tone({ bus: 'ambience', at: i * 0.05 + Math.random() * 0.2, freq: f, duration: 0.03, gain: 0.02 });
    }
    // 偶爾的貓頭鷹
    if (Math.random() < 0.01) {
      a.tone({ bus: 'ambience', freq: 410, to: 380, duration: 0.45, gain: 0.05 });
      a.tone({ bus: 'ambience', at: 0.6, freq: 400, to: 360, duration: 0.6, gain: 0.05 });
    }
    // 靠近樹時偶爾有樹葉沙沙聲
    const nearTree = LEVEL.trees.some((tr) => Math.hypot(tr.x - x, tr.z - z) < 5);
    if (nearTree && Math.random() < 0.08) a.noise({ bus: 'ambience', duration: 0.6, type: 'highpass', freq: 3000, gain: 0.04, attack: 0.2 });
  }

  stop() {
    clearInterval(this.timer);
  }
}
