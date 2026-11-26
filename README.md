# 달 도둑 도깨비 · ASCII Dokkaebi 2.0

韓國民間傳說 × ASCII 藝術 × 3D 探索 × 環境解謎 × 暗黑童話。

**線上遊玩：** https://baize404.github.io/ascii-dokkaebi/

那一夜，山村的月亮不見了。提著燈籠的孩子走進沉睡的村落，循著字條、腳印與老人家的屏風，點亮四季的石燈，陪愛玩的도깨비玩兩個遊戲，把月亮要回來。預計遊玩時間 15–25 分鐘，自動存檔。

| 文件 | 內容 |
| --- | --- |
| [docs/CHANGES.md](docs/CHANGES.md) | 2.0 新舊功能差異、改版前的問題紀錄 |
| [docs/DESIGN.md](docs/DESIGN.md) | 遊戲設計（五章流程、謎題與可解性）與美術風格規範 |
| [docs/TESTING.md](docs/TESTING.md) | 單元／端對端測試結果、效能量測、已知限制、未完成項目與後續建議 |
| [docs/screenshots/](docs/screenshots/) | 改版前（before）與改版後（after）的桌面、手機直式、手機橫式截圖 |

## 操作

| 操作 | 桌面 | 手機（直式、橫式都可以） |
| --- | --- | --- |
| 移動 | WASD／方向鍵，或點一下地面（自動尋路繞過障礙物） | 左下角虛擬搖桿，或點一下地面 |
| 互動 | E／Space，或直接點物件 | 右下角「互動」按鈕，或直接點物件 |
| 對話 | 點一下或 Space；選項可按數字鍵；點虛線韓文看註解 | 點一下；點虛線韓文看註解 |
| 鏡頭縮放 | 滑鼠滾輪 | 雙指捏合 |
| 選單 | J 任務日誌、I 背包、M 地圖、T 切換 ASCII／3D、Esc 暫停 | 右上角按鈕 |

## 開發

需要 Node.js 20 以上。

```bash
npm install
npm run dev        # 開發伺服器 http://localhost:5173
npm test           # 單元測試（Vitest）
npm run build      # 打包到 dist/
npm run test:e2e   # 先 build；用本機 Chrome 跑五個情境（可加情境名稱只跑一個，例如 desktopReal）
```

`test:e2e` 預設使用系統安裝的 Chrome；路徑不同時設定 `CHROME_PATH=/path/to/chrome`。截圖存在 `tests/e2e/screenshots/`。網址加上 `?test` 會掛上測試用介面 `window.__dokkaebi`（正式遊玩不會用到）。

## 系統架構

