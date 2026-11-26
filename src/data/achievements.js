/**
 * 成就定義。check(summary) 在破關或特定事件時判斷是否達成；
 * summary 由 GameState.summary() 產生。
 */
export const ACHIEVEMENTS = [
  { id: 'moon', title: '月亮回來了', desc: '完成遊戲。', check: (s) => s.finished },
  { id: 'friend', title: '도깨비의 친구', desc: '把補好的감투還給도깨비，看見真結局。', check: (s) => s.ending === 'true' },
  { id: 'noHints', title: '不需要提示', desc: '一次提示都沒用就完成遊戲。', check: (s) => s.finished && s.hintsUsed === 0 },
  { id: 'cleanLanterns', title: '四季分明', desc: '石燈一次都沒點錯就全部點亮。', check: (s) => s.lanternsDone && s.lanternMistakes === 0 },
  { id: 'sharpEyes', title: '好眼力', desc: '도깨비的問題與甕遊戲都一次答對。', check: (s) => s.finished && s.riddleMistakes === 0 && s.shellMistakes === 0 },
  { id: 'explorer', title: '村落探險家', desc: '發現所有地標與線索（探索度 100%）。', check: (s) => s.exploration >= 1 },
  { id: 'scholar', title: '民俗學者', desc: '解鎖全部民俗圖鑑。', check: (s) => s.codexUnlocked >= s.codexTotal },
  { id: 'catFriend', title: '貓的朋友', desc: '追上黑貓三次。', check: (s) => s.catStage >= 3 },
  { id: 'swift', title: '夜行如風', desc: '10 分鐘內完成遊戲。', check: (s) => s.finished && s.seconds > 0 && s.seconds <= 600 },
];
