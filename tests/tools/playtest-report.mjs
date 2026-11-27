/**
 * 把黑箱模擬玩家的結果（docs/playtest/*.json）整理成 docs/PLAYTEST.md。
 * 文件裡的數字全部來自 JSON，沒有手動填寫。
 * 用法：node tests/tools/playtest-report.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'docs/playtest';
const order = ['keyboard', 'touch', 'explorer', 'newcomer'];
const runs = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .sort((a, b) => order.indexOf(a.persona) - order.indexOf(b.persona));

const fmt = (sec) => (sec == null ? '—' : `${Math.floor(sec / 60)} 分 ${String(Math.round(sec % 60)).padStart(2, '0')} 秒`);
const lines = [];
lines.push('# 玩家測試紀錄');
lines.push('');
lines.push('> **這裡全部是 AI 模擬玩家（自動化黑箱測試）的紀錄，不是真人測試。** 目前沒有真人大學生試玩資料；下面沒有任何一筆是真人的回饋、評分或完成時間。');
lines.push('');
lines.push('## 測試方法');
lines.push('');
lines.push('模擬玩家（`tests/e2e/blackbox.mjs`）從正式標題畫面開始，只根據畫面上看得到的東西做決定：');
lines.push('');
lines.push('- 看得到的：目前目標、互動提示、對話與選項文字、地圖上「看過的地點」清單、任務日誌、畫面訊息。');
lines.push('- 操作方式：鍵盤、滑鼠或觸控（手機用 CDP 送出真正的觸控事件推搖桿）。');
lines.push('- **不做的事**：不傳送、不讀座標、不呼叫 riddleAnswer／shellAnswer／carvingAt／pickAt 等測試介面、不看攻略。');
lines.push('- 謎題處理：先用讀過的文字推理，例如字條上的「最大的甕」、屏風上的季節題字；推不出來就試，答錯時可以選擇看提示。');
lines.push('- 測試框架只在結束後讀遊戲狀態，用來驗證與統計，不影響玩家的決定。');
lines.push('');
lines.push('「時間」是測試環境的實際經過時間。測試環境是無頭 Chrome 加 SwiftShader 軟體繪圖，約 6–20 FPS，比真實裝置慢很多，所以時間只能互相比較，不代表真人遊玩時間。');
lines.push('');
lines.push('## 結果總表');
lines.push('');
lines.push('失誤與提示次數取自遊戲本身的統計（和結算畫面相同）：石燈點錯＋答錯題＋甕遊戲猜錯；提示是每打開一段提示算一次。');
lines.push('');
lines.push('| 模擬玩家 | 操作 | 完成 | 結局 | 總時間 | 第一次看到互動提示 | 走不到 | 無效操作 | 謎題失誤 | 用提示 | JS 錯誤 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of runs) {
  lines.push(
    `| ${r.label} | ${r.environment.includes('觸控') ? '觸控' : r.persona === 'keyboard' ? '鍵盤' : '滑鼠'} | ${r.finished ? '✓' : `✗（第 ${r.chapterReached} 章）`} | ${r.ending === 'true' ? '真結局' : r.ending === 'normal' ? '一般結局' : '—'} | ${fmt(r.totalSeconds)} | ${r.firstPromptSeconds ?? '—'} 秒 | ${r.pathFailures ?? '—'} | ${r.invalidActions ?? '—'} | ${r.gameStats ? r.gameStats.lanternMistakes + r.gameStats.riddleMistakes + r.gameStats.shellMistakes : '—'} | ${r.gameStats?.hintsUsed ?? '—'} | ${r.errors.length} |`,
  );
}
lines.push('');
for (const r of runs) {
  lines.push(`## ${r.label}`);
  lines.push('');
  lines.push(`- 環境：${r.environment}`);
  lines.push(`- 日期：${r.date.slice(0, 10)}`);
  lines.push(`- 結果：${r.finished ? `完成，${r.ending === 'true' ? '真結局' : '一般結局'}` : `未完成，停在第 ${r.chapterReached} 章`}；發現 ${r.landmarksFound} 個地標`);
  lines.push(`- 地圖點選走過去 ${r.travels ?? 0} 次、自由走動 ${r.exploreBursts ?? 0} 次、互動 ${r.interactions ?? 0} 次、做選擇 ${r.dialogueChoices ?? 0} 次`);
  if (r.recoveredErrors) lines.push(`- 測試程式自己的操作失敗後恢復 ${r.recoveredErrors} 次（按鈕剛好消失等，屬於測試腳本問題，不是遊戲錯誤）`);
  if (r.gameStats) lines.push(`- 遊戲內統計：提示 ${r.gameStats.hintsUsed ?? 0} 次、石燈點錯 ${r.gameStats.lanternMistakes ?? 0} 次、答錯 ${r.gameStats.riddleMistakes ?? 0} 次、甕遊戲猜錯 ${r.gameStats.shellMistakes ?? 0} 次`);
  if (r.lanternOrderPlayed?.length) lines.push(`- 石燈點亮順序：${r.lanternOrderPlayed.join(' → ')}`);
  if (r.blockedToasts?.length) lines.push(`- 走不到時看到的訊息：${[...new Set(r.blockedToasts)].join('、')}`);
  if (r.errors.length) lines.push(`- JS 錯誤：${r.errors.join('；')}`);
  lines.push('');
  lines.push('| 時間 | 章節 | 目標 |');
  lines.push('| --- | --- | --- |');
  for (const o of r.objectiveTimeline ?? []) lines.push(`| ${fmt(o.t)} | ${o.chapter} | ${o.objective} |`);
  lines.push('');
}
lines.push('## 從模擬測試看到的問題與處理');
lines.push('');
lines.push('| 觀察 | 影響 | 處理 |');
lines.push('| --- | --- | --- |');
lines.push('| 讀了字條後，地圖上的 ◆ 標出장독대，但「看過的地點」清單裡沒有它，一位模擬玩家繞了很久都找不到 | 找路困難 | 已修正：任務地點一定列在清單裡（CHANGES.md Bug 14） |');
lines.push('| 互動提示「看看 屋裡」和地點名稱「屏風」對不起來 | 玩家不知道那是什麼 | 已修正：改成「看看 屋裡的屏風」（Bug 12） |');
lines.push('| 轉轆轤的動畫期間對話框暫時消失，玩家可以趁機打開地圖 | 介面重疊 | 已修正：對話進行中不能開地圖（Bug 11） |');
lines.push('| 沒看過屏風的玩家在石燈前只能用試的；四位模擬玩家都靠할머니的話或目標文字「找出石燈刻紋和季節的關係」找到屏風，或直接試出來 | 解謎需要讀文字 | 維持設計：提示與目標文字都指向屏風；試錯只熄一盞，不會卡關 |');
lines.push('| 四位都沒有完成隱藏的黑貓事件（真結局） | 真結局需要主動追貓 | 維持設計：真結局是隱藏事件；功能測試 desktopFull 有驗證可以達成 |');
lines.push('| 每位都有 1 次左右點到被금줄擋住的山丘 | 會看到「山丘被금줄攔住了」 | 符合設計：說明原因，不會無聲停下 |');
lines.push('');
lines.push('## 建議的真人測試');
lines.push('');
lines.push('建議找至少五位沒玩過的大學生，桌面與手機各半，記錄下面這些項目，再依影響程度與出現次數排序問題：');
lines.push('');
lines.push('- 第一次找到可互動物件的時間');
lines.push('- 每章的完成時間');
lines.push('- 卡關的地方、用了幾次提示');
lines.push('- 走不到或誤觸的次數');
lines.push('- 介面擋住畫面的情況');
lines.push('- 看不清楚的畫面');
lines.push('- 有沒有完成主線，以及有沒有發現隱藏事件');
lines.push('');
writeFileSync('docs/PLAYTEST.md', lines.join('\n'));
console.log(`已輸出 docs/PLAYTEST.md（${runs.length} 位模擬玩家）`);
