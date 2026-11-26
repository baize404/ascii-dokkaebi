import { Vector3 } from 'three';
import { SCRIPT } from '../../data/story.js';

/** 第四章：祭壇、도깨비登場、觀察題、甕遊戲、歸還감투 */
export async function altarScene(ctx) {
  const { state, world } = ctx;
  const res = state.useAltar();
  if (res.status === 'not-ready') {
    const lines = [...SCRIPT.altar.intro];
    if (res.missing.includes('muk')) lines.push(SCRIPT.altar.missingMuk);
    if (res.missing.includes('makgeolli')) lines.push(SCRIPT.altar.missingMakgeolli);
    await ctx.say(lines);
    return;
  }

  const altar = ctx.level.altar;
  ctx.audio.music.setMood('dokkaebi');
  ctx.rig.shot(new Vector3(altar.x + 4, world.altarTop.y + 4.2, altar.z + 7.5), new Vector3(altar.x, world.altarTop.y + 1.4, altar.z - 1.6));

  if (res.status === 'offered') {
    world.showOfferings();
    await ctx.say(SCRIPT.altar.offer);
    ctx.sfx('supernatural');
    await world.spawnDokkaebi();
    ctx.rig.shake(0.45, 0.7);
    ctx.player.play('startle');
    world.dokkaebiReact('laugh');
    ctx.sfx('laugh');
    await ctx.say(SCRIPT.dokkaebi.appear);
  } else {
    world.setDokkaebiVisible(true);
  }

  if (!state.flags.riddlesDone) await riddles(ctx);
  if (!state.flags.shellWon) await shellGame(ctx);
  await finale(ctx);
}

/** 觀察題：題目來自玩家在村子裡看過的東西；答錯可以選擇看提示 */
async function riddles(ctx) {
  const { state, world } = ctx;
  while (!state.flags.riddlesDone) {
    const r = state.currentRiddle();
    const n = state.flags.riddleIndex + 1;
    const eliminated = state.hintLevel('riddles') >= 3 ? [state.eliminatedChoice()] : [];
    const choice = await ctx.choose({ speaker: 'dokkaebi', text: `第 ${n} 題：${r.question}`, mood: 'laugh' }, r.choices, { eliminated });
    const result = state.answerRiddle(choice);
    if (result === 'wrong') {
      ctx.sfx('wrong');
      ctx.sfx('laugh');
      world.dokkaebiReact('laugh');
      await ctx.say(SCRIPT.dokkaebi.wrong);
      const c = await ctx.choose({ speaker: 'child', text: '……' }, ['再想一次', '看提示']);
      if (c === 1) {
        const h = state.useHint('riddles');
        await ctx.say({ speaker: 'narrator', text: `提示 ${h.level}：${h.text}` });
      }
    } else {
      ctx.sfx('correct');
      world.dokkaebiReact('surprised');
      await ctx.say(result === 'done' ? [...SCRIPT.dokkaebi.correct, ...SCRIPT.dokkaebi.riddlesDone] : SCRIPT.dokkaebi.correct);
    }
    ctx.session.refreshHud();
  }
}

/** 甕遊戲：看清楚月亮被藏進哪個甕；可以直接點甕，或按選項 */
async function shellGame(ctx) {
  const { state, world } = ctx;
  while (!state.flags.shellWon) {
    await ctx.say(SCRIPT.dokkaebi.shellIntro);
    const round = state.newShellRound();
    const glint = state.hintLevel('shell') >= 3;
    await world.playShellRound(round, { glint });
    ctx.session.shellPickable = true;
    const slot = await ctx.choose(SCRIPT.dokkaebi.shellAsk, SCRIPT.dokkaebi.shellChoices);
    ctx.session.shellPickable = false;
    const result = state.answerShell(slot);
    await world.revealShell(slot, round.moonJar);
    if (result === 'wrong') {
      ctx.sfx('laugh');
      world.dokkaebiReact('laugh');
      await ctx.say(SCRIPT.dokkaebi.shellWrong);
      const c = await ctx.choose({ speaker: 'child', text: '……' }, ['再來一次', '看提示']);
      if (c === 1) {
        const h = state.useHint('shell');
        await ctx.say({ speaker: 'narrator', text: `提示 ${h.level}：${h.text}` });
      }
    } else {
      ctx.sfx('correct');
      world.dokkaebiReact('pout');
      await ctx.say(SCRIPT.dokkaebi.shellRight);
    }
  }
}

/** 支線：把감투還給도깨비（補好的才是真結局），然後進入結局 */
async function finale(ctx) {
  const { state, world } = ctx;
  const repaired = state.inventory.has('hat');
  const torn = state.inventory.has('tornHat');
  if (repaired || torn) {
    world.dokkaebiReact('surprised');
    await ctx.say(repaired ? SCRIPT.dokkaebi.hatNotice : SCRIPT.dokkaebi.hatTornNotice);
    const c = await ctx.choose({ speaker: 'child', text: '……' }, repaired ? SCRIPT.dokkaebi.giveHatChoice : SCRIPT.dokkaebi.tornHatChoice);
    if (c === 0) {
      state.giveHat();
      world.dokkaebiReact('cheer');
      ctx.sfx('achievement');
      await ctx.say(repaired ? SCRIPT.dokkaebi.hatThanks : SCRIPT.dokkaebi.tornThanks);
    }
  }
  const ending = state.finish();
  await ctx.session.playEnding(ending);
}
