/**
 * 關卡配置（純資料）。座標單位為公尺，x 向東、z 向南，北方是 -z。
 * World 依照這份資料蓋出場景，玩法邏輯不寫在這裡。
 */
export const LEVEL = {
  bounds: { minX: -22.5, maxX: 22.5, minZ: -24, maxZ: 24.5 },
  playerStart: { x: 0, z: 23 },

  /** 石燈點亮順序：花開 → 日烈 → 葉落 → 雪飛 */
  lanternOrder: ['spring', 'summer', 'autumn', 'winter'],

  houses: [
    { id: 'kitchen', x: -11, z: 7, w: 7, d: 5, door: 'east', glow: true },
    { id: 'house-nw', x: -12, z: -7, w: 6, d: 5, door: 'east', glow: false },
    { id: 'house-se', x: 13, z: 13, w: 7, d: 5, door: 'west', glow: true },
  ],
  storehouse: { x: 13, z: -3, w: 5, d: 4, door: 'west' },
  well: { x: 6, z: 7 },
  jangseung: [
    { x: -2.4, z: 19, female: false },
    { x: 2.4, z: 19, female: true },
  ],
  lanterns: [
    { season: 'autumn', x: -3.6, z: -8 },
    { season: 'spring', x: 3.6, z: -8 },
    { season: 'winter', x: -3.6, z: -12 },
    { season: 'summer', x: 3.6, z: -12 },
  ],
  /** 引導光點（只在關鍵時刻出現，不會劇透謎題） */
  markers: {
    stele: { x: 0, y: 4.3, z: 19 },
    altar: { x: 0, y: 2.6, z: -15.6 },
  },
  shrine: { x: 0, z: -20 },
  altar: { x: 0, z: -15.6 },
  jars: { x: -14, z: 12.5 },

  /** 互動點：玩家站在這附近（radius 內）就能互動 */
  interactables: [
    { id: 'stele', label: '調查 장승', x: 0, z: 18.8, radius: 2.8 },
    { id: 'kitchen', label: '進入 廚房', x: -6.6, z: 7, radius: 2.2 },
    { id: 'house-nw', label: '敲門', x: -7.6, z: -7, radius: 2.2 },
    { id: 'house-se', label: '查看 門板', x: 8.6, z: 13, radius: 2.2 },
    { id: 'well', label: '使用 水井', x: 6, z: 9.2, radius: 2.2 },
    { id: 'storehouse', label: '查看 倉庫', x: 9.6, z: -3, radius: 2.2 },
    { id: 'lantern-autumn', label: '查看 石燈', x: -2.2, z: -8, radius: 1.6 },
    { id: 'lantern-spring', label: '查看 石燈', x: 2.2, z: -8, radius: 1.6 },
    { id: 'lantern-winter', label: '查看 石燈', x: -2.2, z: -12, radius: 1.6 },
    { id: 'lantern-summer', label: '查看 石燈', x: 2.2, z: -12, radius: 1.6 },
    { id: 'altar', label: '查看 祭壇', x: 0, z: -14, radius: 2.2 },
  ],

  /** 小路（地面上較亮的條狀區域）：[x, z, 寬, 長] */
  paths: [
    [0, 4, 3, 40],
    [-3.5, 7, 7, 2.4],
    [3, 7.8, 4, 2.4],
    [5.2, -3, 9, 2.4],
    [4.5, 13, 8, 2.4],
    [-3.8, -7, 6.5, 2.2],
  ],

  trees: [
    { x: -19, z: 18, kind: 'round' },
    { x: -15.5, z: 21.5, kind: 'pine' },
    { x: 18, z: 20, kind: 'round' },
    { x: 13, z: 21.5, kind: 'pine' },
    { x: 19.5, z: 4, kind: 'pine' },
    { x: -19.5, z: 1, kind: 'round' },
    { x: -19, z: -15, kind: 'pine' },
    { x: 19, z: -14, kind: 'round' },
    { x: -8, z: -20.5, kind: 'pine' },
    { x: 8, z: -21, kind: 'pine' },
    { x: -19.5, z: -21, kind: 'round' },
    { x: 19.5, z: -21.5, kind: 'pine' },
    { x: -7, z: 14.5, kind: 'round' },
    { x: 17.5, z: -7.5, kind: 'pine' },
    { x: -5, z: 0, kind: 'round' },
    { x: 8, z: 1, kind: 'round' },
  ],
};
