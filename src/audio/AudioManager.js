import { Ambience } from './Ambience.js';
import { Music } from './Music.js';
import { Sfx } from './Sfx.js';

/**
 * 音訊總管：一個 AudioContext、三條音軌（音樂／環境音／互動音效），
 * 音量來自 Settings。所有聲音都是即時合成，不需要外部音檔與授權。
 *
 * 瀏覽器規定要在使用者操作後才能出聲，所以第一次點擊時呼叫 unlock()。
 */
export class AudioManager {
  constructor(settings, bus) {
    this.settings = settings;
    this.ctx = null;
    this.buses = {};
    this.sfx = new Sfx(this);
    this.music = new Music(this);
    this.ambience = new Ambience(this);
    bus.on('sfx', (name) => this.sfx.play(name));
    bus.on('settings:change', ({ key }) => {
      if (key.endsWith('Volume')) this.applyVolumes();
    });
  }

  get ready() {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      const master = this.ctx.createGain();
      master.connect(this.ctx.destination);
      for (const name of ['music', 'ambience', 'sfx']) {
        const g = this.ctx.createGain();
        g.connect(master);
        this.buses[name] = g;
      }
      this.applyVolumes();
      this.noiseBuffer = this.#makeNoise();
      this.ambience.start();
      this.music.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.buses.music.gain.setTargetAtTime(this.settings.get('musicVolume') * 0.5, t, 0.1);
    this.buses.ambience.gain.setTargetAtTime(this.settings.get('ambienceVolume') * 0.7, t, 0.1);
    this.buses.sfx.gain.setTargetAtTime(this.settings.get('sfxVolume'), t, 0.1);
  }

  /** 兩秒長的白噪音，給風聲、腳步、水聲等使用 */
  #makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** 播一段濾過的噪音（腳步、風、水、翻頁） */
  noise({ bus = 'sfx', at = 0, duration = 0.2, type = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.005, sweepTo = null }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(this.buses[bus]);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration + 0.05);
  }

  /** 播一個音（可設定滑音與波形） */
  tone({ bus = 'sfx', at = 0, freq = 440, to = null, duration = 0.3, type = 'sine', gain = 0.12, attack = 0.01 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.buses[bus]);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  /** 撥弦音（像가야금）：三角波＋快速衰減＋低通 */
  pluck({ bus = 'music', at = 0, freq = 220, duration = 1.6, gain = 0.16 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 1.01, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 8, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.5, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(filter).connect(g).connect(this.buses[bus]);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
}
