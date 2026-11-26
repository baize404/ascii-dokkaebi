import { PCFShadowMap, Vector2, WebGLRenderer } from 'three';
import { AsciiPass } from './AsciiPass.js';
import { createGlyphAtlas } from './glyphAtlas.js';

/** 字元密度：每格的 CSS 像素（大螢幕／小螢幕） */
const DENSITY = { fine: [6, 5], normal: [8, 6], coarse: [10, 8] };
/** 畫質等級對應的像素比上限 */
const PIXEL_RATIO = { low: 1, medium: 1.5, high: 2 };

/**
 * 包裝 WebGLRenderer：處理尺寸、像素比、字元密度、畫質與 ASCII 後製。
 */
export class Renderer {
  #bufferSize = new Vector2();

  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.setClearColor(0x080d16, 1);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFShadowMap;
    this.pass = new AsciiPass(createGlyphAtlas());
    this.density = 'normal';
    this.quality = 'high';
    this.onResize = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get asciiEnabled() {
    return this.pass.enabled;
  }

  set asciiEnabled(on) {
    this.pass.enabled = on;
  }

  setDensity(density) {
    if (!DENSITY[density] || density === this.density) return;
    this.density = density;
    this.resize();
  }

  setQuality(quality) {
    if (!PIXEL_RATIO[quality] || quality === this.quality) return;
    this.quality = quality;
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[this.quality]);
    const [big, small] = DENSITY[this.density];
    const cssCell = Math.min(width, height) < 600 ? small : big;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(width, height, false);
    const size = this.gl.getDrawingBufferSize(this.#bufferSize);
    this.pass.setSize(size.x, size.y, Math.max(3, Math.round(cssCell * dpr)));
    this.onResize?.(width, height);
  }

  /** 場景實際被畫出的高度（像素）：ASCII 模式是縮小的場景貼圖，否則是整個畫布 */
  get sceneHeight() {
    return this.pass.enabled ? this.pass.sceneHeight : this.#bufferSize.y;
  }

  render(scene, camera) {
    this.pass.render(this.gl, scene, camera);
  }

  setAnimationLoop(fn) {
    this.gl.setAnimationLoop(fn);
  }
}
