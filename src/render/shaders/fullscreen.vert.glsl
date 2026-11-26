// 全螢幕四邊形（GLSL 3.00；three 會自動宣告 position 屬性）
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
