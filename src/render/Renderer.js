import { PCFShadowMap, Vector2, WebGLRenderer } from 'three';
import { AsciiPass } from './AsciiPass.js';
import { createGlyphAtlas } from './glyphAtlas.js';

const MAX_PIXEL_RATIO = 2;

/**
 * 包裝 WebGLRenderer：處理尺寸、像素比與 ASCII 後製。
 */
export class Renderer {
  #bufferSize = new Vector2();

  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.setClearColor(0x000000, 1);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFShadowMap;
    this.pass = new AsciiPass(createGlyphAtlas());
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

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    // 小螢幕用小一點的字，讓畫面有足夠的欄數
    const cssCell = Math.min(width, height) < 600 ? 6 : 8;

    this.gl.setPixelRatio(dpr);
    this.gl.setSize(width, height, false);
    const size = this.gl.getDrawingBufferSize(this.#bufferSize);
    this.pass.setSize(size.x, size.y, Math.round(cssCell * dpr));
    this.onResize?.(width, height);
  }

  /** 目前場景實際被畫出的高度（像素）：ASCII 模式是縮小的場景貼圖，否則是整個畫布 */
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
