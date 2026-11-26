import { Vector3 } from 'three';
import { OPENING, SCRIPT } from '../../data/story.js';

const v = (a) => new Vector3(...a);

/** 第一章開場：鏡頭飛過沒有月亮的村子 */
export async function playOpening(ctx) {
  const { cutscene, rig } = ctx;
  cutscene.start();
  for (const beat of OPENING) {
    rig.shot(v(beat.pos), v(beat.look));
    await cutscene.caption(beat.text, 3400);
  }
  cutscene.end();
}

/** 第五章：月亮回歸。月光照亮山丘、參道與整個村子 */
export async function playMoonReturn(ctx, ending) {
  const { cutscene, rig, world, audio } = ctx;
  cutscene.start();
  audio.music.setMood('moon');
  audio.ambience.setMood('moon');
  const [throwBeat, riseBeat, villageBeat] = SCRIPT.moon;

  rig.shot(v(throwBeat.pos), v(throwBeat.look));
  world.dokkaebiReact('cheer');
  ctx.sfx('moon');
  const moon = world.returnMoon();
  await cutscene.caption(throwBeat.text, 2200);
  rig.shot(v(riseBeat.pos), v(riseBeat.look));
  await cutscene.caption(riseBeat.text, 3000);
  await moon;
  rig.shot(v(villageBeat.pos), v(villageBeat.look));
  world.setGrandmaAwake(true);
  if (ending === 'true') world.trueEndingFires();
  const lights = world.lightUpVillage();
  await cutscene.caption(villageBeat.text, 3600);
  await lights;
  cutscene.end();

  const altar = ctx.level.altar;
  rig.shot(new Vector3(altar.x + 4, world.altarTop.y + 4, altar.z + 7.5), new Vector3(altar.x, world.altarTop.y + 1.2, altar.z - 1.6));
  await ctx.say(SCRIPT.dokkaebi.farewell);
  ctx.player.play('cheer');
  if (ending !== 'true') await world.hideDokkaebi();
  await ctx.wait(800);
}
