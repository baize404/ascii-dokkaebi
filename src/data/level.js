/**
 * 關卡配置（純資料）。座標單位為公尺，x 向東、z 向南，北方是 -z。
 * World 依照這份資料蓋出場景；玩法邏輯不寫在這裡。
 */
export const LEVEL = {
  bounds: { minX: -22.5, maxX: 22.5, minZ: -25, maxZ: 24.5 },
  playerStart: { x: 0, z: 23 },

  /** 서낭당所在的小山丘：中心、平頂半徑、坡腳半徑、高度 */
  mound: { x: 0, z: -20, top: 5.2, foot: 7.6, height: 1.0, wallRadius: 6.6, openingHalfWidth: 1.9 },
  /** 擋住山丘入口的금줄（禁繩），石燈全部點亮後消失 */
  rope: { x: 0, z: -13.4, w: 4.2, d: 0.6 },

  houses: [
    { id: 'kitchen', x: -11, z: 9.5, w: 7, d: 5, door: 'east', glow: true, walkIn: true },
    { id: 'grandma-house', x: -12, z: 1, w: 6, d: 5, door: 'east', glow: false },
    { id: 'house-se', x: 13, z: 12, w: 7, d: 5, door: 'west', glow: true },
  ],
  storehouse: { x: 13.5, z: -1, w: 5, d: 4, door: 'west' },
  well: { x: 5.5, z: 7 },
  jars: { x: -15, z: 16.5 },
  pond: { x: 8, z: 19.5, r: 2.3 },
  jangseung: [
    { x: -2.4, z: 19.5, female: false },
    { x: 2.4, z: 19.5, female: true },
  ],
  /** 四座石燈的位置。刻紋（梅蘭菊竹）在每次新遊戲時隨機分配到這四個位置 */
  lanternSpots: [
    { x: -3.4, z: -4 },
    { x: 3.4, z: -4 },
    { x: -3.4, z: -9 },
    { x: 3.4, z: -9 },
  ],
  altar: { x: 0, z: -16.6 },
  dokkaebi: { x: 0, z: -18.7 },
  shrineTree: { x: 0, z: -21.6 },
  grandma: { x: -8.4, z: -0.4 },
  /** 黑貓依序出現的三個地點（模型位置與高度） */
  catSpots: [
    { x: -17.6, z: 10.6, y: 0.55 },
    { x: 6.7, z: 7.9, y: 0.98 },
    { x: 13.5, z: 1.5, y: 0.0 },
  ],
  /** 도깨비的發光腳印：從倉庫門口走向山丘 */
  footprints: [
    [10.2, -1.6], [9.2, -2.1], [8.2, -2.4], [7.1, -2.9], [6.0, -3.1], [4.9, -3.7], [3.6, -4.9],
    [2.6, -6.0], [1.8, -7.4], [1.1, -8.8], [0.7, -10.2], [0.3, -11.6], [0.1, -12.9],
  ],

  /**
   * 互動點：玩家站在這附近（radius 內）就能互動。
   * id 以外的 x/z 是「站的位置」，尋路會走到這裡。
   */
  interactables: [
    { id: 'stele', label: '調查 장승', x: 0, z: 18.6, radius: 2.6 },
    { id: 'pond', label: '看看 池塘', x: 8, z: 16.6, radius: 1.6 },
    { id: 'kitchen', label: '進入 廚房', x: -6.2, z: 9.5, radius: 2.0 },
    { id: 'jars', label: '查看 장독대', x: -15, z: 14.4, radius: 2.0 },
    { id: 'well', label: '使用 水井', x: 5.5, z: 9.2, radius: 2.0 },
    { id: 'storehouse', label: '查看 倉庫', x: 10.1, z: -1, radius: 2.0 },
    { id: 'footprints', label: '調查 腳印', x: 7.2, z: -3.9, radius: 1.5 },
    { id: 'grandma', label: '和 할머니 說話', x: -7.2, z: -0.6, radius: 1.4 },
    { id: 'screen', label: '看看 屋裡的屏風', x: -7.2, z: 2.2, radius: 1.4 },
    { id: 'house-se', label: '查看 門板', x: 8.1, z: 12, radius: 2.0 },
    { id: 'lantern-0', label: '查看 石燈', x: -2.1, z: -4, radius: 1.5 },
    { id: 'lantern-1', label: '查看 石燈', x: 2.1, z: -4, radius: 1.5 },
    { id: 'lantern-2', label: '查看 石燈', x: -2.1, z: -9, radius: 1.5 },
    { id: 'lantern-3', label: '查看 石燈', x: 2.1, z: -9, radius: 1.5 },
    { id: 'rope', label: '查看 금줄', x: 0, z: -12.2, radius: 1.6 },
    { id: 'altar', label: '查看 祭壇', x: 0, z: -15.1, radius: 1.8 },
    { id: 'cat', label: '靠近 黑貓', x: -17.2, z: 12.4, radius: 1.8, dynamic: true },
  ],
  /** 黑貓三個地點對應的互動站位（與 catSpots 一一對應） */
  catStands: [
    { x: -17.2, z: 12.4 },
    { x: 7.6, z: 9.6 },
    { x: 13.5, z: 2.9 },
  ],

  /** 地標：走到附近就會「發現」，出現在地圖上並計入探索度 */
  landmarks: [
    { id: 'gate', name: '村口', x: 0, z: 22, r: 4, icon: '門' },
    { id: 'pond', name: '池塘', x: 8, z: 19.5, r: 4.5, icon: '水' },
    { id: 'kitchen', name: '廚房', x: -11, z: 9.5, r: 6, icon: '灶' },
    { id: 'jars', name: '장독대', x: -15, z: 16.5, r: 4.5, icon: '甕' },
    { id: 'well', name: '水井', x: 5.5, z: 7, r: 4, icon: '井' },
    { id: 'house-se', name: '貼符的房子', x: 13, z: 12, r: 6, icon: '符' },
    { id: 'grandma-house', name: '할머니的家', x: -12, z: 1, r: 6, icon: '家' },
    { id: 'storehouse', name: '倉庫', x: 13.5, z: -1, r: 5, icon: '倉' },
    { id: 'lanterns', name: '石燈參道', x: 0, z: -6.5, r: 5, icon: '燈' },
    { id: 'shrine', name: '서낭당', x: 0, z: -19, r: 5.5, icon: '樹' },
  ],

  /** 小路（地面上較亮的條狀區域）：[x, z, 寬, 長] */
  paths: [
    [0, 5.5, 3, 37],
    [-4.1, 9.5, 5.6, 2.2],
    [3.3, 9.2, 3.6, 2.2],
    [5.0, 12, 7.2, 2.2],
    [5.7, -1, 8.6, 2.2],
    [-4.4, 1, 5.8, 2.2],
    [-8.0, 13.0, 9.0, 1.8],
    [4.0, 17.4, 5.0, 1.8],
  ],

  trees: [
    { x: -19, z: 19, kind: 'round' },
    { x: -15.5, z: 22, kind: 'pine' },
    { x: 18, z: 20, kind: 'round' },
    { x: 13.5, z: 22, kind: 'pine' },
    { x: 19.5, z: 4, kind: 'pine' },
    { x: -19.5, z: -3, kind: 'round' },
    { x: -19, z: -15, kind: 'pine' },
    { x: 19, z: -14, kind: 'round' },
    { x: -9.5, z: -20.5, kind: 'pine' },
    { x: 9.5, z: -21, kind: 'pine' },
    { x: -19.5, z: -22, kind: 'round' },
    { x: 19.5, z: -22.5, kind: 'pine' },
    { x: -6, z: 16, kind: 'round' },
    { x: 18, z: -6.5, kind: 'pine' },
    { x: -6.2, z: 5.2, kind: 'round' },
    { x: 8.5, z: 3, kind: 'round' },
    { x: -13, z: -10, kind: 'round' },
    { x: 12, z: -10, kind: 'pine' },
    { x: -5.5, z: -24, kind: 'pine' },
    { x: 5.5, z: -24.2, kind: 'round' },
  ],
};

/** 地面高度：微微起伏的地面 + 서낭당山丘。World、玩家與相機共用。 */
export function heightAt(x, z) {
  const m = LEVEL.mound;
  const d = Math.hypot(x - m.x, z - m.z);
  const t = Math.min(1, Math.max(0, (m.foot - d) / (m.foot - m.top)));
  const mound = m.height * t * t * (3 - 2 * t);
  const ripple = Math.sin(x * 0.31 + 0.8) * Math.cos(z * 0.27 - 0.4) * 0.07 + Math.sin(x * 0.11 - z * 0.13) * 0.06;
  return mound + ripple * (1 - t);
}
