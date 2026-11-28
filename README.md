# Dokkaebi: Beyond the Moon 4.0 · 달 도둑 도깨비

韓國民俗奇幻 × 第三人稱 3D 冒險 × 環境解謎 × 人間與靈界。**4.0 起是純 3D**：ASCII 渲染已經完全移除（第三版保留在 `v3-ascii` 分支）。

**4.0 垂直切片「斷橋與燈」：** https://baize404.github.io/ascii-dokkaebi/prototype.html
**正式版（月亮小偷的村子）：** https://baize404.github.io/ascii-dokkaebi/

## 4.0 垂直切片「斷橋與燈」

約 10 分鐘的一段完整體驗：提著燈籠的孩子要過一座斷橋，點亮對岸山寺小殿前的石燈。

- **月魂燈籠**：火力會被峽谷的風吹弱；在石碑前舉燈、移動燈光，照過的刻紋才會浮現。
- **靈視**：看見「月亮的另一面」——過去存在的記憶會一片片拼回橋板。畫面、碰撞、尋路看同一個狀態：成形前踩不上去，崩散後才會掉。
- **風與閘門**：風 7 秒一輪，火盆的煙、草、五色布條、聲音和 HUD 都看得出來；轉動絞盤，繩子、滑輪、擋板一起動，擋板越低風越弱。
- **鏡頭導演**：探索／第三人稱自由鏡頭、過橋輔助、石碑調查視角、依機構進度切換的動作鏡頭、電影式開場與結局；演出結束回到玩家原本的鏡頭設定。
- **失敗會教你一件事**：被風吹熄和自己收起靈視是兩種不同的掉落，回饋不同。

設計文件：[docs/v4/](docs/v4/)（[遊戲設計](docs/v4/GDD.md)、[鏡頭設計](docs/v4/CAMERA.md)、[美術聖經](docs/v4/ART-BIBLE.md)、[審查與決策](docs/v4/REVIEW.md)）。Gate 0／Gate 1 的紀錄在 [docs/beyond-the-moon/](docs/beyond-the-moon/)。

## 正式版：月亮小偷的村子（3.x 內容，4.0 起純 3D）

那一夜，山村的月亮不見了。提著燈籠的孩子走進沉睡的村落，循著字條、腳印與老人家的屏風，點亮四季的石燈，陪愛玩的도깨비玩兩個遊戲，把月亮要回來。預計遊玩時間 15–25 分鐘，自動存檔。骨架角色、可以走進去的廚房、會動的機關、全村共用的風場都保留；4.0 只換掉了渲染（純 3D、抗鋸齒、光暈、動態解析度），鏡頭與互動系統還沒換成切片的新架構（計畫的 Phase 10）。

| 文件 | 內容 |
| --- | --- |
| [docs/CHANGES.md](docs/CHANGES.md) | 版本差異、Bug 清單與修正紀錄 |
| [docs/DESIGN.md](docs/DESIGN.md) | 遊戲設計（五章流程、謎題與可解性）、美術風格規範、渲染／角色／環境／鏡頭規範 |
| [docs/TESTING.md](docs/TESTING.md) | 單元、端對端、黑箱模擬玩家測試結果；效能與相容性；已知限制與未完成項目 |
| [docs/PLAYTEST.md](docs/PLAYTEST.md) | AI 模擬玩家測試紀錄（不是真人測試） |
| [docs/media/](docs/media/) | 實際遊戲錄影（`v4-*.mp4` 是 4.0 切片；其餘是 3.x 的 ASCII 版本，保留作為紀錄） |
| [docs/screenshots/](docs/screenshots/) | 固定鏡頭比較截圖（3.x 以前的 ASCII 截圖保留作為紀錄） |

## 操作

| 操作 | 桌面 | 手機（直式、橫式都可以） |
| --- | --- | --- |
| 移動 | WASD／方向鍵（按住 Shift 用走的），或點一下地面（自動尋路繞過障礙物） | 左下角虛擬搖桿，或點一下地面 |
| 去看過的地方 | 地圖（M）上點地點名稱，角色會自己走過去 | 同左 |
| 互動 | E／Space，或直接點物件 | 右下角「互動」按鈕，或直接點物件 |
| 對話 | 點一下或 Space；選項可按數字鍵；點虛線韓文看註解 | 點一下；點虛線韓文看註解 |
| 鏡頭 | 滾輪縮放；V 切換遠景／近景 | 雙指捏合；右上角「近景／遠景」 |
| 選單 | J 任務日誌、I 背包、M 地圖、Esc 暫停 | 右上角按鈕 |

