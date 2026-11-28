/**
 * 劇情與遊戲內容（純資料）：章節、說話者、道具、線索、提示、謎題與所有對話。
 * 規則在 game/GameState.js，演出在 game/scenes/；改內容只需要改這個檔案。
 */

export const CHAPTERS = {
  1: '第一章　消失的月亮',
  2: '第二章　沉睡的村落',
  3: '第三章　四季的石燈',
  4: '第四章　鬼怪的遊戲',
  5: '第五章　月亮回歸',
};

/** 說話者：名字與名字顏色 */
export const SPEAKERS = {
  narrator: { name: '旁白' },
  child: { name: '你', color: '#f2bd68' },
  jangseung: { name: '장승', color: '#d65f4c' },
  grandma: { name: '할머니', color: '#e2e8ef' },
  cat: { name: '黑貓', color: '#9fb0c0' },
  dokkaebi: { name: '도깨비', color: '#67c5dc' },
};

/** 道具：名稱、注音說明、ASCII 圖示、描述 */
export const ITEMS = {
  gourd: { name: '호리병', note: '葫蘆瓶', icon: ' () \n(__)', desc: '廚房櫃子上的葫蘆瓶，空的。可以拿來裝東西。' },
  makgeolli: { name: '막걸리', note: '米酒', icon: ' (~)\n(~~)', desc: '裝滿막걸리的葫蘆瓶。白濁的米酒，聞起來甜甜的。' },
  muk: { name: '메밀묵', note: '蕎麥涼粉', icon: ' ___\n|###|', desc: '灰褐色、軟軟的蕎麥涼粉。할머니說是做給도깨비的。' },
  key: { name: '倉庫鑰匙', note: '生鏽的大鑰匙', icon: ' O\n |=', desc: '刻著「곳간」（倉庫）的鐵鑰匙，濕濕的，剛從井裡拉上來。' },
  needle: { name: '바늘과 실', note: '針線', icon: ' |\n~/~', desc: '할머니給的針線包。她說：「東西破了，自己補。」' },
  tornHat: { name: '찢어진 감투', note: '破掉的小帽子', icon: ' ._.\n/_v_\\', desc: '黑色的小帽子，邊緣被貓咬破了。戴上去的瞬間，手好像變透明了一下……' },
  hat: { name: '도깨비 감투', note: '도깨비的隱身帽', icon: ' ._.\n/___\\', desc: '補好的帽子。傳說戴上도깨비的감투就能隱身——它的主人一定在找它。' },
};

/** 可以組合的道具：[a, b] → 結果 */
export const RECIPES = [{ inputs: ['tornHat', 'needle'], output: 'hat', text: '你用할머니的針線，一針一針把감투的破洞補好了。' }];

/** 四君子：石燈上的刻紋。season 是屏風上的題字（遊戲以屏風為準） */
export const CARVINGS = {
  plum: { name: '梅', ko: '매화', season: 'spring', seasonName: '早春', desc: '一枝梅花' },
  orchid: { name: '蘭', ko: '난초', season: 'summer', seasonName: '夏', desc: '一叢蘭草' },
  chrysanthemum: { name: '菊', ko: '국화', season: 'autumn', seasonName: '秋', desc: '一朵菊花' },
  bamboo: { name: '竹', ko: '대나무', season: 'winter', seasonName: '冬', desc: '幾根竹子' },
};
/** 正確的點燈順序：一年從早春開始 */
export const LANTERN_ORDER = ['plum', 'orchid', 'chrysanthemum', 'bamboo'];

