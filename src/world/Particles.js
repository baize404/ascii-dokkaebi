import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from 'three';

/**
 * 粒子共用的點材質。點的大小以「世界單位」指定，再依場景貼圖高度換算成像素，
 * 這樣不管 ASCII 格子多大，一顆粒子大約都是一兩個字元。
 */
export function createPointsMaterial() {
  return new ShaderMaterial({
    uniforms: { uScale: { value: 300 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      uniform float uScale;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        if (dot(c, c) > 0.25) discard;
        gl_FragColor = vec4(vColor, 1.0);
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

function makePointsGeometry(count) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aSize', new BufferAttribute(new Float32Array(count), 1));
  return geometry;
}

/** 依畫面高度與視角更新所有粒子材質的大小比例 */
export function updatePointScale(materials, heightPx, fovDeg) {
  const scale = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  for (const m of materials) m.uniforms.uScale.value = scale;
}

/**
 * 一般用途的粒子池：emit() 噴出粒子，update() 依速度、重力、阻力移動並淡出。
 * 用「存活的放在陣列前段」的方式管理，不會產生垃圾回收。
 */
export class ParticleSystem {
  constructor(max = 900) {
    this.max = max;
    this.alive = 0;
    this.vel = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.size = new Float32Array(max);
    this.material = createPointsMaterial();
    this.geometry = makePointsGeometry(max);
    this.geometry.setDrawRange(0, 0);
    this.pos = this.geometry.attributes.position.array;
    this.col = this.geometry.attributes.aColor.array;
    this.sizes = this.geometry.attributes.aSize.array;
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /**
   * @param {object} o
   * o.x/y/z 位置、count 數量、spread 位置隨機範圍、speed 水平速度、up 往上速度、
   * color 顏色、life 壽命（秒）、gravity 重力、drag 阻力、size 大小、jitter 顏色隨機度
   */
  emit({ x, y, z, count = 8, spread = 0.2, speed = 1, up = 1, color = 0xffffff, life = 1, gravity = 0, drag = 1, size = 0.18, jitter = 0.15 }) {
    const c = color instanceof Color ? color : new Color(color);
    for (let n = 0; n < count && this.alive < this.max; n++) {
      const i = this.alive++;
      const i3 = i * 3;
      this.pos[i3] = x + (Math.random() - 0.5) * spread * 2;
      this.pos[i3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[i3 + 2] = z + (Math.random() - 0.5) * spread * 2;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.vel[i3] = Math.cos(a) * s;
      this.vel[i3 + 1] = up * (0.5 + Math.random() * 0.5);
      this.vel[i3 + 2] = Math.sin(a) * s;
      const j = 1 - jitter + Math.random() * jitter * 2;
      this.base[i3] = c.r * j;
      this.base[i3 + 1] = c.g * j;
      this.base[i3 + 2] = c.b * j;
      this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
      this.life[i] = this.maxLife[i];
      this.gravity[i] = gravity;
      this.drag[i] = drag;
      this.size[i] = size * (0.7 + Math.random() * 0.6);
    }
  }

  #copy(from, to) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
      this.base[to * 3 + k] = this.base[from * 3 + k];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.gravity[to] = this.gravity[from];
    this.drag[to] = this.drag[from];
    this.size[to] = this.size[from];
  }

  update(dt) {
    let i = 0;
    while (i < this.alive) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.#copy(this.alive - 1, i);
        this.alive--;
        continue;
      }
      const i3 = i * 3;
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= damp;
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp - this.gravity[i] * dt;
      this.vel[i3 + 2] *= damp;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3 + 1] = 0;
      }
      // 出生時快速亮起，之後慢慢淡出
      const k = this.life[i] / this.maxLife[i];
      const fade = Math.min(1, (1 - k) * 8) * Math.min(1, k * 2.5);
      this.col[i3] = this.base[i3] * fade;
      this.col[i3 + 1] = this.base[i3 + 1] * fade;
      this.col[i3 + 2] = this.base[i3 + 2] * fade;
      this.sizes[i] = this.size[i];
      i++;
    }
    this.geometry.setDrawRange(0, this.alive);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
  }

  clear() {
    this.alive = 0;
    this.geometry.setDrawRange(0, 0);
  }
}

/** 螢火蟲：在村子各處繞著小圈飛、忽明忽暗。 */
export class Fireflies {
  constructor(bounds, count, rand) {
    this.count = count;
    this.material = createPointsMaterial();
    this.geometry = makePointsGeometry(count);
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.data = Array.from({ length: count }, () => ({
      x: bounds.minX + rand() * (bounds.maxX - bounds.minX),
      z: bounds.minZ + rand() * (bounds.maxZ - bounds.minZ),
      y: 0.6 + rand() * 1.8,
      r: 0.8 + rand() * 1.8,
      speed: 0.2 + rand() * 0.4,
      phase: rand() * Math.PI * 2,
      blink: 0.6 + rand() * 1.4,
    }));
    const sizes = this.geometry.attributes.aSize.array;
    sizes.fill(0.14);
  }

  update(t) {
    const pos = this.geometry.attributes.position.array;
    const col = this.geometry.attributes.aColor.array;
    this.data.forEach((f, i) => {
      const a = t * f.speed + f.phase;
      pos[i * 3] = f.x + Math.cos(a) * f.r;
      pos[i * 3 + 1] = f.y + Math.sin(a * 2.3) * 0.35;
      pos[i * 3 + 2] = f.z + Math.sin(a * 1.3) * f.r;
      const glow = Math.pow(Math.max(0, Math.sin(t * f.blink + f.phase)), 3);
      col[i * 3] = 0.75 * glow;
      col[i * 3 + 1] = 1.0 * glow;
      col[i * 3 + 2] = 0.35 * glow;
    });
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
  }
}

/** 星空：半球上隨機分布、會閃爍的星星（標題畫面和結局看得到）。 */
export class Stars {
  constructor(count, rand) {
    this.material = createPointsMaterial();
    this.geometry = makePointsGeometry(count);
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    const pos = this.geometry.attributes.position.array;
    const sizes = this.geometry.attributes.aSize.array;
    this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const y = 0.12 + rand() * 0.88;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(theta) * r * 160;
      pos[i * 3 + 1] = y * 160;
      pos[i * 3 + 2] = Math.sin(theta) * r * 160;
      sizes[i] = 0.5 + rand() * 0.9;
      this.phase[i] = rand() * Math.PI * 2;
    }
    this.brightness = 1;
  }

  update(t) {
    const col = this.geometry.attributes.aColor.array;
    for (let i = 0; i < this.phase.length; i++) {
      const v = (0.45 + 0.35 * Math.sin(t * 1.7 + this.phase[i])) * this.brightness;
      col[i * 3] = v * 0.85;
      col[i * 3 + 1] = v * 0.9;
      col[i * 3 + 2] = v;
    }
    this.geometry.attributes.aColor.needsUpdate = true;
  }
}
