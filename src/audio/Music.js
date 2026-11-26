/**
 * 程式生成的背景音樂：五聲音階的撥弦旋律＋低音持續音，依劇情切換三種情緒。
 *  - night：緩慢、稀疏，帶一點不安
 *  - dokkaebi：加入장구（長鼓）般的節奏，速度變快
 *  - moon：明亮的大調與更多聲部
 */
const SCALES = {
  night: [196, 220, 261.6, 293.7, 349.2, 392, 440, 523.3],
  dokkaebi: [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3],
  moon: [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3],
};
const TEMPO = { night: 1.1, dokkaebi: 0.42, moon: 0.7 };

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.mood = 'night';
    this.step = 0;
    this.next = 0;
    this.lastNote = 3;
  }

  start() {
    this.timer = setInterval(() => this.#schedule(), 100);
  }

  setMood(mood) {
    if (this.mood !== mood) {
      this.mood = mood;
      this.step = 0;
    }
  }

  #schedule() {
    const a = this.audio;
    if (!a.ready) return;
    const now = a.ctx.currentTime;
    if (this.next < now) this.next = now + 0.05;
    while (this.next < now + 0.4) {
      this.#playStep(this.next - now);
      this.next += TEMPO[this.mood];
      this.step++;
    }
  }

  #playStep(at) {
    const a = this.audio;
    const scale = SCALES[this.mood];
    const s = this.step;
    // 低音持續音：每 8 拍換一次
    if (s % 8 === 0) {
      const root = scale[0] / 2;
      a.tone({ bus: 'music', at, freq: root, duration: TEMPO[this.mood] * 8, gain: 0.05, attack: 0.8 });
      if (this.mood === 'moon') a.tone({ bus: 'music', at, freq: root * 1.5, duration: TEMPO[this.mood] * 8, gain: 0.03, attack: 1 });
    }
    // 旋律：隨機走動，偶爾休止
    const restChance = this.mood === 'night' ? 0.45 : this.mood === 'moon' ? 0.2 : 0.3;
    if (Math.random() > restChance) {
      this.lastNote = Math.max(0, Math.min(scale.length - 1, this.lastNote + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
      a.pluck({ at, freq: scale[this.lastNote], gain: this.mood === 'night' ? 0.11 : 0.13 });
      if (this.mood === 'moon' && Math.random() < 0.4) a.pluck({ at: at + 0.02, freq: scale[Math.max(0, this.lastNote - 2)], gain: 0.07 });
    }
    // 長鼓：덩（低音）與 따（鼓邊）
    if (this.mood === 'dokkaebi') {
      const pattern = [1, 0, 2, 0, 1, 2, 2, 0];
      const hit = pattern[s % pattern.length];
      if (hit === 1) a.tone({ bus: 'music', at, freq: 120, to: 60, duration: 0.25, gain: 0.18 });
      if (hit === 2) a.noise({ bus: 'music', at, duration: 0.05, type: 'highpass', freq: 3000, gain: 0.12 });
    }
  }

  stop() {
    clearInterval(this.timer);
  }
}