設定裡可以調整畫質（自動／低／中／高／超高）、光暈、解析度上限、陰影、鏡頭視角、震動、減少動畫。舊版的 ASCII 設定會在讀取時自動移除。切片的操作見 [docs/v4/GDD.md](docs/v4/GDD.md) 第 6 節。

## 開發

需要 Node.js 20 以上。

```bash
npm install
npm run dev        # 開發伺服器 http://localhost:5173
npm test           # 單元測試（Vitest）
npm run build      # 打包到 dist/
npm run test:e2e   # 先 build；用本機 Chrome 跑功能情境（可加情境名稱只跑一個，例如 desktopReal）
npm run test:stability  # 畫面穩定度：鏡頭與角色在各種幀率下不抖動
npm run test:proto      # 4.0 切片：真實鍵盤通關、掉落原因、時機解法、鏡頭專項、暫停、點擊、手機版面
node tests/e2e/blackbox.mjs [keyboard,touch,explorer,newcomer]  # 黑箱模擬玩家：只看畫面文字、不傳送、不用答案介面
node tests/e2e/record.mjs docs/media [take] [low|medium|high|ultra]  # 逐格錄下正式版實際遊戲動畫
node tests/e2e/proto-record.mjs docs/media [take,...] [畫質]       # 錄下 4.0 切片（intro、stele、winch、bridge、fall、ending）
node tests/e2e/shots.mjs <資料夾> hd:fine,3d:-                  # 固定鏡頭比較截圖
node tests/e2e/perf.mjs docs/perf/results.json                    # 各畫質的幀率與幀時間
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
│   └── achievements.js     成就條件
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
├── render/Renderer.js      純 3D 渲染：MSAA、ACES、sRGB、柔邊陰影、Bloom、動態解析度
├── audio/                  AudioManager（三條音軌）、Sfx、Ambience、Music（全部即時合成）
├── proto/                  4.0 垂直切片：rules（規則與機構，純邏輯）、CameraDirector、Interaction（互動狀態機）、
│                           assets（程序化美術）、ProtoWorld（場景）、ProtoAudio、main
├── ui/                     Hud、Dialogue、Panels（日誌／背包／地圖／設定／圖鑑／成就／暫停）、
│                           Minimap（迷霧地圖）、Joystick、Cutscene、Screens
└── styles/main.css         民俗暗黑童話風格的介面
tests/
├── unit/                   規則、尋路與可解性、存檔、設定、骨架與動畫、門與碰撞、手勢、渲染版面、鏡頭
└── e2e/                    playthrough（功能情境）、stability（抖動）、blackbox（黑箱模擬玩家）、record（錄影）、shots（比較截圖）、perf（效能）
```

分工原則：**規則**（GameState）只回傳結果代碼、不碰畫面；**演出**（scenes）依結果播對話與動畫；**場景**（world）只負責畫面；**內容**（data）全部是資料。重新開始時整個 Session（場景、玩家、尋路網格）會被丟棄並釋放資源。

## 部署（GitHub Pages）

推到 `main` 後，GitHub Actions（`.github/workflows/deploy.yml`）會跑單元測試、打包，並部署到 GitHub Pages。

第一次設定：repo 的 **Settings → Pages → Build and deployment → Source** 必須選 **GitHub Actions**。不要選「Deploy from a branch」，也不要另外加 Jekyll 部署流程；那樣會發佈沒打包的原始碼，網頁會顯示「遊戲載入失敗」。

## 授權與來源

MIT License。沒有使用任何第三方模型、貼圖、字型檔或音檔：

- **3D 模型**：全部是程式產生（`src/world/`、`src/proto/assets.js`），包括角色骨架與蒙皮。
- **字型**：介面用系統字型（CSS font stack），不下載網路字型。
- **音效與音樂**：用 Web Audio 即時合成。
- **劇情、肖像、民俗圖鑑文字**：原創。民俗內容的參考來源列在遊戲內的民俗圖鑑與 `src/data/codex.js`。
- **執行期套件**：只有 three（MIT）。開發工具有 Vite、Vitest、Playwright-core。
