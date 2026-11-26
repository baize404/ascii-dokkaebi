import {
  DepthTexture,
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
import vertexShader from './shaders/ascii.vert.glsl?raw';
import fragmentShader from './shaders/ascii.frag.glsl?raw';

/**
 * 後製 pass：場景先畫到離屏貼圖（顏色＋深度），再用全螢幕四邊形 + ASCII shader 輸出到畫面。
 */
export class AsciiPass {
  constructor(atlas) {
    // 場景只需要畫成「每格 2×2 像素」的小圖，省下大量 3D 渲染成本
    const depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    depthTexture.minFilter = NearestFilter;
    depthTexture.magFilter = NearestFilter;
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthTexture,
    });
    this.enabled = true;

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.target.texture },
        tDepth: { value: depthTexture },
        tGlyphs: { value: atlas.texture },
        uResolution: { value: new Vector2(1, 1) },
        uCell: { value: 10 },
        uLumaCount: { value: atlas.lumaCount },
        uGlyphTotal: { value: atlas.total },
        uEdge: { value: 0.22 },
        uDepthEdge: { value: 0.06 },
        uGain: { value: 2.0 },
        uNear: { value: 0.1 },
        uFar: { value: 400 },
      },
    });

    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(width, height, cellPx) {
    this.target.setSize(Math.ceil((width / cellPx) * 2), Math.ceil((height / cellPx) * 2));
    this.material.uniforms.uResolution.value.set(width, height);
    this.material.uniforms.uCell.value = cellPx;
  }

  /** 場景貼圖的高度（像素），粒子大小要依它換算 */
  get sceneHeight() {
    return this.target.height;
  }

  render(renderer, scene, camera) {
    if (!this.enabled) {
      // 關掉 ASCII 時直接以全解析度畫到畫面上
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    this.material.uniforms.uNear.value = camera.near;
    this.material.uniforms.uFar.value = camera.far;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }
}
