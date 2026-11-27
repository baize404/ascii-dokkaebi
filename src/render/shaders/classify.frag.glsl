// 第 3 步：分類 pass（每個字元格子跑一次）→ 決定每格的字元與顏色
//   - 色彩：線性 HDR × 曝光 → ACES 色調映射 → sRGB（只做一次 gamma）
//   - 輪廓：鄰格「明顯比較遠」的遮罩做 Sobel（物體剪影，只畫在靠近的一側）
//          反深度（1/d）的二階差分 → 法線轉折（屋脊、牆角）；平面在透視下 1/d 是線性的，地面不會誤判
//          格子內部的深度不連續（細小物件的邊）
//   - 時間穩定：讀上一幀的結果，亮度在門檻附近時沿用上一幀的字元、輪廓用開／關兩個門檻，避免閃爍
precision highp float;
precision highp sampler2D;

uniform sampler2D tColor;
uniform sampler2D tData;
uniform sampler2D tPrev;
uniform vec2 uGrid;
uniform float uExposure;
uniform float uSaturation;
uniform float uGlyphGain;
uniform float uRampStart;
uniform float uRampCount;
uniform float uEdgeStart;
uniform float uEdges;       // 1 開輪廓
uniform float uJump;        // 剪影：鄰格距離比例差
uniform float uCrease;      // 法線轉折門檻
uniform float uIntra;       // 格內不連續門檻
uniform float uHyst;        // 亮度遲滯（以階為單位）
uniform float uEdgeKeep;    // 上一幀是輪廓時，強度降到多少以下才取消（鏡頭移動時 = 1，不黏）
uniform float uFar;
uniform float uSpirit;      // 靈視 0～1：人間的東西褪成冷色，記憶物件發光

layout(location = 0) out vec4 oGlyph;  // rgb 顯示顏色（sRGB）；a 圖集中的字元編號

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
float depthAt(ivec2 c) {
  return texelFetch(tData, clamp(c, ivec2(0), ivec2(uGrid) - 1), 0).r;
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 C = texelFetch(tColor, cell, 0);
  vec4 D = texelFetch(tData, cell, 0);
  vec4 prev = texelFetch(tPrev, cell, 0);
  float charCov = C.a;
  float interCov = max(D.b, 0.0);
  float memCov = max(-D.b, 0.0);
  // 記憶物件在人間：只留下沿著輪廓的線條字元（暗青色）。看得到、但還不知道是什麼
  if (memCov > 0.0 && uSpirit < 0.5) {
    float m[9];
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) m[(j + 1) * 3 + (i + 1)] = max(-texelFetch(tData, clamp(cell + ivec2(i, j), ivec2(0), ivec2(uGrid) - 1), 0).b, 0.0);
    float mx = (m[2] + 2.0 * m[5] + m[8]) - (m[0] + 2.0 * m[3] + m[6]);
    float my = (m[6] + 2.0 * m[7] + m[8]) - (m[0] + 2.0 * m[1] + m[2]);
    float ma = mod(atan(my, mx), 3.14159265);
    float mq = mod(floor(ma / 0.78539816 + 0.5), 4.0);
    oGlyph = vec4(vec3(0.16, 0.40, 0.45) * (0.75 + memCov), uEdgeStart + mq);
    return;
  }

  vec3 disp = toSRGB(aces(C.rgb * uExposure));
  float l = luma(disp);
  vec3 sat = max(mix(vec3(l), disp, uSaturation), 0.0);

  // ---- 輪廓 ----
  float dc = D.r;
  float n[9];
  float f[9];
  float w[9];
  float maxJump = 0.0;
  int k = 0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float d = depthAt(cell + ivec2(x, y));
      n[k] = d;
      w[k] = 1.0 / max(d, 0.01);
      float jump = (d - dc) / max(dc, 0.01);
      f[k] = step(uJump, jump);
      maxJump = max(maxJump, jump);
      k++;
    }
  }
  // 角色與互動物件的門檻比較低，優先保留人物外形與手腳
  float sens = 1.0 + 0.9 * step(0.001, charCov) + 0.35 * step(0.05, interCov);
  float sky = step(uFar * 0.9, dc);
  float wc = w[4];
  float crease = (abs(w[3] + w[5] - 2.0 * wc) + abs(w[1] + w[7] - 2.0 * wc)) / max(wc, 1e-4);
  float silhouette = maxJump / uJump;
  float strength = max(max(silhouette, D.g / uIntra), crease / uCrease) * sens * (1.0 - sky) * uEdges;

  bool wasEdge = prev.a >= uEdgeStart - 0.5 && prev.a < uEdgeStart + 3.5;
  bool isEdge = strength > 1.0 || (wasEdge && strength > uEdgeKeep);

  float idx;
  if (isEdge) {
    // 方向：剪影用「哪些鄰格比較遠」的 Sobel；轉折與格內邊緣用反深度的 Sobel
    float gx = (f[2] + 2.0 * f[5] + f[8]) - (f[0] + 2.0 * f[3] + f[6]);
    float gy = (f[6] + 2.0 * f[7] + f[8]) - (f[0] + 2.0 * f[1] + f[2]);
    if (abs(gx) + abs(gy) < 0.5) {
      gx = (w[2] + 2.0 * w[5] + w[8]) - (w[0] + 2.0 * w[3] + w[6]);
      gy = (w[6] + 2.0 * w[7] + w[8]) - (w[0] + 2.0 * w[1] + w[2]);
    }
    float a = mod(atan(gy, gx), 3.14159265);
    float q = mod(floor(a / 0.78539816 + 0.5), 4.0);
    idx = uEdgeStart + q;
  } else {
    float level = pow(clamp(l, 0.0, 1.0), 0.8) * (uRampCount - 0.001);
    // 角色只佔一點點時，至少給一個看得見的字元
    if (charCov > 0.0) level = max(level, 3.0);
    float chosen = floor(level);
    float prevLevel = prev.a - uRampStart;
    if (!wasEdge && prevLevel >= 0.0 && prevLevel < uRampCount && level > prevLevel - uHyst && level < prevLevel + 1.0 + uHyst) chosen = prevLevel;
    idx = uRampStart + chosen;
  }

  vec3 tint = clamp(sat * uGlyphGain, 0.0, 1.0);
  if (isEdge) tint = clamp(tint * 1.2 + 0.05, 0.0, 1.0);
  // 角色在夜裡也要看得出輪廓：顏色有最低亮度（深色頭髮不會變成一片黑洞）
  if (charCov > 0.0) tint = clamp(max(max(tint, sat * (uGlyphGain + 0.5)), vec3(0.17, 0.16, 0.22)) + 0.03, 0.0, 1.0);
  // 靈視：人間的東西褪成冷色、變暗；記憶物件發出青色的光
  if (uSpirit > 0.0) {
    float lum = dot(tint, vec3(0.299, 0.587, 0.114));
    vec3 ghost = vec3(0.50, 0.72, 0.95) * lum * 0.8;
    vec3 memory = max(tint, vec3(0.30, 0.85, 0.95) * (0.45 + lum));
    tint = mix(tint, memCov > 0.0 ? memory : ghost, uSpirit);
  }
  oGlyph = vec4(tint, idx);
}
