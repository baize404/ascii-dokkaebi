import { ACESFilmicToneMapping, HalfFloatType, PCFSoftShadowMap, SRGBColorSpace, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * 純 3D 畫質等級。
 * - maxDpr：畫布最高像素密度（手機 3 倍螢幕不會真的畫 3 倍）
 * - bloom：選擇性光暈（只有亮度超過門檻的火焰、燈籠、記憶光會發光）
 * - shadow：主光源陰影貼圖邊長
 * 抗鋸齒一律開：沒有 Bloom 時用畫布內建 MSAA，有 Bloom 時用 4× 多重取樣的離屏貼圖。
 */
export const QUALITY_PRESETS = {
  low: { maxDpr: 1, bloom: false, shadow: 1024 },
  medium: { maxDpr: 1.5, bloom: false, shadow: 1024 },
  high: { maxDpr: 2, bloom: true, shadow: 2048 },
  ultra: { maxDpr: 2.5, bloom: true, shadow: 4096 },
};

/** 實際要畫的像素密度：裝置密度、手動上限、等級上限、動態解析度縮放取最小 */
export function resolvePixelRatio({ deviceRatio = 1, pixelRatio = 'auto', quality = 'high', scale = 1 }) {
  const preset = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.high;
  const manual = pixelRatio === 'auto' ? Infinity : Number(pixelRatio);
  const dpr = Math.min(deviceRatio, manual, preset.maxDpr) * Math.max(0.5, Math.min(1, scale));
  return Math.max(0.5, Math.round(dpr * 100) / 100);
}

/**
 * 純 3D 渲染器：WebGL 2、Linear 工作空間→sRGB 輸出、ACES 色調映射、柔邊陰影、
 * 可選的 Bloom 與動態解析度。沒有任何字元圖集、物件遮罩或額外的離屏取樣。
 */
export class Renderer {
  #size = new Vector2();

  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.gl.setClearColor(0x080d16, 1);
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFSoftShadowMap;
    this.options = { quality: 'high', pixelRatio: 'auto', scale: 1, bloom: 'auto' };
    this.composer = null;
    this.bloomPass = null;
    this.onResize = null;
    this.setExposure(2.2);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get quality() {
    return this.options.quality;
  }

  get preset() {
    return QUALITY_PRESETS[this.options.quality] ?? QUALITY_PRESETS.high;
  }

  get bloomEnabled() {
    const b = this.options.bloom;
    return b === 'auto' ? this.preset.bloom : b === 'on';
  }

  /** 這一等級建議的陰影貼圖邊長（場景自己決定要不要用） */
  get shadowSize() {
    return this.preset.shadow;
  }

  set(opts) {
    const before = { ...this.options };
    Object.assign(this.options, Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)));
    const o = this.options;
    if (['quality', 'pixelRatio', 'scale', 'bloom'].some((k) => before[k] !== o[k])) this.resize();
  }

  setQuality(quality) {
    this.set({ quality });
  }

  setExposure(e) {
    this.exposure = e;
    this.gl.toneMappingExposure = e * 0.55;
  }

  /** 調整 Bloom 強度（場景可依情緒改變，例如靈界更亮） */
  setBloom({ strength, radius, threshold } = {}) {
    this.bloomParams = { strength: strength ?? 0.55, radius: radius ?? 0.45, threshold: threshold ?? 0.82 };
    if (this.bloomPass) Object.assign(this.bloomPass, this.bloomParams);
  }

  #ensureComposer() {
    if (!this.bloomEnabled) {
      this.composer?.dispose();
      this.composer = null;
      this.bloomPass = null;
      return;
    }
    const w = Math.max(1, this.#size.x);
    const h = Math.max(1, this.#size.y);
    if (!this.composer) {
      const target = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.gl, target);
      this.renderPass = new RenderPass(null, null);
      this.composer.addPass(this.renderPass);
      if (!this.bloomParams) this.setBloom();
      const p = this.bloomParams;
      this.bloomPass = new UnrealBloomPass(new Vector2(w, h), p.strength, p.radius, p.threshold);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }
    this.composer.setPixelRatio(1);
    this.composer.setSize(w, h);
  }

  resize() {
    const o = this.options;
    const dpr = resolvePixelRatio({ deviceRatio: window.devicePixelRatio || 1, pixelRatio: o.pixelRatio, quality: o.quality, scale: o.scale });
    this.dpr = dpr;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(window.innerWidth, window.innerHeight, false);
    this.gl.getDrawingBufferSize(this.#size);
    this.#ensureComposer();
    this.layout = { width: this.#size.x, height: this.#size.y, dpr, quality: o.quality, scale: o.scale, bloom: this.bloomEnabled };
    this.onResize?.(window.innerWidth, window.innerHeight, this.layout);
  }

  /** 畫布的實際像素高度（粒子大小換算用） */
  get sceneHeight() {
    return this.#size.y;
  }

  render(scene, camera) {
    if (this.composer) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      this.composer.render();
      return;
    }
    this.gl.setRenderTarget(null);
    this.gl.render(scene, camera);
  }

  setAnimationLoop(fn) {
    this.gl.setAnimationLoop(fn);
  }
}
