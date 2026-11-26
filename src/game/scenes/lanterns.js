import { Vector3 } from 'three';
import { CARVINGS, SCRIPT } from '../../data/story.js';

/** 第三章：四季的石燈與금줄 */
export async function lanternScene(ctx, spot) {
  const { state, world } = ctx;
  const L = SCRIPT.lantern;
  const carving = CARVINGS[state.inspectLantern(spot)];
  if (state.lanterns.isLit(state.carvingAt(spot))) {
    await ctx.say(L.alreadyLit(carving));
    return;
  }
  ctx.player.play('interact');
  const choice = await ctx.choose({ speaker: 'narrator', text: L.inspect(carving) }, L.choices);
  if (choice !== 0) return;
  ctx.player.play('interact');
  const result = state.lightLantern(spot);

  if (result === 'wrong') {
    ctx.sfx('lanternWrong');
    ctx.rig.shake(0.15, 0.3);
    ctx.player.play('startle');
    await world.sputterLantern(spot);
    await ctx.say(L.wrong);
    if (state.stats.lanternMistakes >= 2 && !state.clues.has('screen')) ctx.hud.tip('卡住了嗎？右上角的「提示」可以給你一點方向', 6000);
    return;
  }

  ctx.sfx('lantern', { note: state.lanterns.lit.length - 1 });
  world.syncLanterns(state.litSpots());
  await ctx.say(L.lit(carving));

  if (result === 'complete') {
    // 鏡頭轉向山丘入口，看금줄斷開
    const rope = ctx.level.rope;
    ctx.rig.shot(new Vector3(rope.x + 4, 5, rope.z + 8), new Vector3(rope.x, 1, rope.z - 2));
    ctx.sfx('rope');
    await ctx.wait(700);
    await world.setRopeOpen(true);
    ctx.session.rebuildNav();
    await ctx.say(L.complete);
  }
}

export async function ropeScene(ctx) {
  const r = ctx.state.inspectRope();
  await ctx.say(SCRIPT.rope[r]);
}