/** 線索：寫進任務日誌的「線索」頁，也計入探索度 */
export const CLUES = {
  stele: { title: '장승的話', text: '도깨비偷走了月亮。他喜歡村裡人做的食物和酒。參道上的四盞石燈，要「照著一年的順序」點起。' },
  note: { title: '할머니的字條', text: '「메밀묵放在장독대最大的甕裡冷著。倉庫鑰匙我綁在井繩上了，免得又弄丟。」' },
  emptyJar: { title: '倉庫裡的酒甕', text: '倉庫角落有一甕막걸리，可是沒有東西可以裝。' },
  screen: { title: '四君子屏風', text: '할머니屋裡的屏風畫著四種植物，各寫著季節：梅—早春，蘭—夏，菊—秋，竹—冬。' },
  footprints: { title: '發光的腳印', text: '泛著藍光的大腳印，從倉庫門口一路走向山丘上的老樹。' },
  talisman: { title: '被咬過的부적', text: '貼在門上的黃色符咒缺了一角，像是被咬掉的——도깨비一點都不怕它。' },
  grandma: { title: '할머니說的話', text: '「도깨비啊，愛玩、愛熱鬧，最怕寂寞。陪他玩，他就會把東西還你。」' },
  rope: { title: '금줄', text: '山丘入口拉著一條금줄（禁繩）。할머니說，四盞燈都亮了，路才會開。' },
  tree: { title: '老樹的布條', text: '서낭당的老樹上綁著五種顏色的布條：青、赤、黃、白、黑。' },
  cat: { title: '黑貓', text: '一隻黑貓叼著一頂小帽子，在村子裡跑來跑去。' },
  pond: { title: '池塘', text: '池水映著一片沒有月亮的天空。' },
  lanternPlum: { title: '石燈：梅', text: '有一盞石燈刻著梅花。' },
  lanternOrchid: { title: '石燈：蘭', text: '有一盞石燈刻著蘭草。' },
  lanternChrysanthemum: { title: '石燈：菊', text: '有一盞石燈刻著菊花。' },
  lanternBamboo: { title: '石燈：竹', text: '有一盞石燈刻著竹子。' },
};
export const CARVING_CLUE = { plum: 'lanternPlum', orchid: 'lanternOrchid', chrysanthemum: 'lanternChrysanthemum', bamboo: 'lanternBamboo' };

/**
 * 도깨비的觀察題庫。每題只在玩家「已經發現」對應線索時才會被抽到，
 * 保證答案一定是玩家看過的東西；stele、rope、tree 是主線必經，至少有三題可抽。
 */
export const RIDDLES = [
  { id: 'jangseung', clue: 'stele', question: '村口那兩根장승，一根寫「天下大將軍」，另一根寫什麼？', choices: ['地下女將軍', '天上大將軍', '守門老將軍'], answer: 0, hint: '答案寫在村口另一根장승身上。' },
  { id: 'rope', clue: 'rope', question: '山丘的入口，原本被什麼攔住了？', choices: ['鐵鍊', '금줄（禁繩）', '木柵欄'], answer: 1, hint: '你剛剛才從那裡走上來。' },
  { id: 'tree', clue: 'tree', question: '老樹上的布條，一共有幾種顏色？', choices: ['三種', '五種', '七種'], answer: 1, hint: '仔細看看身後的老樹。' },
  { id: 'key', clue: 'note', question: '할머니把倉庫鑰匙藏在哪裡？', choices: ['장독대', '灶台下', '井繩上'], answer: 2, hint: '廚房那張字條寫過。' },
  { id: 'muk', clue: 'note', question: '메밀묵放在哪裡冷著？', choices: ['장독대最大的甕', '井裡', '倉庫'], answer: 0, hint: '廚房那張字條寫過。' },
  { id: 'autumn', clue: 'screen', question: '할머니的屏風上，寫著「秋」的是哪一種植物？', choices: ['梅', '竹', '菊'], answer: 2, hint: '想想할머니屋裡的屏風。' },
  { id: 'first', clue: 'screen', question: '你點亮的第一盞石燈，刻的是什麼？', choices: ['梅', '蘭', '竹'], answer: 0, hint: '一年從哪個季節開始？' },
];
export const RIDDLES_PER_GAME = 3;

