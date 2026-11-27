import {
  DepthTexture,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import classifyShader from './shaders/classify.frag.glsl?raw';
import compositeShader from './shaders/composite.frag.glsl?raw';
import vertexShader from './shaders/fullscreen.vert.glsl?raw';
import reduceShader from './shaders/reduce.frag.glsl?raw';

/** 三種 ASCII 模式的參數（Original 3D 不經過這裡） */
export const ASCII_MODES = {
  pure: { ramp: 'pure', glow: 0, hybrid: 0, saturation: 1.25, gain: 1.4, edges: 1 },
  hd: { ramp: 'hd', glow: 0.22, hybrid: 0, saturation: 1.35, gain: 1.3, edges: 1 },
  hybrid: { ramp: 'hd', glow: 0.3, hybrid: 1, saturation: 1.3, gain: 1.25, edges: 1 },
};

const fullscreen = (fragmentShader, uniforms) =>
  new ShaderMaterial({ glslVersion: GLSL3, vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false });

/**
 * ASCII 後製流程：
 * 1. 場景 → 高解析度離屏貼圖（格數 × 取樣倍率，線性 HDR，含深度與物件遮罩）
 * 2. 縮減 pass → 每格一個像素（面積平均顏色、覆蓋率、最近深度、格內不連續）
 * 3. 分類 pass → 每格的字元編號與顏色（含上一幀的遲滯，避免閃爍）
 * 4. 合成 pass → 畫面上每個像素畫字元；HD／Hybrid 加上依深度遮擋的柔光
 * 昂貴的判斷都在「每格一次」的 pass 做，畫面像素只負責查表畫字。
 */
export class AsciiPass {
  constructor(atlas) {
    const depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    depthTexture.minFilter = NearestFilter;
    depthTexture.magFilter = NearestFilter;
    this.sceneTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthTexture });
    this.cellTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false, count: 2 });
    const glyphTarget = () => new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
    this.history = [glyphTarget(), glyphTarget()];
    this.motion = 0;
    this.frame = 0;
    this.mode = 'hd';
    this.exposure = 3.0;

    this.reduce = fullscreen(reduceShader, {
      tScene: { value: this.sceneTarget.texture },
      tDepth: { value: depthTexture },
      uGrid: { value: new Vector2(1, 1) },
      uSamples: { value: new Vector2(2, 2) },
      uNear: { value: 0.1 },
      uFar: { value: 400 },
    });
    this.classify = fullscreen(classifyShader, {
      tColor: { value: this.cellTarget.textures[0] },
      tData: { value: this.cellTarget.textures[1] },
      tPrev: { value: null },
      uGrid: { value: new Vector2(1, 1) },
      uExposure: { value: this.exposure },
      uSaturation: { value: 1.35 },
      uGlyphGain: { value: 1.45 },
      uRampStart: { value: 0 },
      uRampCount: { value: 1 },
      uEdgeStart: { value: 0 },
      uEdges: { value: 1 },
      uJump: { value: 0.08 },
      uCrease: { value: 0.09 },
      uIntra: { value: 0.14 },
      uHyst: { value: 0.25 },
      uEdgeKeep: { value: 0.7 },
      uSpirit: { value: 0 },
      uFar: { value: 400 },
    });
    this.composite = fullscreen(compositeShader, {
      tGlyph: { value: null },
      tColor: { value: this.cellTarget.textures[0] },
      tData: { value: this.cellTarget.textures[1] },
      tScene: { value: this.sceneTarget.texture },
      tAtlas: { value: null },
      uCellPx: { value: new Vector2(8, 8) },
      uGrid: { value: new Vector2(1, 1) },
      uResolution: { value: new Vector2(1, 1) },
      uAtlasGrid: { value: new Vector2(1, 1) },
      uTile: { value: 64 },
      uGutter: { value: 8 },
      uGlow: { value: 0.22 },
      uHybrid: { value: 0 },
      uExposure: { value: this.exposure },
      uVignette: { value: 0.85 },
    });

    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.setAtlas(atlas);
    this.setMode('hd');
  }

  setAtlas(atlas) {
    this.atlas?.texture.dispose();
    this.atlas = atlas;
    const u = this.composite.uniforms;
    u.tAtlas.value = atlas.texture;
    u.uAtlasGrid.value.set(atlas.columns, atlas.rows);
    u.uTile.value = atlas.tile;
    u.uGutter.value = atlas.gutter;
    this.setMode(this.mode);
  }

  setMode(mode) {
    const m = ASCII_MODES[mode] ?? ASCII_MODES.hd;
    this.mode = ASCII_MODES[mode] ? mode : 'hd';
    const c = this.classify.uniforms;
    const pure = m.ramp === 'pure';
    c.uRampStart.value = pure ? this.atlas.pureStart : this.atlas.hdStart;
    c.uRampCount.value = pure ? this.atlas.pureCount : this.atlas.hdCount;
    c.uEdgeStart.value = this.atlas.edgeStart;
    c.uSaturation.value = m.saturation;
    c.uGlyphGain.value = m.gain;
    c.uEdges.value = m.edges;
    this.composite.uniforms.uGlow.value = m.glow;
    this.composite.uniforms.uHybrid.value = m.hybrid;
    this.resetHistory = true;
  }

  setExposure(e) {
    this.exposure = e;
    this.classify.uniforms.uExposure.value = e;
    this.composite.uniforms.uExposure.value = e;
  }

  /** @param layout computeLayout() 的結果 */
  setLayout(layout) {
    this.layout = layout;
    this.sceneTarget.setSize(layout.sceneWidth, layout.sceneHeight);
    this.cellTarget.setSize(layout.cols, layout.rows);
    for (const t of this.history) t.setSize(layout.cols, layout.rows);
    this.reduce.uniforms.uGrid.value.set(layout.cols, layout.rows);
    this.reduce.uniforms.uSamples.value.set(layout.samplesX, layout.samplesY);
    this.classify.uniforms.uGrid.value.set(layout.cols, layout.rows);
    const u = this.composite.uniforms;
    u.uGrid.value.set(layout.cols, layout.rows);
    u.uCellPx.value.set(layout.cellWidth, layout.cellHeight);
    u.uResolution.value.set(layout.bufferWidth, layout.bufferHeight);
    this.resetHistory = true;
  }

  /** 場景貼圖的高度（像素），粒子大小要依它換算 */
  get sceneHeight() {
    return this.sceneTarget.height;
  }

  #draw(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  /** 靈視程度 0～1 */
  setSpirit(v) {
    this.classify.uniforms.uSpirit.value = v;
  }

  /** 鏡頭速度（公尺／秒）→ 0（靜止）～1（移動中） */
  setMotion(speed) {
    const t = Math.min(1, Math.max(0, (speed - 0.03) / 0.2));
    this.motion = t * t * (3 - 2 * t);
  }

  render(renderer, scene, camera) {
    this.reduce.uniforms.uNear.value = camera.near;
    this.reduce.uniforms.uFar.value = camera.far;
    this.classify.uniforms.uFar.value = camera.far;

    // 1. 場景
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);
    // 2. 縮減
    this.#draw(renderer, this.reduce, this.cellTarget);
    // 3. 分類（上一幀的結果當遲滯參考；剛換尺寸或模式時清空）
    const prev = this.history[this.frame % 2];
    const next = this.history[(this.frame + 1) % 2];
    // 遲滯是用「螢幕上同一格」的上一幀來比較；鏡頭移動時同一格已經是別的景物，
    // 遲滯會讓字元黏住再一次跳開，所以只在鏡頭靜止時啟用（防止草、火光造成的閃爍）
    const hyst = this.classify.uniforms.uHyst;
    const keep = hyst.value;
    const still = 1 - this.motion;
    hyst.value = keep * still;
    this.classify.uniforms.uEdgeKeep.value = 1 - 0.3 * still;
    if (this.resetHistory) hyst.value = -10; // 這一幀不參考歷史
    this.classify.uniforms.tPrev.value = prev.texture;
    this.#draw(renderer, this.classify, next);
    hyst.value = keep;
    this.resetHistory = false;
    this.frame++;
    // 4. 合成到畫面
    this.composite.uniforms.tGlyph.value = next.texture;
    this.#draw(renderer, this.composite, null);
  }

  dispose() {
    this.sceneTarget.dispose();
    this.cellTarget.dispose();
    for (const t of this.history) t.dispose();
    this.reduce.dispose();
    this.classify.dispose();
    this.composite.dispose();
    this.atlas?.texture.dispose();
  }
}
