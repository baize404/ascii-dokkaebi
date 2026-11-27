import { AddEquation, AdditiveBlending, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, ShaderChunk, SrcAlphaFactor, ZeroFactor } from 'three';

/**
 * 物件遮罩（Object ID）：把「這個像素屬於什麼」寫進場景貼圖的 alpha，給 ASCII pass 使用。
 *   1.0  一般場景（也是清除畫面時的值）
 *   0.0  角色（主角、NPC）→ 輪廓與細小肢體優先保留
 *   0.5  可互動物件
 *   0.75 柔和表面（水面）→ Hybrid 模式用連續光影
 *   0.95 記憶物件（靈界）→ 人間只用線條字元畫出、靈視時才是實體
 *
 * 做法：在 three 內建材質的 opaque_fragment 片段後面，依材質的 ASCII_ID define 改寫 alpha；
 * 半透明材質改成「只混合顏色、不改 alpha」，避免煙霧與粒子破壞遮罩。
 * 原始 3D 模式下畫布沒有 alpha，這些設定不影響畫面。
 */
export const OBJECT_ID = Object.freeze({ normal: 1, character: 0, interactable: 0.5, soft: 0.75, memory: 0.95 });

let patched = false;
export function patchObjectIdChunk() {
  if (patched) return;
  ShaderChunk.opaque_fragment += '\n#ifdef ASCII_ID\n\tgl_FragColor.a = ASCII_ID;\n#endif\n';
  patched = true;
}

const materialsOf = (o) => (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []);

/** 把一組物件標記成某種類別（會複製材質，避免影響共用材質的其他物件） */
export function tagObject(root, kind) {
  const value = OBJECT_ID[kind];
  if (value === undefined || !root) return;
  const cache = new Map();
  root.traverse((o) => {
    if (!o.material || o.isPoints || o.userData.noTag) return;
    const mats = materialsOf(o).map((m) => {
      if (m.transparent || m.isShaderMaterial) return m;
      if (m.userData.asciiTag === kind) return m;
      if (!cache.has(m)) {
        const c = m.clone();
        c.userData.asciiTag = kind;
        c.defines = { ...(c.defines ?? {}), ASCII_ID: value.toFixed(2) };
        c.needsUpdate = true;
        cache.set(m, c);
      }
      return cache.get(m);
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
}

/** 半透明材質只混合顏色、保留 alpha（遮罩） */
export function preserveMaskBlending(root) {
  root.traverse((o) => {
    for (const m of materialsOf(o)) {
      if (!m.transparent || m.userData.maskSafe) continue;
      const additive = m.blending === AdditiveBlending;
      m.blending = CustomBlending;
      m.blendEquation = AddEquation;
      m.blendSrc = SrcAlphaFactor;
      m.blendDst = additive ? OneFactor : OneMinusSrcAlphaFactor;
      m.blendEquationAlpha = AddEquation;
      m.blendSrcAlpha = ZeroFactor;
      m.blendDstAlpha = OneFactor;
      m.userData.maskSafe = true;
      m.needsUpdate = true;
    }
  });
}