```
src/
├── main.js                 進入點；WebGL 失敗時顯示說明
├── core/                   與遊戲內容無關的基礎設施
│   ├── Game.js             應用程式主控：主選單、設定套用、自動畫質、暫停、存讀檔、成就、主迴圈
│   ├── EventBus.js         發布／訂閱
│   ├── Input.js            鍵盤、點擊、滾輪與雙指縮放 → input:* 事件
│   ├── Settings.js         SettingsManager：設定的預設值、驗證與保存
│   └── Tweens.js           可 await 的補間動畫
├── data/                   純資料（改內容不用動程式）
│   ├── level.js            地圖配置、互動點、地標、地形高度函式
│   ├── story.js            章節、說話者、道具、配方、線索、題庫、提示、所有對話
│   ├── codex.js            民俗圖鑑（真實文化／遊戲設定／來源）與韓文詞彙註解
│   ├── achievements.js     成就條件
│   └── portraits.js        對話框的 ASCII 肖像
├── game/                   遊戲規則與流程
│   ├── GameState.js        所有規則與進度（純邏輯、可序列化存檔）
│   ├── Session.js          一次遊玩：互動分派、區域觸發（EventSystem）、教學、提示、存檔、地圖迷霧
│   ├── scenes/             劇情演出：village（第一、二章）、lanterns（第三章）、shrine（第四章）、cinematics（開場與結局）
│   ├── Pathfinding.js      A* 網格尋路＋路徑拉直
│   ├── SaveSystem.js       localStorage 存檔：版本、驗證、損壞備份
│   ├── Achievements.js     成就（跨存檔保存）
│   ├── Inventory.js        背包與道具組合
│   ├── LanternPuzzle.js    石燈順序規則
│   ├── ShellGame.js        甕遊戲規則
│   ├── Player.js           移動、尋路跟隨、地形高度、走路與動作動畫
│   └── CameraRig.js        跟隨／過場／縮放／遮擋處理／震動
├── world/                  3D 場景（只負責「看起來」）
│   ├── World.js            依關卡資料蓋出村落；點燈、開門、角色反應、月亮升起等效果；畫質等級
│   ├── layout.js           由關卡資料算出碰撞盒（純函式，尋路與測試共用）
│   ├── props.js            韓屋、倉庫、水井、장승、石燈、금줄、池塘、甕、草叢、落葉……
│   ├── characters.js       玩家、도깨비、할머니、黑貓
│   ├── Particles.js        粒子池、螢火蟲、星空
│   ├── Collision.js        圓形 vs 矩形碰撞
│   └── materials.js        共用材質
├── render/                 ASCII 渲染
│   ├── Renderer.js         尺寸、像素比、字元密度、畫質
│   ├── AsciiPass.js        場景 → 小貼圖（顏色＋深度）→ 全螢幕 ASCII shader
│   ├── glyphAtlas.js       字元圖集
│   └── shaders/            ascii.vert.glsl、ascii.frag.glsl
├── audio/                  AudioManager（三條音軌）、Sfx、Ambience、Music（全部即時合成）
├── ui/                     Hud、Dialogue、Panels（日誌／背包／地圖／設定／圖鑑／成就／暫停）、
│                           Minimap（迷霧地圖）、Joystick、Cutscene、Screens
└── styles/main.css         民俗暗黑童話風格的介面
tests/
├── unit/                   45 項：規則、尋路、關卡可解性、存檔、設定、成就、粒子
└── e2e/playthrough.mjs     61 項：真實通關、完整驗證、手機直式、手機橫式、載入失敗
```

分工原則：**規則**（GameState）只回傳結果代碼、不碰畫面；**演出**（scenes）依結果播對話與動畫；**場景**（world）只負責畫面；**內容**（data）全部是資料。重新開始時整個 Session（場景、玩家、尋路網格）會被丟棄並釋放資源。

## ASCII 渲染原理

1. 場景用 Three.js 渲染（含即時陰影），但只畫到「格數 × 2」的小貼圖，同時保留深度貼圖。
2. 全螢幕 shader 把畫面切成格子（字元密度可選：細／中／粗），每格取 2×2 像素的平均色。
3. 和相鄰格子的**距離**差很大（物體輪廓）或亮度差很大時，用 `| \ - /` 依方向畫線；其他格子依亮度從 ` .:-~=+<>*x#%@` 挑字元。
4. 提高飽和度、亮處加光暈、遠處融入霧靛藍、四周加暗角。按 T 可切回原始 3D 畫面。

## 部署（GitHub Pages）

推到 `main` 後，GitHub Actions（`.github/workflows/deploy.yml`）會跑單元測試、打包，並部署到 GitHub Pages。

第一次設定：repo 的 **Settings → Pages → Build and deployment → Source** 必須選 **GitHub Actions**。不要選「Deploy from a branch」，也不要另外加 Jekyll 部署流程；那樣會發佈沒打包的原始碼，網頁會顯示「遊戲載入失敗」。

## 授權與來源

MIT License。程式、模型、劇情、肖像與音樂都是原創；音效與音樂全部用 Web Audio 即時合成，沒有使用外部音檔。民俗內容的來源列在遊戲內的民俗圖鑑與 `src/data/codex.js`。
