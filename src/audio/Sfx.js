/**
 * 用 Web Audio 即時合成的小音效，不需要任何音檔。
 * 其他模組只要 bus.emit('sfx', '名稱') 就會播放。
 */
const PATTERNS = {
  item: [[660, 0.08], [880, 0.08], [1320, 0.16]],
  door: [[90, 0.22, 'square'], [70, 0.2, 'square']],
  lantern: [[262, 0.1, 'triangle'], [392, 0.22, 'triangle']],
  reset: [[300, 0.1, 'sawtooth'], [200, 0.1, 'sawtooth'], [120, 0.28, 'sawtooth']],
  dokkaebi: [[110, 0.14, 'sawtooth'], [165, 0.14, 'sawtooth'], [110, 0.14, 'sawtooth'], [220, 0.3, 'sawtooth']],
  wrong: [[180, 0.12, 'square'], [150, 0.22, 'square']],
  correct: [[523, 0.1], [784, 0.18]],
  moon: [[392, 0.22], [523, 0.22], [659, 0.22], [784, 0.6]],
};
const HARSH = new Set(['square', 'sawtooth']);
const STORAGE_KEY = 'ascii-dokkaebi.muted';

export class Sfx {
  constructor(bus) {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // 無痕模式等情況讀不到 localStorage，就用預設值
    }
    bus.on('sfx', (name) => this.play(name));
  }

  #context() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  play(name) {
    const notes = PATTERNS[name];
    if (this.muted || !notes) return;
    const ctx = this.#context();
    if (!ctx) return;

    let t = ctx.currentTime + 0.01;
    for (const [freq, dur, type = 'sine'] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const peak = HARSH.has(type) ? 0.045 : 0.12;
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur * 0.85;
    }
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch {
      // 存不了也沒關係，這次遊玩仍然有效
    }
    if (!this.muted) this.play('correct');
    return this.muted;
  }
}
