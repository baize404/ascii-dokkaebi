import './styles/main.css';
import { Game } from './core/Game.js';

const testMode = new URLSearchParams(location.search).has('test');

// 測試模式（無頭瀏覽器幀率很低）允許較大的時間步長，讓動畫以真實時間進行
const game = new Game({ canvas: document.getElementById('view'), maxDt: testMode ? 0.25 : 0.05 });
game.start();

if (testMode) window.__dokkaebi = game.testApi();