/** 分段提示：每個謎題三段，越後面越具體，但不直接說出答案 */
export const HINTS = {
  start: ['村口那兩根木頭柱子好像在看著你。走過去看看。', '靠近장승，按 E 或點「互動」。'],
  offerings: [
    '장승說도깨비喜歡村裡人做的食物和酒。先去亮著燈的廚房看看。',
    '廚房桌上有할머니留的字條，寫了東西放在哪裡。',
    '메밀묵在장독대最大的甕裡；倉庫鑰匙綁在井繩上；倉庫的酒得用容器裝，廚房櫃子上有葫蘆瓶。',
  ],
  lanterns: [
    '장승說四盞燈要「照著一年的順序」點。一年是從哪個季節開始的？',
    '每盞石燈刻著不同的植物。할머니屋裡的屏風，把這四種植物和季節寫在一起。',
    '屏風上，梅花寫著「早春」——第一盞是刻著梅花的那一盞，接著依序是夏、秋、冬。',
  ],
  riddles: [
    '도깨비問的都是你在村子裡看過的東西。打開任務日誌的「線索」頁找找看。',
    '想想你在哪裡看到相關的東西。',
    '刪掉一個不可能的答案。',
  ],
  shell: ['眼睛只盯著放進月亮的那一個甕，不要看도깨비。', '下一輪도깨비會轉得慢一點。', '甕停下來之前，藏著月亮的那一個會從縫裡透出一點光。'],
};

/** 開場過場：鏡頭位置、看向的點、字幕 */
export const OPENING = [
  { pos: [-26, 18, 30], look: [0, 2, 0], text: '那一夜，山村的月亮不見了。' },
  { pos: [14, 10, 6], look: [0, 1.5, -14], text: '沒有月光，參道上的石燈也一盞盞熄滅。' },
  { pos: [6, 6, -10], look: [0, 3, -21], text: '老樹下，藍色的鬼火在笑。' },
  { pos: [3, 4, 30], look: [0, 1.2, 22], text: '提著燈籠的孩子，走進了村子。' },
];

/** 新手教學提示 */
export const TUTORIAL = {
  move: { desktop: '用 WASD／方向鍵移動，或點一下地面', touch: '拖動左下角的搖桿移動，或點一下地面' },
  interact: { desktop: '靠近發光的장승，按 E 調查', touch: '靠近發光的장승，按右下角的「互動」' },
  journal: { desktop: '左上角是目前的目標；按 J 或點它打開任務日誌', touch: '左上角是目前的目標，點它打開任務日誌' },
  inventory: { desktop: '拿到東西了！按 I 或右上角「背包」查看', touch: '拿到東西了！點右上角「背包」查看' },
};

const N = (text) => ({ speaker: 'narrator', text });
const J = (text, mood) => ({ speaker: 'jangseung', text, mood });
const G = (text, mood) => ({ speaker: 'grandma', text, mood });
const D = (text, mood) => ({ speaker: 'dokkaebi', text, mood });
const C = (text) => ({ speaker: 'child', text });

