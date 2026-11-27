// 第 2 步：縮減 pass（每個字元格子跑一次）
// 從高解析度場景貼圖取 N×M 個樣本做面積平均，並統計：
//   角色／互動物件／柔和表面的覆蓋率（物件遮罩寫在場景 alpha）、格子裡最近的深度、格子內的深度不連續。
precision highp float;
precision highp sampler2D;

uniform sampler2D tScene;   // 場景（線性 HDR），alpha = 物件遮罩
uniform sampler2D tDepth;   // 場景深度緩衝
uniform vec2 uGrid;         // 欄、列
uniform vec2 uSamples;      // 每格取樣數（x, y），最多 8×13
uniform float uNear;
uniform float uFar;

layout(location = 0) out vec4 oColor;  // rgb 平均色（線性 HDR）；a 角色覆蓋率
layout(location = 1) out vec4 oData;   // r 最近距離（公尺）；g 格內深度不連續；b 互動物件覆蓋率（負值＝記憶物件覆蓋率）；a 柔和表面覆蓋率

float linearDepth(float d) {
  return (uNear * uFar) / (uFar - d * (uFar - uNear));
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  int nx = int(uSamples.x);
  int ny = int(uSamples.y);
  vec3 sum = vec3(0.0);
  vec3 sumChar = vec3(0.0);
  float nChar = 0.0;
  float nInter = 0.0;
  float nSoft = 0.0;
  float nMem = 0.0;
  float dMin = 1e9;
  float dMax = 0.0;
  for (int j = 0; j < 13; j++) {
    if (j >= ny) break;
    for (int i = 0; i < 8; i++) {
      if (i >= nx) break;
      vec2 uv = (cell + (vec2(float(i), float(j)) + 0.5) / uSamples) / uGrid;
      vec4 c = texture(tScene, uv);
      float isChar = step(c.a, 0.25);
      float isInter = step(0.25, c.a) * step(c.a, 0.6);
      float isSoft = step(0.6, c.a) * step(c.a, 0.9);
      float isMem = step(0.9, c.a) * step(c.a, 0.97);
      sum += c.rgb;
      sumChar += c.rgb * isChar;
      nChar += isChar;
      nInter += isInter;
      nSoft += isSoft;
      nMem += isMem;
      float d = linearDepth(texture(tDepth, uv).r);
      dMin = min(dMin, d);
      dMax = max(dMax, d);
    }
  }
  float total = uSamples.x * uSamples.y;
  vec3 avg = sum / total;
  float charCov = nChar / total;
  // 細小物件保留：手指、關節、緞帶只佔格子一小部分時，偏向角色本身的顏色，不被背景平均掉
  if (nChar > 0.0) avg = mix(avg, sumChar / nChar, clamp(0.35 + charCov, 0.0, 1.0));
  oColor = vec4(avg, charCov);
  // b：互動物件覆蓋率；格子裡有記憶物件時改存「負的記憶覆蓋率」（兩者很少同時出現）
  float memCov = nMem / total;
  oData = vec4(dMin, (dMax - dMin) / max(dMin, 0.01), memCov > 0.0 ? -memCov : nInter / total, nSoft / total);
}
