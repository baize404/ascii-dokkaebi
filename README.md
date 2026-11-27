# 달 도둑 도깨비 · ASCII Dokkaebi 3.0 — The Living Village

韓國民間傳說 × ASCII 藝術 × 3D 探索 × 環境解謎 × 暗黑童話。

**線上遊玩：** https://baize404.github.io/ascii-dokkaebi/

那一夜，山村的月亮不見了。提著燈籠的孩子走進沉睡的村落，循著字條、腳印與老人家的屏風，點亮四季的石燈，陪愛玩的도깨비玩兩個遊戲，把月亮要回來。預計遊玩時間 15–25 分鐘，自動存檔。

3.0 的重點是「活著的村子」：
- **高精細度 ASCII 渲染**：字元密度、場景取樣、DPR、陰影分開控制，四種渲染模式。
- **骨架角色**：骨架、蒙皮、動畫混合與 IK，看得到手肘、膝蓋、手腕的動作，衣帶、辮子和燈籠會隨慣性與風擺動。
- **可以走進去的廚房**：門有鉸鏈，屋頂會淡出。
- **會動的機關**：轆轤、繩子和水桶連動；石燈的火焰會慢慢形成。
- **全村共用的風場**：草、樹、火焰、炊煙一起反應。
- **鏡頭**：近景、調查特寫和對話鏡頭。

| 文件 | 內容 |
| --- | --- |
| [docs/CHANGES.md](docs/CHANGES.md) | 版本差異、Bug 清單與修正紀錄 |
| [docs/DESIGN.md](docs/DESIGN.md) | 遊戲設計（五章流程、謎題與可解性）、美術風格規範、渲染／角色／環境／鏡頭規範 |
| [docs/TESTING.md](docs/TESTING.md) | 單元、端對端、黑箱模擬玩家測試結果；效能與相容性；已知限制與未完成項目 |
| [docs/PLAYTEST.md](docs/PLAYTEST.md) | AI 模擬玩家測試紀錄（不是真人測試） |
| [docs/media/](docs/media/) | 實際遊戲動畫錄影（ASCII 與 3D） |
| [docs/screenshots/](docs/screenshots/) | 改版前後、各字元密度、ASCII 與 3D 的固定鏡頭比較 |

## 操作

| 操作 | 桌面 | 手機（直式、橫式都可以） |
| --- | --- | --- |
| 移動 | WASD／方向鍵（按住 Shift 用走的），或點一下地面（自動尋路繞過障礙物） | 左下角虛擬搖桿，或點一下地面 |
| 去看過的地方 | 地圖（M）上點地點名稱，角色會自己走過去 | 同左 |
| 互動 | E／Space，或直接點物件 | 右下角「互動」按鈕，或直接點物件 |
| 對話 | 點一下或 Space；選項可按數字鍵；點虛線韓文看註解 | 點一下；點虛線韓文看註解 |
| 鏡頭 | 滾輪縮放；V 切換遠景／近景 | 雙指捏合；右上角「近景／遠景」 |
| 選單 | J 任務日誌、I 背包、M 地圖、T 切換 ASCII／3D、Esc 暫停 | 右上角按鈕 |

設定裡可以調整渲染模式（Pure ASCII／HD ASCII／Hybrid／原始 3D）、字元密度（Classic／Fine／Ultra／Cinematic／自適應）、場景取樣、DPR、陰影、畫質、鏡頭視角、震動、減少動畫，每個選項都有說明與即時預覽。

## 開發

需要 Node.js 20 以上。

```bash
npm install
npm run dev        # 開發伺服器 http://localhost:5173
npm test           # 單元測試（Vitest）
npm run build      # 打包到 dist/
npm run test:e2e   # 先 build；用本機 Chrome 跑功能情境（可加情境名稱只跑一個，例如 desktopReal）
node tests/e2e/blackbox.mjs [keyboard,touch,explorer,newcomer]  # 黑箱模擬玩家：只看畫面文字、不傳送、不用答案介面
node tests/e2e/record.mjs docs/media [take] [hd|pure|hybrid|3d]  # 逐格錄下實際遊戲動畫
node tests/e2e/shots.mjs <資料夾> hd:fine,3d:-                  # 固定鏡頭比較截圖
node tests/e2e/perf.mjs docs/perf/results.json                    # 各渲染模式的幀率與幀時間
```