export const SCRIPT = {
  stele: {
    first: [
      N('村口立著兩根木雕장승，一根寫著「天下大將軍」，一根寫著「地下女將軍」。'),
      J('……嗯？提燈籠的孩子，你看得見我們？', 'surprised'),
      J('今晚天上沒有月亮。是老樹那邊的도깨비，把月亮藏起來了。'),
      C('도깨비？要怎樣才能把月亮要回來？'),
      J('那傢伙貪吃又愛玩。村裡人做的吃的、釀的酒，他都喜歡——去村子裡找找吧。'),
      J('還有，參道上的四盞石燈全熄了。要照著「一年的順序」把它們點起來，通往老樹的路才會開。', 'serious'),
      J('至於什麼順序……村子裡的老人家比我們兩根木頭懂。去吧。'),
    ],
    again: [J('照著一年的順序點燈。供品嘛……去廚房看看。')],
  },
  pond: [N('池水很靜，映著一片沒有月亮的夜空。'), N('水裡好像有什麼在眨眼——是星星。')],
  kitchen: {
    first: [
      N('廚房的灶還有餘溫，桌上壓著一張字條。'),
      N('「메밀묵放在장독대最大的甕裡冷著。倉庫鑰匙我綁在井繩上了，免得又弄丟。——할머니」'),
      N('櫃子上有一個空的葫蘆瓶，你順手帶走了。'),
    ],
    again: [N('灶裡的火只剩一點點紅光。字條還壓在桌上。')],
  },
  jars: {
    ask: N('장독대上排著大大小小的甕。要打開哪一個？'),
    choices: ['小的甕', '中間的甕', '最大的甕', '算了'],
    small: [N('一股醬油香。是간장（醬油）。')],
    middle: [N('紅通通的，是고추장（辣椒醬）。')],
    got: [N('最大的甕裡放著一碗메밀묵，涼涼的、軟軟的。'), N('你小心地把它收進包袱。')],
    empty: [N('最大的甕已經空了。')],
  },
  well: {
    first: [N('井口的轆轤上纏著繩子，繩子很重。')],
    crankChoice: ['轉動轆轤', '算了'],
    crank: [N('喀啦……喀啦……水桶慢慢升上來。')],
    got: [N('水桶的提把上綁著一把生鏽的大鑰匙，上面刻著「곳간」（倉庫）。')],
    empty: [N('井水映著沒有月亮的夜空。')],
  },
  storehouse: {
    locked: [N('倉庫門上掛著一把大鎖。')],
    lockedHint: [N('할머니的字條說，鑰匙綁在井繩上。')],
    opened: [N('鑰匙「喀」的一聲轉開了大鎖，門吱呀地打開。'), N('角落擺著一甕막걸리，酒香撲鼻。')],
    noContainer: [N('막걸리甕太重了搬不動，得找個容器裝。')],
    filled: [N('你用葫蘆瓶舀了滿滿一瓶막걸리。')],
    empty: [N('倉庫裡堆著米袋和農具。酒甕裡還剩一點막걸리。')],
  },
  footprints: [N('地上有一串發著藍光的大腳印，比大人的腳還大。'), N('腳印從倉庫門口出發，一路走向山丘上的老樹。'), C('……是도깨비的腳印。')],
  houseSe: [N('門板上貼著一張黃色부적（符咒），是用來擋妖怪的。'), N('……符咒的一角被咬掉了，旁邊還有牙印。看來도깨비一點都不怕它。')],
  screen: [
    N('從半開的門看進去，屋裡立著一座四君子屏風。'),
    N('第一幅是梅花，題著「早春」；第二幅蘭草，題著「夏」；第三幅菊花，題著「秋」；第四幅竹子，題著「冬」。'),
  ],
  grandma: {
    asleep: [N('할머니靠在마루（木廊）上睡著了，輕輕打著呼。')],
    wakeChoice: ['輕輕叫醒她', '讓她睡吧'],
    wake: [
      G('嗯……哎呀，是誰家的孩子，這麼晚還提著燈籠？', 'surprised'),
      C('할머니，月亮被도깨비偷走了。'),
      G('呵呵，又是那個傢伙。도깨비啊，愛玩、愛熱鬧，最怕寂寞。', 'smile'),
      G('準備他愛吃的，陪他玩一玩，他就會把東西還你。'),
      G('這個針線包你拿著。這一路上，東西破了，自己補。'),
    ],
    awake: [G('石燈要照著屋裡屏風的季節點。一年嘛，總是從春天開始的。', 'smile')],
    hat: [G('哎呀，這頂小帽子破成這樣。拿針線補一補吧，一定是誰的寶貝。')],
  },
  lantern: {
    inspect: (carving) => `石燈的火室裡刻著${carving.desc}——「${carving.name}」。`,
    choices: ['用燈籠點亮它', '先不要'],
    lit: (carving) => [N(`燈火亮了起來，${carving.name}的影子投在地上。`)],
    wrong: [N('火光才亮起，就被一陣風吹熄了。'), N('好像還沒輪到這一盞。')],
    alreadyLit: (carving) => [N(`刻著${carving.name}的石燈正燒得旺盛。`)],
    complete: [N('四盞石燈同時燒得通紅——'), N('山丘入口的금줄「啪」地斷開，落在地上。'), N('老樹那邊，傳來一陣竊笑聲。')],
  },
  rope: {
    blocked: [N('山丘入口拉著一條금줄（禁繩），上面掛著木炭和紅辣椒。'), N('看來四盞石燈沒亮之前，這條路走不過去。')],
    open: [N('금줄已經斷開，落在地上了。')],
  },
  altar: {
    intro: [N('老樹上綁滿了五種顏色的布條：青、赤、黃、白、黑。樹下有一座石頭祭壇。')],
    missingMuk: N('도깨비最愛的메밀묵還沒找到。'),
    missingMakgeolli: N('還少了一瓶酒。'),
    offer: [N('你把메밀묵和막걸리擺上祭壇。'), N('四周的鬼火突然聚在一起，越轉越快——')],
  },
  dokkaebi: {
    appear: [
      D('嘿嘿嘿！好香的메밀묵！還有막걸리！', 'laugh'),
      D('小傢伙，你一個人走過整個村子，就為了月亮？', 'surprised'),
      D('好啊。很久沒人陪我玩了。玩兩個遊戲，贏了月亮就還你！', 'laugh'),
      D('第一個遊戲：我問，你答。問的都是這個村子裡的事——你有沒有用心看呀？'),
    ],
    wrong: [D('嘿嘿，錯啦！再想想～', 'laugh')],
    correct: [D('唔……答對了。', 'surprised')],
    riddlesDone: [D('哼，記性不錯嘛。', 'pout'), D('第二個遊戲！月亮就藏在其中一個甕裡，看好囉——', 'laugh')],
    shellIntro: [N('도깨비把一團月光塞進其中一個甕裡，開始飛快地轉動甕。')],
    shellAsk: { speaker: 'dokkaebi', text: '月亮在哪一個甕裡？', mood: 'laugh' },
    shellChoices: ['左邊的甕', '中間的甕', '右邊的甕'],
    shellWrong: [D('空的～嘿嘿嘿！再來一次！', 'laugh')],
    shellRight: [N('甕裡傳出柔和的光。'), D('哎呀……被你找到了。', 'pout')],
    hatNotice: [D('等等……你身上那個是……我的감투！', 'surprised')],
    hatTornNotice: [D('那、那是我的감투！怎麼破成這樣……', 'sad')],
    giveHatChoice: ['把감투還給他', '先不要'],
    tornHatChoice: ['把破掉的감투還給他', '先不要'],
    hatThanks: [
      D('……我找了好久。被貓叼走以後，就再也找不到了。', 'sad'),
      D('還幫我補好了……謝謝你。', 'smile'),
      D('以後啊，這個村子的夜路，我來幫你們照亮！', 'laugh'),
    ],
    tornThanks: [D('破了也是我的寶貝……謝啦。', 'smile')],
    farewell: [D('月亮還你啦。下次再帶메밀묵來玩啊，提燈的孩子！', 'laugh')],
  },
  cat: {
    first: [N('一隻黑貓蹲在石頭上，嘴裡叼著一頂黑色的小帽子。'), N('你一靠近，牠就「喵」一聲跳走了。')],
    second: [N('黑貓蹲在井邊，尾巴甩來甩去。'), N('牠看了你一眼，又跑掉了。')],
    third: [N('黑貓趴在倉庫旁，把帽子放在地上，用鼻子推向你。'), N('……好像是要你收下。')],
  },
  moon: [
    { text: '도깨비把月光往天上一拋——', pos: [5, 3, -10], look: [0, 6, -20] },
    { text: '月亮從老樹後面升了起來。', pos: [3, 5, 1], look: [0, 16, -60] },
    { text: '月光一路照下山丘、照過參道、照亮了整個村子。', pos: [-18, 14, 20], look: [0, 1, -2] },
  ],
};

export const ENDINGS = {
  normal: { id: 'normal', title: '月亮回來了', text: '도깨비心滿意足地抱著메밀묵消失在老樹後面。山村又被月光照亮了。' },
  true: { id: 'true', title: '도깨비의 친구', text: '戴回감투的도깨비沒有離開。從那晚起，村裡的夜路上總有幾團藍色的火，替晚歸的人照路。' },
};

/** 任務日誌的目標文字（GameState.objectives() 依進度決定顯示哪些） */
export const OBJECTIVES = {
  start: '走進村子，看看誰還醒著',
  offerings: '準備도깨비喜歡的供品',
  muk: '找到메밀묵',
  makgeolli: '帶走倉庫裡的막걸리',
  key: '找到倉庫鑰匙',
  container: '找個容器裝막걸리',
  lanterns: '照著一年的順序點亮四盞石燈',
  lanternsClue: '找出石燈刻紋和季節的關係',
  altar: '到老樹下的祭壇獻上供品',
  game: '陪도깨비玩遊戲',
  riddles: '回答도깨비的問題',
  shell: '找出藏著月亮的甕',
  hat: '這頂帽子是誰的？',
  hatRepair: '想辦法補好破掉的감투',
};
