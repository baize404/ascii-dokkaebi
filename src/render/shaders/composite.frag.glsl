// 第 4 步：合成（每個畫面像素）
//   每格畫出分類 pass 選好的字元；HD／Hybrid 在字元底下加上依深度遮擋的柔光，
//   Hybrid 另外讓燈火、水面使用連續的光影（直接取自已經做過深度測試的場景畫面）。
precision highp float;
precision highp sampler2D;

uniform sampler2D tGlyph;
uniform sampler2D tColor;
uniform sampler2D tData;
uniform sampler2D tScene;
uniform sampler2D tAtlas;
uniform vec2 uCellPx;       // 每格的實際像素（寬、高）
uniform vec2 uGrid;
uniform vec2 uResolution;   // 畫布實際像素
uniform vec2 uAtlasGrid;    // 圖集欄、列
uniform float uTile;
uniform float uGutter;
uniform float uGlow;
uniform float uHybrid;
uniform float uExposure;
uniform float uVignette;

layout(location = 0) out vec4 oColor;

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

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 cellF = frag / uCellPx;
  ivec2 cell = min(ivec2(floor(cellF)), ivec2(uGrid) - 1);
  vec2 local = fract(cellF);

  vec4 g = texelFetch(tGlyph, cell, 0);
  float idx = g.a;
  vec2 tileOrigin = vec2(mod(idx, uAtlasGrid.x), floor(idx / uAtlasGrid.x)) * uTile;
  float inner = uTile - 2.0 * uGutter;
  vec2 atlasUv = (tileOrigin + uGutter + vec2(local.x, 1.0 - local.y) * inner) / (uAtlasGrid * uTile);
  float lod = clamp(log2(inner / min(uCellPx.x, uCellPx.y)), 0.0, 3.0);
  float m = textureLod(tAtlas, atlasUv, lod).r;
  vec3 col = g.rgb * m;

  float charCov = texelFetch(tColor, cell, 0).a;

  if (uGlow > 0.0) {
    // 依深度的雙線性柔光：只接受「同樣遠或比較近」的鄰格光線，屋後的燈不會透過屋牆
    vec2 cuv = frag / uCellPx - 0.5;
    ivec2 c0 = ivec2(floor(cuv));
    vec2 t = fract(cuv);
    float dSelf = texelFetch(tData, cell, 0).r;
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int j = 0; j <= 1; j++) {
      for (int i = 0; i <= 1; i++) {
        ivec2 ci = clamp(c0 + ivec2(i, j), ivec2(0), ivec2(uGrid) - 1);
        float wgt = (i == 1 ? t.x : 1.0 - t.x) * (j == 1 ? t.y : 1.0 - t.y);
        float di = texelFetch(tData, ci, 0).r;
        wgt *= step(di, dSelf * 1.06 + 0.3);
        acc += texelFetch(tColor, ci, 0).rgb * wgt;
        wsum += wgt;
      }
    }
    vec3 glowCol = toSRGB(aces(acc / max(wsum, 1e-4) * uExposure));
    float bright = smoothstep(0.42, 0.95, luma(glowCol));
    col += glowCol * bright * uGlow * (1.0 - 0.8 * charCov) * (1.0 - m);
  }

  if (uHybrid > 0.5) {
    vec4 sc = texture(tScene, frag / uResolution);
    vec3 hdr = sc.rgb * uExposure;
    vec3 sd = toSRGB(aces(hdr));
    float soft = step(0.6, sc.a) * step(sc.a, 0.9);
    // 只有真正的光源（HDR 亮度超過 1，例如火焰、亮窗、鬼火）才用連續光影，被月光照亮的石頭仍是字元
    float light = smoothstep(1.0, 2.6, luma(hdr));
    float k = max(soft * 0.5, light * 0.65) * (1.0 - charCov);
    col = mix(col, max(col, sd), k * (1.0 - 0.5 * m));
  }

  vec2 v = frag / uResolution - 0.5;
  col *= 1.0 - dot(v, v) * uVignette;
  oColor = vec4(col, 1.0);
}