`test:e2e` 預設使用系統安裝的 Chrome；路徑不同時設定 `CHROME_PATH=/path/to/chrome`。截圖存在 `tests/e2e/screenshots/`。網址加上 `?test` 會掛上測試用介面 `window.__dokkaebi`（正式遊玩不會用到）。

## 系統架構

```
src/
├── main.js                 進入點；WebGL 失敗時顯示說明
├── core/                   與遊戲內容無關的基礎設施
│   ├── Game.js             應用程式主控：主選單、設定套用、自動畫質、暫停、存讀檔、成就、主迴圈
│   ├── EventBus.js         發布／訂閱
│   ├── Input.js            鍵盤、點擊、滾輪與雙指縮放 → input:* 事件；失焦時清除按鍵
│   ├── Gesture.js          手勢狀態機（Tap／Drag／Pinch），縮放結束不會誤觸點擊
│   ├── AdaptiveQuality.js  自適應畫質：遲滯、冷卻、封鎖撐不住的等級
│   ├── Settings.js         SettingsManager：設定的預設值、驗證、保存與舊版轉換
│   └── Tweens.js           可 await 的補間動畫
├── data/                   純資料（改內容不用動程式）
│   ├── level.js            地圖配置、互動點、地標、地形高度函式
│   ├── story.js            章節、說話者、道具、配方、線索、題庫、提示、所有對話
│   ├── codex.js            民俗圖鑑（真實文化／遊戲設定／來源）與韓文詞彙註解
│   ├── achievements.js     成就條件
│   └── portraits.js        對話框的 ASCII 肖像
├── game/                   遊戲規則與流程
│   ├── GameState.js        所有規則與進度（純邏輯、可序列化存檔）
│   ├── Session.js          一次遊玩：互動狀態、互動分派與鏡頭、區域觸發、教學、地圖與「走過去」、存檔
│   ├── scenes/             劇情演出：village（第一、二章）、lanterns（第三章）、shrine（第四章）、cinematics（開場與結局）
│   ├── Pathfinding.js      A* 網格尋路＋路徑拉直
│   ├── SaveSystem.js       localStorage 存檔：版本、驗證、損壞備份
│   ├── Achievements.js     成就（跨存檔保存）
│   ├── Inventory.js        背包與道具組合
│   ├── LanternPuzzle.js    石燈順序規則
│   ├── ShellGame.js        甕遊戲規則
│   ├── Player.js           移動、尋路跟隨、地形高度、燈籠單擺；動畫交給骨架角色
│   └── CameraRig.js        遠景／近景、調查與對話鏡頭、過場、縮放、遮擋、對齊字元格
├── world/                  3D 場景（只負責「看起來」）
│   ├── World.js            依關卡資料蓋出村落；點燈、開門、角色反應、月亮升起等效果；畫質等級
│   ├── layout.js           由關卡資料算出碰撞盒（含門的開關狀態；純函式，尋路與測試共用）
│   ├── buildings.js        可走進去的廚房（室內、雙開門）、水井轆轤、刻紋石燈
│   ├── props.js            韓屋、倉庫、장승、금줄、池塘、甕、草叢、落葉……
│   ├── DoorController.js   門窗狀態機（Locked／Unlocking／Closed／Opening／Open／Closing／Blocked）
│   ├── Fire.js             程序化火焰；Wind.js 全村共用的風場
│   ├── characters.js       主角、도깨비、할머니、黑貓（骨架角色）
│   ├── rig/                humanoid（骨架＋蒙皮）、SkinBuilder、CharacterAnimator（AnimationMixer 狀態機）、
│   │                       poses／clips（動畫片段）、IK（雙骨 IK）、Spring（彈簧骨）
│   ├── Particles.js        粒子池、螢火蟲、星空
│   ├── Collision.js        圓形 vs 矩形碰撞
│   └── materials.js        共用材質
├── render/                 ASCII 渲染
│   ├── Renderer.js         尺寸、DPR、字元密度、取樣、渲染模式
│   ├── layout.js           版面計算（純函式）：格數、每格 CSS／實際像素、場景貼圖大小
│   ├── AsciiPass.js        場景 → 縮減 pass → 分類 pass → 合成 pass
│   ├── objectId.js         物件遮罩（角色、互動物件、水面）
│   ├── glyphAtlas.js       依筆畫覆蓋率建立的字元圖集
│   └── shaders/            reduce、classify、composite、fullscreen
├── audio/                  AudioManager（三條音軌）、Sfx、Ambience、Music（全部即時合成）
├── ui/                     Hud、Dialogue、Panels（日誌／背包／地圖／設定／圖鑑／成就／暫停）、
│                           Minimap（迷霧地圖）、Joystick、Cutscene、Screens
└── styles/main.css         民俗暗黑童話風格的介面
tests/
├── unit/                   規則、尋路與可解性、存檔、設定、骨架與動畫、門與碰撞、手勢、渲染版面、鏡頭
└── e2e/                    playthrough（功能情境）、blackbox（黑箱模擬玩家）、record（錄影）、shots（比較截圖）、perf（效能）
```

