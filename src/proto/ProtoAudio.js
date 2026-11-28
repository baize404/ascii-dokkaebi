/**
 * 原型的聲音（全部即時合成，沒有音檔）：
 * - 風聲：音量與音色直接跟著峽谷的風（陣風 × 閘門倍率）——聽得出風什麼時候要來、閘門關了風小多少
 * - 火盆：靠近時聽得到劈啪聲
 * - 靈界：靈視時有一層低沉的和聲
 * - 音樂：很稀疏的五聲音階撥弦；結局換成明亮的琶音
 * 重要的謎題資訊（風）同時有畫面線索（煙、草、布條、HUD），關掉聲音也能玩。
 */
const SCALE = [196, 220, 262, 294, 330, 392, 440, 523]; // 五聲音階（G A C D E）

export class ProtoAudio {
  constructor(audio) {
    this.audio = audio;
    this.started = false;
    this.musicTimer = 2;
    this.crackleTimer = 0;
    this.mood = 'night';
  }

  /** 第一次使用者操作後呼叫（瀏覽器規定） */
  start() {
    const a = this.audio;
    a.unlock();
    if (!a.ctx || this.started) return;
    this.started = true;
    // 正式版的村子環境音與音樂在原型裡不用
    a.ambience.stop?.();
    a.music.stop?.();
    const ctx = a.ctx;
    // 風：循環白噪音 → 帶通 → 音量
    const src = ctx.createBufferSource();
    src.buffer = a.noiseBuffer;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.8;
    this.windFilter.frequency.value = 400;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(a.buses.ambience);
    src.start();
    // 靈界：兩個略微走音的正弦波＋慢速顫動
    this.spiritGain = ctx.createGain();
    this.spiritGain.gain.value = 0;
    this.spiritGain.connect(a.buses.ambience);
    for (const f of [110, 110.7, 165]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 150 ? 0.25 : 0.4;
      o.connect(g).connect(this.spiritGain);
      o.start();
    }
  }

  /**
   * @param o.exposure 玩家附近感受到的風（0–1）；o.canyon 峽谷的風（遠處也聽得到一點）
   * @param o.spirit 靈界程度 0–1；o.fireDist 離火盆的距離
   */
  update(dt, o) {
    const a = this.audio;
    if (!this.started || !a.ctx) return;
    const t = a.ctx.currentTime;
    const wind = Math.max(o.exposure, o.canyon * 0.35);
    this.windGain.gain.setTargetAtTime(0.04 + wind * 0.5, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(300 + wind * 900, t, 0.2);
    this.spiritGain.gain.setTargetAtTime(o.spirit * 0.06, t, 0.4);
    this.crackleTimer -= dt;
    if (o.fireDist < 7 && this.crackleTimer <= 0) {
      this.crackleTimer = 0.06 + Math.random() * 0.25;
      a.noise({ bus: 'ambience', duration: 0.03, type: 'highpass', freq: 1800 + Math.random() * 2000, gain: (0.05 + Math.random() * 0.05) * (1 - o.fireDist / 7) });
    }
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      if (this.mood === 'ending') {
        this.musicTimer = 1.6;
        [0, 2, 4, 7].forEach((k, i) => a.pluck({ freq: SCALE[k % SCALE.length] * (k >= SCALE.length ? 2 : 1), duration: 2.4, gain: 0.1, at: i * 0.22 }));
      } else {
        this.musicTimer = 2.6 + Math.random() * 2.4;
        const k = Math.floor(Math.random() * SCALE.length);
        a.pluck({ freq: SCALE[k] * (o.spirit > 0.5 ? 1.5 : 1), duration: 2.2, gain: 0.07 });
      }
    }
  }

  setMood(mood) {
    this.mood = mood;
    this.musicTimer = 0.3;
  }
}
