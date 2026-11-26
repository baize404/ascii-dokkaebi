import { defineConfig } from 'vite';

export default defineConfig({
  // 相對路徑，部署在 GitHub Pages 的子路徑（/ascii-dokkaebi/）也能正常載入
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
