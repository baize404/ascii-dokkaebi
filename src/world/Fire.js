import { AdditiveBlending, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';

/**
 * 程序化火焰：兩片交叉的面，片段著色器用噪聲扭曲出不規則的淚滴形火焰，
 * 有白黃色的核心、橘色外焰、紅色邊緣，會隨時間伸縮、隨風傾斜。
 * 在 ASCII 模式裡火焰是一塊有形狀的亮區（尖端、傾斜都看得出來）；Hybrid 模式保留連續的光暈。
 */
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWind;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float h = clamp(uv.y, 0.0, 1.0);
    // 越往上越受風影響，加上自然的左右搖曳
    p.x += (uWind.x * 0.35 + sin(uTime * 7.0 + uSeed) * 0.04) * h * h;
    p.z += uWind.y * 0.35 * h * h;
    p.y *= 0.9 + 0.12 * sin(uTime * 5.3 + uSeed * 2.0) + 0.06 * sin(uTime * 13.1 + uSeed);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSeed;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 uv = vUv;
    float t = uTime * 2.6 + uSeed;
    // 往上流動的噪聲扭曲火焰邊界
    float n = fbm(vec2(uv.x * 3.0, uv.y * 4.0 - t));
    float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.55 * uv.y;
    float width = pow(1.0 - uv.y, 0.75) * (0.75 + 0.25 * sin(uv.y * 3.0 + t));
    float body = smoothstep(width, width * 0.55, abs(x)) * smoothstep(0.0, 0.08, uv.y);
    // 尖端會斷開成一小團一小團的火舌
    body *= smoothstep(0.98, 0.55 + 0.3 * n, uv.y);
    float core = smoothstep(width * 0.55, 0.0, abs(x)) * smoothstep(0.75, 0.15, uv.y);
    vec3 col = mix(vec3(0.95, 0.25, 0.06), vec3(1.0, 0.62, 0.18), smoothstep(0.0, 0.6, body));
    col = mix(col, vec3(1.0, 0.95, 0.75), core);
    float a = body * uIntensity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * (1.2 + core) * uIntensity, a);
  }
`;

export function makeFlame({ height = 0.32, width = 0.16, seed = Math.random() * 10 } = {}) {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uTime: { value: 0 }, uWind: { value: new Vector2() }, uIntensity: { value: 1 }, uSeed: { value: seed } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const geom = new PlaneGeometry(width, height, 1, 6);
  geom.translate(0, height / 2, 0);
  const group = new Group();
  const a = new Mesh(geom, material);
  const b = new Mesh(geom, material);
  b.rotation.y = Math.PI / 2;
  group.add(a, b);
  group.userData.noShadow = true;
  for (const m of [a, b]) {
    m.castShadow = false;
    m.renderOrder = 5;
  }
  return {
    group,
    material,
    /** @param wind 世界風力（Vector3），會換算成火焰的傾斜 */
    update(time, wind = null, intensity = 1) {
      material.uniforms.uTime.value = time;
      material.uniforms.uIntensity.value = intensity;
      if (wind) material.uniforms.uWind.value.set(Math.max(-1.5, Math.min(1.5, wind.x)), Math.max(-1.5, Math.min(1.5, wind.z)));
      group.visible = intensity > 0.01;
    },
  };
}
