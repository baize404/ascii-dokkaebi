/**
 * 互動音效（全部即時合成）。由 AudioManager 呼叫：audio.sfx.play('item')，
 * 或任何模組 bus.emit('sfx', 'item')。
 */
const C5 = 523.25;
const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]; // 五聲音階

export class Sfx {
  constructor(audio) {
    this.audio = audio;
  }

  play(name, opts = {}) {
    const a = this.audio;
    if (!a.ready) return;
    const fn = SOUNDS[name];
    fn?.(a, opts);
  }

  /** 腳步聲依地面材質而不同 */
  step(surface) {
    const a = this.audio;
    if (!a.ready) return;
    if (surface === 'stone') a.noise({ duration: 0.07, type: 'bandpass', freq: 1900 + Math.random() * 400, q: 2, gain: 0.12 });
    else a.noise({ duration: 0.11, type: 'lowpass', freq: 700 + Math.random() * 200, q: 0.7, gain: 0.1 });
  }
}

const SOUNDS = {
  ui: (a) => a.tone({ freq: 880, duration: 0.06, type: 'triangle', gain: 0.06 }),
  page: (a) => a.noise({ duration: 0.18, type: 'highpass', freq: 2500, gain: 0.08, sweepTo: 5000 }),
  item: (a) => [1, 1.25, 1.5, 2].forEach((m, i) => a.tone({ at: i * 0.07, freq: C5 * m, duration: 0.25, gain: 0.1 })),
  combine: (a) => {
    a.noise({ duration: 0.3, type: 'bandpass', freq: 3000, gain: 0.08 });
    [1, 1.5, 2].forEach((m, i) => a.tone({ at: 0.2 + i * 0.08, freq: C5 * m, duration: 0.3, gain: 0.1 }));
  },
  door: (a) => {
    a.tone({ freq: 160, to: 110, duration: 0.9, type: 'sawtooth', gain: 0.035 });
    a.noise({ at: 0.6, duration: 0.25, type: 'lowpass', freq: 300, gain: 0.25 });
  },
  crank: (a) => [0, 0.12, 0.24].forEach((t) => a.noise({ at: t, duration: 0.06, type: 'bandpass', freq: 900, q: 4, gain: 0.15 })),
  water: (a) => a.noise({ duration: 0.4, type: 'bandpass', freq: 600, q: 3, gain: 0.1, sweepTo: 1400 }),
  lantern: (a, { note = 0 }) => {
    a.noise({ duration: 0.5, type: 'bandpass', freq: 500, gain: 0.18, sweepTo: 2200 });
    a.tone({ at: 0.15, freq: C5 * PENTA[note % PENTA.length], duration: 1.4, gain: 0.12 });
    a.tone({ at: 0.15, freq: C5 * PENTA[note % PENTA.length] * 2, duration: 0.9, gain: 0.04 });
  },
  lanternWrong: (a) => {
    a.noise({ duration: 0.6, type: 'lowpass', freq: 900, gain: 0.2, sweepTo: 200 });
    a.tone({ freq: 220, to: 160, duration: 0.5, type: 'triangle', gain: 0.06 });
  },
  rope: (a) => {
    a.noise({ duration: 0.15, type: 'highpass', freq: 1500, gain: 0.2 });
    [0, 0.12, 0.24, 0.36].forEach((t, i) => a.tone({ at: t, freq: C5 * PENTA[i + 1], duration: 0.8, gain: 0.08 }));
  },
  supernatural: (a) => {
    a.noise({ duration: 1.6, type: 'bandpass', freq: 200, q: 2, gain: 0.25, attack: 1.2, sweepTo: 2400 });
    [1, 1.007, 1.5].forEach((m) => a.tone({ freq: 196 * m, duration: 1.8, gain: 0.05, attack: 1.0 }));
  },
  laugh: (a) => {
    for (let i = 0; i < 5; i++) a.tone({ at: i * 0.13, freq: 260 - i * 12, to: 200 - i * 12, duration: 0.11, type: 'square', gain: 0.04 });
  },
  wrong: (a) => [196, 155].forEach((f, i) => a.tone({ at: i * 0.12, freq: f, duration: 0.2, type: 'square', gain: 0.04 })),
  correct: (a) => [1, 1.5].forEach((m, i) => a.tone({ at: i * 0.1, freq: C5 * m, duration: 0.3, gain: 0.1 })),
  shuffle: (a) => a.noise({ duration: 0.12, type: 'lowpass', freq: 400, gain: 0.18 }),
  cat: (a) => a.tone({ freq: 700, to: 520, duration: 0.35, type: 'triangle', gain: 0.07 }),
  moon: (a) => [0, 2, 3, 4, 5].forEach((n, i) => a.tone({ at: i * 0.3, freq: C5 * PENTA[n], duration: 2.2, gain: 0.09 })),
  achievement: (a) => [1, 1.25, 1.5, 2, 2.5].forEach((m, i) => a.tone({ at: i * 0.06, freq: C5 * m, duration: 0.4, gain: 0.07 })),
  blocked: (a) => a.tone({ freq: 180, duration: 0.12, type: 'triangle', gain: 0.08 }),
};
