// 把 3D 場景畫面切成一格一格，每格換成一個字元：
//   1. 物體輪廓（深度突然變化）→ 依方向畫 | \ - /
//   2. 其他格子 → 依亮度從字元階梯挑字
// 再加上色彩飽和、亮處光暈與暗角。
precision highp float;

uniform sampler2D tScene;     // 場景顏色（線性色彩），解析度為「格數 × 2」
uniform sampler2D tDepth;     // 場景深度
uniform sampler2D tGlyphs;    // 字元圖集：亮度階梯 + 4 個邊緣字元
uniform vec2 uResolution;     // 畫布實際像素
uniform float uCell;          // 每格字元的像素大小
uniform float uLumaCount;     // 亮度階梯的字元數
uniform float uGlyphTotal;    // 圖集總字元數
uniform float uEdge;          // 亮度邊緣門檻
uniform float uDepthEdge;     // 深度邊緣門檻（相對距離差）
uniform float uGain;          // 字元顏色增益
uniform float uNear;
uniform float uFar;

varying vec2 vUv;

vec3 toSRGB(vec3 c) {
  return pow(max(c, 0.0), vec3(1.0 / 2.2));
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec2 cellUv(vec2 cell) {
  return (cell + 0.5) * uCell / uResolution;
}

// 在格子中心取樣，線性過濾剛好平均 2×2 個像素
vec3 cellColor(vec2 cell) {
  return toSRGB(texture2D(tScene, cellUv(cell)).rgb);
}

// 深度緩衝值 → 與鏡頭的實際距離
float cellDepth(vec2 cell) {
  float d = texture2D(tDepth, cellUv(cell)).r;
  return (uNear * uFar) / (uFar - d * (uFar - uNear));
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy / uCell);
  vec2 local = (gl_FragCoord.xy - cell * uCell) / uCell;

  vec3 col = cellColor(cell);
  float l = luma(col);

  // 深度輪廓：和上下左右格子的距離差很大，代表是物體邊緣
  float dC = cellDepth(cell);
  float dL = cellDepth(cell - vec2(1.0, 0.0));
  float dR = cellDepth(cell + vec2(1.0, 0.0));
  float dD = cellDepth(cell - vec2(0.0, 1.0));
  float dU = cellDepth(cell + vec2(0.0, 1.0));
  vec2 dGrad = vec2(dR - dL, dU - dD);
  float dMax = max(max(abs(dL - dC), abs(dR - dC)), max(abs(dD - dC), abs(dU - dC)));
  bool depthEdge = dMax / dC > uDepthEdge && dC < uFar * 0.9;

  // 亮度邊緣（例如發光的窗戶、月亮）
  vec2 lGrad = vec2(luma(cellColor(cell + vec2(1.0, 0.0))) - luma(cellColor(cell - vec2(1.0, 0.0))),
                    luma(cellColor(cell + vec2(0.0, 1.0))) - luma(cellColor(cell - vec2(0.0, 1.0))));
  bool lumaEdge = length(lGrad) > uEdge && l > 0.05;

  float index;
  bool isEdge = depthEdge || lumaEdge;
  if (isEdge) {
    vec2 g = depthEdge ? dGrad : lGrad;
    float a = mod(atan(g.y, g.x), 3.14159265);
    float q = mod(floor(a / 0.78539816 + 0.5), 4.0);
    index = uLumaCount + q;
  } else {
    float k = clamp(pow(l, 0.62) * 1.15, 0.0, 0.999);
    index = floor(k * uLumaCount);
  }

  float mask = texture2D(tGlyphs, vec2((index + local.x) / uGlyphTotal, local.y)).r;

  // 色彩：提高飽和度，讓燈火、鬼火、布條的顏色更鮮明
  vec3 saturated = max(mix(vec3(l), col, 1.45), 0.0);
  vec3 tint = clamp(saturated * uGain + 0.03, 0.0, 1.0);
  if (isEdge) tint = clamp(tint * 1.25 + 0.06, 0.0, 1.0);

  // 亮的格子底下鋪一層淡淡的同色光暈
  float glow = smoothstep(0.42, 0.95, l);
  vec3 background = saturated * glow * 0.24;

  vec3 color = mix(background, tint, mask);

  // 暗角
  vec2 v = gl_FragCoord.xy / uResolution - 0.5;
  color *= 1.0 - dot(v, v) * 0.85;

  gl_FragColor = vec4(color, 1.0);
}
