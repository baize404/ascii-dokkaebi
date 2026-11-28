# 動畫錄影與比較截圖

## 4.0（純 3D）

`v4-*.mp4` 是 4.0 垂直切片「斷橋與燈」的實際遊戲錄影，錄法與清單見 [../v4/TESTS.md](../v4/TESTS.md)。以下其餘檔案是 3.x（ASCII 版）的紀錄，保留作為比較。

## 3.x（ASCII 版，保留作為紀錄）

**錄影方式**：`node tests/e2e/record.mjs docs/media <鏡頭> <渲染模式> <字元密度>`

- 錄的是實際遊戲：真的遊戲程式、真的動畫系統（AnimationMixer、IK、彈簧骨、風場）、真的 ASCII 渲染。
- 每格固定推進 1/30 秒後截圖，再用 ffmpeg 合成 30 fps 的影片。
- 因為是逐格渲染，**影片的流暢度不代表實際幀率**（實際效能見 [../TESTING.md](../TESTING.md)）。
- 錄影時隱藏 HUD；演出用測試介面的 `demo` 觸發，它呼叫的是遊戲裡同一套動畫與場景函式，只是不經過對話。
- `-hd` 是 HD ASCII、Ultra 密度（每格 4 CSS px）；`-3d` 是同一段的原始 3D。

## 對照計畫第十二節的驗收項目

| # | 驗收項目 | 檔案 | 說明 |
| --- | --- | --- | --- |
| 1 | 原始版本與新版 ASCII | `../screenshots/compare/v2/`、`v3/`、`../screenshots/compare-hero-v2-v3.jpg` | 同鏡頭、同解析度。左上 2.0、右上 3.0 Fine、左下 3.0 Ultra、右下原始 3D |
| 2 | Classic／Fine／Ultra／Cinematic | `../screenshots/compare/v3/*-hd-{classic,fine,ultra,cinematic}.png`、`../screenshots/compare-density-kitchen.jpg` | 五個鏡頭 × 四種密度 |
| 3 | 相同鏡頭的 ASCII 與原始 3D | `../screenshots/compare/v3/*-3d--.png`；影片 `*-3d.mp4` | Pure／HD／Hybrid／3D 都有 |
| 4 | 主角待機、步行、奔跑 | `walk-run-hd.mp4`、`walk-run-3d.mp4` | 待機 → 起步 → 走 → 加速成跑 → 停下 |
| 5 | 手肘、膝蓋、手腕特寫 | `actions-hd.mp4`、`actions-3d.mp4`、`pickup-hd.mp4` | 近距離鏡頭：調查、抓取、轉鑰匙、開門、獻上、歡呼、受驚 |
| 6 | 拾取完整動畫 | `pickup-hd.mp4` | 彎腰屈膝、手伸到地面、握住、起身 |
| 7 | 燈籠與火焰飄動 | `lantern-hd.mp4`、`light-hd.mp4` | 跑步後急停、轉身時燈籠的慣性擺動；火焰隨風傾斜 |
| 8 | 門的開關 | `door-hd.mp4`、`door-3d.mp4` | 伸手握門環、門扇沿鉸鏈向內開、室內光透出、再關上。**窗戶不能開關**（未完成） |
| 9 | 水井轆轤與水桶連動 | `well-hd.mp4`、`well-3d.mp4` | 轉三圈：滾輪轉動、繩子收短、水桶離開水面滴水、升到井口 |
| 10 | 石燈刻紋與點燈 | `light-hd.mp4`、`light-3d.mp4` | 刻紋面朝參道；舉起燈籠、火星飛進火室、火焰慢慢形成、石燈內部發亮 |
| 11 | 黑貓 | `cat-hd.mp4` | 伸懶腰、舔毛、跳躍（**沒有錄到走路**：黑貓換地點是跳起來化成煙） |
| 12 | NPC 表情與動作 | `grandma-hd.mp4`、`dokkaebi-hd.mp4` | 할머니打盹、揉眼睛、起身、揮手；도깨비現身、大笑、揮棒歡呼 |
| 13 | 草木、落葉、炊煙、薄霧 | `village-hd.mp4` | 固定鏡頭：風吹草與樹、落葉、廚房煙囪的炊煙、螢火蟲 |
| 14 | 水面與月光倒影 | `moon-hd.mp4` | 水波、漣漪；月亮回歸時池塘的月光與村子窗戶亮起 |
| 15 | 月亮回歸結局 | `moon-hd.mp4` | 同上（完整結局過場可在遊戲中看到） |
