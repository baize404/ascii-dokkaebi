/**
 * 所有遊戲文字集中在這裡（劇情、物品、任務、謎題），方便修改與翻譯。
 */
const N = '旁白';
const J = '장승';
const D = '도깨비';

export const ITEMS = {
  muk: { name: '메밀묵', note: '蕎麥涼粉' },
  makgeolli: { name: '막걸리', note: '米酒' },
  key: { name: '倉庫鑰匙', note: '生鏽的大鑰匙' },
};

export const SEASON_CARVING = {
  spring: '一朵盛開的花',
  summer: '一輪熾熱的太陽',
  autumn: '一片飄落的葉子',
  winter: '一片雪花',
};

export const OBJECTIVES = {
  stele: '到村口調查장승（守護柱）',
  offerings: '準備供品：메밀묵 與 막걸리',
  lanterns: '依季節順序點亮四座石燈',
  altar: '到老樹下的祭壇獻上供品',
  riddles: '答對도깨비的謎題，取回月亮',
};

export const RIDDLES = [
  {
    question: '每個月，我從瘦變胖、再從胖變瘦，可是我從來不吃東西。我是什麼？',
    choices: ['燈籠', '月亮', '影子'],
    answer: 1,
  },
  {
    question: '什麼東西越洗越髒？',
    choices: ['水', '碗', '衣服'],
    answer: 0,
  },
  {
    question: '我沒有腳卻會跑，沒有嘴卻會吼；你看不見我，卻看得見我推倒的東西。我是什麼？',
    choices: ['河', '도깨비', '風'],
    answer: 2,
  },
];

export const SCRIPT = {
  stele: {
    first: [
      { speaker: N, text: '村口立著兩根木雕守護柱「장승」，一根刻著「天下大將軍」，一根刻著「地下女將軍」。' },
      { speaker: J, text: '……外地來的孩子，你也發現了吧？今晚天上沒有月亮。' },
      { speaker: J, text: '是도깨비幹的好事。那傢伙最愛惡作劇，把月亮藏了起來，就等著有人陪他玩。' },
      { speaker: J, text: '想見他，先準備他最愛的兩樣東西：一碗메밀묵（蕎麥涼粉），一壺막걸리（米酒）。' },
      { speaker: J, text: '再把通往老樹的四座石燈點亮。記住順序——「花開、日烈、葉落、雪飛」。' },
      { speaker: J, text: '一切備妥，就到서낭당老樹下的祭壇獻上供品。去吧，提燈的孩子。' },
    ],
    again: [
      { speaker: J, text: '메밀묵、막걸리，還有石燈的順序：「花開、日烈、葉落、雪飛」。別忘了。' },
    ],
  },
  kitchen: {
    got: [
      { speaker: N, text: '廚房的灶還留著餘溫，桌上放著一碗剛做好的메밀묵。' },
      { speaker: N, text: '你小心地把它收進包袱裡。' },
    ],
    empty: [{ speaker: N, text: '廚房裡只剩下鍋碗瓢盆了。' }],
  },
  well: {
    got: [
      { speaker: N, text: '你轉動轆轤，把水桶拉了上來。' },
      { speaker: N, text: '桶底卡著一把生鏽的大鑰匙，上面刻著「곳간」（倉庫）。' },
    ],
    empty: [{ speaker: N, text: '井水映著一片沒有月亮的夜空。' }],
  },
  storehouse: {
    locked: [
      { speaker: N, text: '倉庫的門上掛著一把大鎖。' },
      { speaker: N, text: '聽說管倉庫的爺爺，老是把東西掉進井裡……' },
    ],
    opened: [
      { speaker: N, text: '鑰匙「喀」的一聲轉開了大鎖。' },
      { speaker: N, text: '倉庫角落擺著一甕막걸리，你舀了一壺帶走。' },
    ],
    empty: [{ speaker: N, text: '倉庫裡堆著米袋和農具，沒什麼特別的了。' }],
  },
  houseNw: [{ speaker: N, text: '屋裡傳來響亮的打呼聲。還是別吵醒他們好了。' }],
  houseSe: [
    { speaker: N, text: '門板上貼著一張黃色符咒，看起來是用來擋도깨비的。' },
    { speaker: N, text: '……符咒的一角被咬掉了。好像沒什麼用。' },
  ],
  lantern: {
    inspect: (season) => `石燈上刻著${SEASON_CARVING[season]}。`,
    choices: ['用燈籠點亮它', '先不要'],
    lit: [{ speaker: N, text: '燈火亮了起來。' }],
    complete: [
      { speaker: N, text: '燈火亮了起來。' },
      { speaker: N, text: '四座石燈一起燒得通紅，老樹那邊傳來一陣竊笑聲……' },
    ],
    reset: [
      { speaker: N, text: '火光才剛亮起，四座石燈就「噗」地一起熄滅了。' },
      { speaker: N, text: '順序好像不對。' },
    ],
    alreadyLit: (season) => [{ speaker: N, text: `刻著${SEASON_CARVING[season]}的石燈正燒得旺盛。` }],
  },
  altar: {
    intro: { speaker: N, text: '老樹下有一座石頭祭壇，周圍飄著幾團藍色的도깨비불（鬼火）。' },
    missing: {
      stele: '也許該先去村口問問장승。',
      muk: '還缺一碗메밀묵。',
      makgeolli: '還缺一壺막걸리。',
      lanterns: '通往老樹的石燈還沒有依序點亮。',
    },
    offer: [
      { speaker: N, text: '你把메밀묵和막걸리擺上祭壇。' },
      { speaker: N, text: '鬼火突然聚在一起，轉得越來越快——' },
    ],
  },
  dokkaebi: {
    appear: [
      { speaker: D, text: '嘿嘿嘿！好香的메밀묵！還有막걸리！' },
      { speaker: D, text: '小傢伙，你想要月亮對吧？那就陪我玩——猜謎！' },
      { speaker: D, text: '三題全答對，月亮就還你。答錯也沒關係，我最喜歡看人猜錯了，嘿嘿。' },
    ],
    wrong: [{ speaker: D, text: '嘿嘿，錯啦！再想想～' }],
    correct: [{ speaker: D, text: '唔……答對了。下一題！' }],
    solved: [
      { speaker: D, text: '哎呀，全被你答對了！好啦好啦，月亮還你——' },
      { speaker: N, text: '도깨비揮了揮手上的방망이（狼牙棒），一顆圓圓的月亮從老樹後面升了起來。' },
    ],
    farewell: [{ speaker: D, text: '下次再帶메밀묵來玩啊，提燈的孩子！' }],
  },
};
