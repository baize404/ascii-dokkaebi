import { Vector3 } from 'three';

/**
 * 全村共用的風場：火焰、煙、草、樹、落葉、頭髮、衣帶、燈籠都從這裡取風。
 * 主風向緩慢旋轉，強度有陣風（幾個不同頻率的正弦疊加），各地點再加上一點空間上的擾動。
 */
export class Wind {
  constructor() {
    this.time = 0;
    this.reduceMotion = false;
  }

  update(dt) {
    this.time += dt;
  }

  /** 主風向（XZ 平面單位向量）與目前陣風強度（約 0.2–1.6） */
  get direction() {
    const a = 0.35 + 0.3 * Math.sin(this.time * 0.045);
    return new Vector3(Math.cos(a), 0, Math.sin(a));
  }

  get gust() {
    const t = this.time;
    const g = 0.75 + 0.35 * Math.sin(t * 0.37) + 0.25 * Math.sin(t * 1.13 + 1.7) + 0.15 * Math.sin(t * 2.9 + 0.4);
    return Math.max(0.2, g) * (this.reduceMotion ? 0.4 : 1);
  }

  /** 某個位置的風力向量（世界座標） */
  at(p, out = new Vector3()) {
    const t = this.time;
    const d = this.direction;
    const g = this.gust;
    const swirl = 0.35 * Math.sin(p.x * 0.31 + t * 1.7) + 0.25 * Math.sin(p.z * 0.27 - t * 1.3);
    return out.set(d.x * g + d.z * swirl * 0.5, 0, d.z * g - d.x * swirl * 0.5);
  }
}
