# 달 도둑 도깨비 · ASCII Dokkaebi

這是一款用 **ASCII 字元渲染 3D 場景** 的網頁探索解謎小遊戲。

**線上遊玩：** https://baize404.github.io/ascii-dokkaebi/

今晚的山村沒有月亮。你提著燈籠在夜裡的村子探索，準備도깨비（韓國民間傳說裡愛惡作劇的鬼怪）最愛的供品，依照季節的順序點亮石燈，再答對도깨비的謎題，把月亮要回來。

## 玩法

| 操作 | 桌面 | 手機 |
| --- | --- | --- |
| 移動 | WASD／方向鍵，或點擊地面 | 點擊地面 |
| 互動 | E／Space，或直接點物件 | 點物件，或按畫面下方的「互動」 |
| 對話 | 點一下或按 Space；選項按數字鍵 1–3 | 點一下、點選項 |
| 切換畫面 | T（ASCII ↔ 原始 3D） | 右上角 ASCII 按鈕 |
| 音效 | M | 右上角 ♪ 按鈕 |

黃色的旋轉光點會在關鍵時刻（開場、供品與石燈都備妥時）標出下一個要去的地方。音效是用 Web Audio 即時合成的，不需要音檔；破關時間會存成最佳紀錄。

破關流程（有雷）：장승（守護柱）給提示 → 廚房拿메밀묵 → 井裡拉出鑰匙 → 打開倉庫拿막걸리 → 依「花開、日烈、葉落、雪飛」點亮石燈 → 到老樹下的祭壇獻供品 → 答對三道謎題。

## 開發

需要 Node.js 20 以上。

```bash
npm install
npm run dev        # 開發伺服器 http://localhost:5173
npm test           # 單元測試（Vitest）
npm run build      # 打包到 dist/
npm run test:e2e   # 先 build，再用本機 Chrome 從頭玩到破關（桌面＋手機尺寸）
```

`test:e2e` 預設使用系統安裝的 Chrome；路徑不同時可以設 `CHROME_PATH=/path/to/chrome`。截圖存在 `tests/e2e/screenshots/`。

## 系統架構

```
src/
├── main.js                 進入點：建立 Game、測試模式掛上 window.__dokkaebi
├── core/                   與遊戲內容無關的基礎設施
│   ├── Game.js             主控：建立模組、主迴圈、狀態（title → playing → ending）
│   ├── EventBus.js         發布／訂閱，模組之間不直接互相引用
│   ├── Input.js            鍵盤與點擊 → 發出 input:* 事件
│   └── Tweens.js           以遊戲時間驅動、可 await 的補間動畫
├── render/                 畫面輸出
│   ├── Renderer.js         WebGLRenderer、尺寸與像素比
│   ├── AsciiPass.js        後製：場景 → 小貼圖 → 全螢幕 ASCII shader
│   ├── glyphAtlas.js       在 canvas 上畫出字元圖集
│   └── shaders/            ascii.vert.glsl、ascii.frag.glsl
├── world/                  3D 場景（只負責「看起來」）
│   ├── World.js            依關卡資料蓋出村落、碰撞盒、場景效果
│   ├── props.js            韓屋、倉庫、水井、장승、石燈、樹……
│   ├── characters.js       玩家與도깨비模型
│   ├── materials.js        共用材質
│   └── Collision.js        圓形 vs 矩形碰撞（純函式）
├── game/                   遊戲規則與角色行為
│   ├── Quest.js            關卡進度與規則（純邏輯，可單元測試）
│   ├── LanternPuzzle.js    石燈順序謎題
│   ├── Inventory.js        背包
│   ├── Interactions.js     把規則結果串成對話與場景效果
│   ├── Player.js           移動、點擊尋路、碰撞
│   └── CameraRig.js        跟隨／標題環繞／過場鏡頭
├── audio/Sfx.js            Web Audio 合成音效（監聽 sfx 事件）
├── ui/                     DOM 介面
│   ├── Hud.js              任務、背包、互動提示、通知
│   ├── Dialogue.js         打字機效果對話框與選項（Promise）
│   ├── Screens.js          標題、說明、結局
│   └── asciiTitle.js       把文字轉成 ASCII 藝術字
├── data/                   純資料，改內容不用動程式
│   ├── level.js            地圖配置、互動點、石燈順序
│   └── script.js           所有劇情文字、物品、任務、謎題
└── styles/main.css
tests/
├── unit/                   Quest、LanternPuzzle、Collision 與關卡資料檢查
└── e2e/playthrough.mjs     Playwright 真瀏覽器破關測試
```

模組之間的分工：

- **規則**（`game/Quest.js`）只回傳結果代碼，例如 `'locked'`、`'opened'`，完全不碰畫面，所以可以直接寫單元測試。
- **演出**（`game/Interactions.js`）依照結果代碼播對話、更新 HUD、觸發 `World` 的效果。
- **場景**（`world/`）只知道怎麼把東西畫出來和做動畫，不知道遊戲規則。
- **內容**（`data/`）是純資料，想改地圖、劇情、謎題，只要改這兩個檔案。

## ASCII 渲染原理

1. 場景先用 Three.js 正常渲染，但只畫到一張「格數 × 2」的小貼圖上（例如 142×89 格就是 284×178 像素），省下大量運算。
2. 全螢幕 shader 把畫面切成 9×9（手機 7×7）像素的格子，每格取 2×2 像素的平均色。
3. 依亮度從 ` .:-~=+<>*x#%@` 挑字元；若跟上下左右格子的亮度差很大，就改用 `| \ - /` 畫出邊緣方向。
4. 字元形狀來自執行時在 canvas 上畫好的圖集，再乘上該格的顏色。

按 `T` 可以切回原始 3D 畫面比較差別。

## 部署

推到 `main` 後，GitHub Actions（`.github/workflows/deploy.yml`）會跑單元測試、打包，並部署到 GitHub Pages。第一次部署前，需要到 repo 的 **Settings → Pages → Source** 選 **GitHub Actions**。

## 授權與來源

MIT License。程式、模型和劇情都是原創，創作靈感來自 Instagram 上的 ASCII 遊戲開發影片。도깨비、장승、서낭당、오방색 等元素取材自韓國民俗。
