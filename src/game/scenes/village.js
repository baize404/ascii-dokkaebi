import { SCRIPT } from '../../data/story.js';

/**
 * 第一、二章：村落裡的互動。每個函式收到 ctx（見 Session.#context），
 * 依 GameState 回傳的結果代碼播對話、動畫與音效。
 */
export const villageScenes = {
  async stele(ctx) {
    ctx.player.play('interact');
    const r = ctx.state.readStele();
    await ctx.say(SCRIPT.stele[r]);
  },

  async pond(ctx) {
    ctx.state.inspect('pond');
    ctx.sfx('water');
    await ctx.say(SCRIPT.pond);
  },

  async kitchen(ctx) {
    ctx.player.play('interact');
    const r = ctx.state.visitKitchen();
    ctx.sfx('page');
    await ctx.say(SCRIPT.kitchen[r]);
    if (r === 'first') ctx.gotItem('gourd');
  },

  async jars(ctx) {
    ctx.player.play('interact');
    const choice = await ctx.choose(SCRIPT.jars.ask, SCRIPT.jars.choices);
    if (choice === 3) return;
    ctx.sfx('shuffle');
    const r = ctx.state.openJar(choice);
    await ctx.say(SCRIPT.jars[r]);
    if (r === 'got') ctx.gotItem('muk');
  },

  /** 水井：要實際轉三次轆轤才拉得上水桶 */
  async well(ctx) {
    const { state, world } = ctx;
    if (state.flags.keyTaken) {
      ctx.sfx('water');
      await ctx.say(SCRIPT.well.empty);
      return;
    }
    if (state.flags.wellCranks === 0) await ctx.say(SCRIPT.well.first);
    while (!state.flags.keyTaken) {
      const choice = await ctx.choose({ speaker: 'narrator', text: `轆轤（已轉 ${state.flags.wellCranks}/3 次）` }, SCRIPT.well.crankChoice);
      if (choice !== 0) return;
      ctx.player.play('interact');
      const { result, cranks } = state.crankWell();
      ctx.sfx('crank');
      await world.crankWell(cranks, 3);
      if (result === 'got') {
        ctx.sfx('water');
        await ctx.say(SCRIPT.well.got);
        ctx.gotItem('key');
      }
    }
  },

  async storehouse(ctx) {
    const { state, world } = ctx;
    ctx.player.play('interact');
    const r = state.useStorehouse();
    if (r === 'locked') {
      await ctx.say(state.clues.has('note') ? [...SCRIPT.storehouse.locked, ...SCRIPT.storehouse.lockedHint] : SCRIPT.storehouse.locked);
      return;
    }
    if (r.startsWith('opened')) {
      ctx.sfx('door');
      ctx.rig.shake(0.12, 0.4);
      await world.openStorehouse();
      await ctx.say(SCRIPT.storehouse.opened);
    }
    if (r.endsWith('filled')) {
      ctx.sfx('water');
      await ctx.say(SCRIPT.storehouse.filled);
      ctx.gotItem('makgeolli');
    } else if (r.endsWith('no-container')) {
      await ctx.say(SCRIPT.storehouse.noContainer);
    } else if (r === 'empty') {
      await ctx.say(SCRIPT.storehouse.empty);
    }
  },

  async footprints(ctx) {
    ctx.state.inspect('footprints');
    ctx.sfx('supernatural');
    await ctx.say(SCRIPT.footprints);
  },

  async 'house-se'(ctx) {
    ctx.player.play('interact');
    ctx.state.inspect('talisman');
    await ctx.say(SCRIPT.houseSe);
  },

  async screen(ctx) {
    ctx.player.play('interact');
    ctx.state.inspect('screen');
    await ctx.say(SCRIPT.screen);
  },

  async grandma(ctx) {
    const { state, world } = ctx;
    if (!state.flags.grandmaAwake) {
      await ctx.say(SCRIPT.grandma.asleep);
      const c = await ctx.choose({ speaker: 'narrator', text: '要叫醒할머니嗎？' }, SCRIPT.grandma.wakeChoice);
      if (c !== 0) return;
      state.wakeGrandma();
      world.setGrandmaAwake(true);
      await ctx.say(SCRIPT.grandma.wake);
      ctx.gotItem('needle');
      return;
    }
    await ctx.say(state.inventory.has('tornHat') ? SCRIPT.grandma.hat : SCRIPT.grandma.awake);
  },

  /** 隱藏事件：追黑貓三次，牠會把破帽子留給你 */
  async cat(ctx) {
    const { state, world } = ctx;
    const r = state.meetCat();
    if (r === 'gone') return;
    ctx.sfx('cat');
    await ctx.say(SCRIPT.cat[r]);
    if (r === 'third') ctx.gotItem('tornHat');
    await world.setCatStage(state.flags.catStage);
  },
};
