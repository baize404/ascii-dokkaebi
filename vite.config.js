import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // 相對路徑，部署在 GitHub Pages 的子路徑（/ascii-dokkaebi/）也能正常載入
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    // 兩個頁面：正式版遊戲與 Gate 1 玩法原型
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        prototype: resolve(import.meta.dirname, 'prototype.html'),
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
