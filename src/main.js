import './styles/main.css';
import { Game } from './core/Game.js';

const testMode = new URLSearchParams(location.search).has('test');

/** 顯示全螢幕錯誤說明（index.html 裡的 #boot-error） */
function showBootError(message) {
  const box = document.getElementById('boot-error');
  document.getElementById('boot-error-detail').textContent = message;
  box.hidden = false;
  box.style.display = 'flex';
}

try {
  // 測試模式（無頭瀏覽器幀率很低）允許較大的時間步長，讓動畫以真實時間進行
  const game = new Game({ canvas: document.getElementById('view'), maxDt: testMode ? 0.25 : 0.05 });
  game.start();
  if (testMode) window.__dokkaebi = game.testApi();
} catch (err) {
  console.error(err);
  showBootError('這個瀏覽器沒辦法啟動 3D 畫面（需要 WebGL 2）。請改用最新版的 Chrome、Safari、Edge 或 Firefox 開啟。');
}