分工原則：**規則**（GameState）只回傳結果代碼、不碰畫面；**演出**（scenes）依結果播對話與動畫；**場景**（world）只負責畫面；**內容**（data）全部是資料。重新開始時整個 Session（場景、玩家、尋路網格）會被丟棄並釋放資源。

## ASCII 渲染原理

1. 場景用 Three.js 渲染（含即時陰影）到「格數 × 取樣倍率」的離屏貼圖，同時保留深度與物件遮罩。
2. **縮減 pass**：每格把 N×N 個像素做面積平均，並記下重要物件（角色、互動物件）的覆蓋率與格內深度落差，細小的手指、門環、火焰尖端不會在轉換前就消失。
3. **分類 pass**：剪影 Sobel、深度二階差分（法線轉折）決定輪廓與方向；ACES 色調映射後轉 sRGB；和上一幀比較，有遲滯才換字，人物移動時不會無規律閃爍。
4. **合成 pass**：依亮度從實測筆畫覆蓋率排好的字元階梯挑字，輪廓用 `| / - \` 等方向字元。Hybrid 模式再疊上經深度遮擋的連續光暈。按 T 可切回原始 3D。

詳細規範見 [docs/DESIGN.md](docs/DESIGN.md) 第 7 節。

## 部署（GitHub Pages）

推到 `main` 後，GitHub Actions（`.github/workflows/deploy.yml`）會跑單元測試、打包，並部署到 GitHub Pages。

第一次設定：repo 的 **Settings → Pages → Build and deployment → Source** 必須選 **GitHub Actions**。不要選「Deploy from a branch」，也不要另外加 Jekyll 部署流程；那樣會發佈沒打包的原始碼，網頁會顯示「遊戲載入失敗」。

## 授權與來源

MIT License。沒有使用任何第三方模型、貼圖、字型檔或音檔：

- **3D 模型**：全部是程式產生（`src/world/`），包括角色骨架與蒙皮。
- **字元圖集**：執行時用瀏覽器的系統等寬字型畫在 canvas 上。介面字型也是系統字型（CSS font stack），不下載網路字型。
- **音效與音樂**：用 Web Audio 即時合成。
- **劇情、肖像、民俗圖鑑文字**：原創。民俗內容的參考來源列在遊戲內的民俗圖鑑與 `src/data/codex.js`。
- **執行期套件**：只有 three（MIT）。開發工具有 Vite、Vitest、Playwright-core。
