// 把 3D 場景畫面切成一格一格，每格依亮度（或邊緣方向）換成一個字元。
precision highp float;

uniform sampler2D tScene;     // 場景先渲染到這張貼圖（線性色彩）
uniform sampler2D tGlyphs;    // 字元圖集：亮度階梯 + 4 個邊緣字元
uniform vec2 uResolution;     // 畫布實際像素（場景貼圖是縮小版）
uniform float uCell;          // 每格字元的像素大小
uniform float uLumaCount;     // 亮度階梯的字元數
uniform float uGlyphTotal;    // 圖集總字元數
uniform float uEdge;          // 邊緣判定門檻
uniform float uGain;          // 字元顏色增益

varying vec2 vUv;

vec3 toSRGB(vec3 c) {
  return pow(max(c, 0.0), vec3(1.0 / 2.2));
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// 場景貼圖的解析度只有「格數 × 2」，在格子中心取樣時線性過濾剛好平均 2×2 個像素
vec3 cellColor(vec2 cell) {
  vec2 uv = (cell + 0.5) * uCell / uResolution;
  return toSRGB(texture2D(tScene, uv).rgb);
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy / uCell);
  vec2 origin = cell * uCell;
  vec2 local = (gl_FragCoord.xy - origin) / uCell;

  vec3 col = cellColor(cell);
  float l = luma(col);

  // 用相鄰格的亮度差判斷邊緣方向
  float lL = luma(cellColor(cell - vec2(1.0, 0.0)));
  float lR = luma(cellColor(cell + vec2(1.0, 0.0)));
  float lD = luma(cellColor(cell - vec2(0.0, 1.0)));
  float lU = luma(cellColor(cell + vec2(0.0, 1.0)));
  vec2 grad = vec2(lR - lL, lU - lD);

  float index;
  if (length(grad) > uEdge && l > 0.05) {
    float a = mod(atan(grad.y, grad.x), 3.14159265);
    float q = mod(floor(a / 0.78539816 + 0.5), 4.0);
    index = uLumaCount + q;
  } else {
    float k = clamp(pow(l, 0.65) * 1.15, 0.0, 0.999);
    index = floor(k * uLumaCount);
  }

  vec2 glyphUv = vec2((index + local.x) / uGlyphTotal, local.y);
  float mask = texture2D(tGlyphs, glyphUv).r;
  vec3 tint = clamp(col * uGain + 0.03, 0.0, 1.0);
  gl_FragColor = vec4(tint * mask, 1.0);
}
