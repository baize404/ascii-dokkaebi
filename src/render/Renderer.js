import { ACESFilmicToneMapping, PCFShadowMap, Vector2, WebGLRenderer } from 'three';
import { AsciiPass } from './AsciiPass.js';
import { createGlyphAtlas } from './glyphAtlas.js';
import { computeLayout } from './layout.js';
import { patchObjectIdChunk } from './objectId.js';

/** 渲染模式：三種 ASCII 與原始 3D，全部共用同一個場景與遊戲狀態，切換只改後製 */
export const RENDER_MODES = ['pure', 'hd', 'hybrid', '3d'];

/**
 * 包裝 WebGLRenderer：渲染模式、字元密度、場景取樣、Canvas DPR、字元外觀分開設定。
 */
export class Renderer {
  #bufferSize = new Vector2();

  constructor(canvas) {
    patchObjectIdChunk();
    this.canvas = canvas;
    this.gl = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.setClearColor(0x080d16, 1);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFShadowMap;
    // 原始 3D 模式直接畫到畫面：用和 ASCII 相同的 ACES 色調映射與曝光，兩種模式的明暗一致
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.options = { mode: 'hd', density: 'fine', samples: 'auto', pixelRatio: 'auto', quality: 'high', shape: 'square', weight: 'bold' };
    this.glyphStyle = '';
    this.pass = new AsciiPass(this.#atlas());
    this.setExposure(2.2);
    this.onResize = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  #atlas() {
    const { weight, shape } = this.options;
    this.glyphStyle = `${weight}/${shape}`;
    return createGlyphAtlas({ weight, shape });
  }

  get mode() {
    return this.options.mode;
  }

  get asciiEnabled() {
    return this.options.mode !== '3d';
  }

  /** 舊介面相容：開關 ASCII */
  set asciiEnabled(on) {
    this.set({ mode: on ? (this.lastAsciiMode ?? 'hd') : '3d' });
  }

  get density() {
    return this.options.density;
  }

  get quality() {
    return this.options.quality;
  }

  get atlas() {
    return this.pass.atlas;
  }

  /** 一次更新多個選項；只有影響版面的選項才重新計算尺寸 */
  set(opts) {
    const before = { ...this.options };
    Object.assign(this.options, Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)));
    const o = this.options;
    if (o.mode !== '3d') this.lastAsciiMode = o.mode;
    if (`${o.weight}/${o.shape}` !== this.glyphStyle) this.pass.setAtlas(this.#atlas());
    if (o.mode !== before.mode && o.mode !== '3d') this.pass.setMode(o.mode);
    const layoutKeys = ['density', 'samples', 'pixelRatio', 'quality', 'shape', 'mode'];
    if (layoutKeys.some((k) => before[k] !== o[k])) this.resize();
  }

  setDensity(density) {
    this.set({ density });
  }

  setQuality(quality) {
    this.set({ quality });
  }

  setExposure(e) {
    this.exposure = e;
    this.pass.setExposure(e);
    this.gl.toneMappingExposure = e * 0.55;
  }

  resize() {
    const o = this.options;
    const layout = computeLayout({
      cssWidth: window.innerWidth,
      cssHeight: window.innerHeight,
      deviceRatio: window.devicePixelRatio || 1,
      density: o.density,
      samples: o.samples,
      pixelRatio: o.pixelRatio,
      quality: o.quality,
      shape: o.shape,
    });
    this.layout = layout;
    this.gl.setPixelRatio(layout.dpr);
    this.gl.setSize(window.innerWidth, window.innerHeight, false);
    this.gl.getDrawingBufferSize(this.#bufferSize);
    this.pass.setLayout({ ...layout, bufferWidth: this.#bufferSize.x, bufferHeight: this.#bufferSize.y });
    this.onResize?.(window.innerWidth, window.innerHeight, layout);
  }

  /** 場景實際被畫出的高度（像素）：ASCII 模式是場景離屏貼圖，否則是整個畫布 */
  get sceneHeight() {
    return this.asciiEnabled ? this.pass.sceneHeight : this.#bufferSize.y;
  }

  render(scene, camera) {
    if (!this.asciiEnabled) {
      this.gl.setRenderTarget(null);
      this.gl.render(scene, camera);
      return;
    }
    this.pass.render(this.gl, scene, camera);
  }

  setAnimationLoop(fn) {
    this.gl.setAnimationLoop(fn);
  }
}
