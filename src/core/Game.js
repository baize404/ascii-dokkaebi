import { PerspectiveCamera, Raycaster, Vector2 } from 'three';
import { LEVEL } from '../data/level.js';
import { Sfx } from '../audio/Sfx.js';
import { RIDDLES } from '../data/script.js';
import { updatePointScale } from '../world/Particles.js';
import { CameraRig } from '../game/CameraRig.js';
import { Interactions } from '../game/Interactions.js';
import { Player } from '../game/Player.js';
import { Quest } from '../game/Quest.js';
import { Renderer } from '../render/Renderer.js';
import { Dialogue } from '../ui/Dialogue.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';
import { World } from '../world/World.js';
import { EventBus } from './EventBus.js';
import { Input } from './Input.js';

/**
 * 遊戲主控：建立各模組、跑主迴圈、管理狀態（title → playing → ending）。
 */
export class Game {
  constructor({ canvas, maxDt = 0.05 }) {
    this.canvas = canvas;
    this.maxDt = maxDt;
    this.bus = new EventBus();
    this.renderer = new Renderer(canvas);
    this.camera = new PerspectiveCamera(38, 1, 0.1, 400);
    this.rig = new CameraRig(this.camera);
    this.input = new Input({ canvas, bus: this.bus });
    this.dialogue = new Dialogue(this.bus);
    this.screens = new Screens(this.bus);
    this.raycaster = new Raycaster();
    this.sfx = new Sfx(this.bus);

    this.state = 'title';
    this.busy = false;
    this.nearest = null;
    this.lastTime = 0;

    this.#newWorld();
    this.hud = new Hud({ quest: this.quest, bus: this.bus });
    this.#wireInteractions();
    this.hud.refresh();
    this.hud.setSoundState(this.sfx.muted);

    this.renderer.onResize = (w, h) => this.rig.setAspect(w / h);
    this.renderer.resize();
    this.#bindEvents();
  }

  #newWorld() {
    this.world?.dispose();
    this.world = new World(LEVEL);
    this.quest = new Quest({ lanternOrder: LEVEL.lanternOrder, riddles: RIDDLES });
    this.player = new Player(this.world, LEVEL.playerStart);
  }

  #wireInteractions() {
    this.interactions = new Interactions({
      quest: this.quest,
      world: this.world,
      dialogue: this.dialogue,
      hud: this.hud,
      rig: this.rig,
      player: this.player,
      bus: this.bus,
    });
  }

  #bindEvents() {
    const bus = this.bus;
    bus.on('ui:start', () => this.startPlaying());
    bus.on('ui:restart', () => this.restart());
    bus.on('ui:interact', () => this.tryInteract());
    bus.on('input:action', () => {
      if (this.state === 'playing' && !this.dialogue.isOpen) this.tryInteract();
    });
    bus.on('input:tap', (p) => this.#onTap(p));
    bus.on('input:toggleAscii', () => {
      this.renderer.asciiEnabled = !this.renderer.asciiEnabled;
      this.hud.setAsciiState(this.renderer.asciiEnabled);
    });
    bus.on('input:help', () => this.screens.showHelp(!this.screens.helpOpen));
    bus.on('input:toggleSound', () => this.hud.setSoundState(this.sfx.toggle()));
    bus.on('game:complete', () => this.#finish());
  }

  start() {
    this.renderer.setAnimationLoop((now) => this.#frame(now));
  }

  startPlaying() {
    this.state = 'playing';
    this.screens.showTitle(false);
    this.hud.show(true);
    this.rig.follow(this.player.position, true);
    this.quest.stats.startedAt = performance.now();
    this.hud.toast('先到村口找장승（守護柱）問問看');
    this.#updateMarker();
  }

  /** 引導光點：開場指向장승；供品與石燈都備妥後指向祭壇。 */
  #updateMarker() {
    const { flags } = this.quest;
    let target = null;
    if (!flags.readStele) target = LEVEL.markers.stele;
    else if (!flags.offered && this.quest.missingForAltar().length === 0) target = LEVEL.markers.altar;
    this.world.setMarker(target);
  }

  restart() {
    this.screens.hideEnd();
    this.#newWorld();
    this.#wireInteractions();
    this.hud.setQuest(this.quest);
    this.busy = false;
    this.startPlaying();
  }

  #finish() {
    this.state = 'ending';
    this.quest.stats.finishedAt = performance.now();
    this.hud.show(false);
    setTimeout(() => this.screens.showEnd(this.quest.stats), 600);
  }

  // ---------- 互動 ----------

  #nearestInteractable() {
    const p = this.player.position;
    let best = null;
    let bestDist = Infinity;
    for (const it of this.world.interactables) {
      const d = Math.hypot(it.position.x - p.x, it.position.z - p.z);
      if (d <= it.radius && d < bestDist) {
        best = it;
        bestDist = d;
      }
    }
    return best;
  }

  tryInteract(id = this.nearest?.id) {
    if (!id || this.busy || this.state !== 'playing') return;
    this.#runInteraction(id);
  }

  async #runInteraction(id) {
    this.busy = true;
    this.player.stop();
    this.player.faceTowards(this.world.facePoint(id));
    this.input.clear();
    this.hud.setPrompt('');
    this.rig.setFocus(true);
    try {
      await this.interactions.run(id);
    } finally {
      this.busy = false;
      this.rig.setFocus(false);
      this.hud.refresh();
      this.#updateMarker();
      if (this.state === 'playing') this.rig.follow(this.player.position);
    }
  }

  #onTap({ x, y }) {
    if (this.state !== 'playing' || this.busy) return;
    const ndc = new Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.world.pickables, true)[0];
    if (!hit) return;

    let obj = hit.object;
    while (obj && !obj.userData.interactId) obj = obj.parent;
    const id = obj?.userData.interactId;
    if (id) {
      const it = this.world.interactable(id);
      this.player.walkTo(it.position, () => this.tryInteract(id), Math.min(0.9, it.radius * 0.6));
    } else {
      this.player.walkTo(hit.point);
    }
  }

  // ---------- 主迴圈 ----------

  #frame(now) {
    const dt = Math.min(this.maxDt, (now - (this.lastTime || now)) / 1000);
    this.lastTime = now;

    if (this.state === 'playing' && !this.busy) {
      const v = this.input.moveVector();
      let move = null;
      if (v.x || v.y) {
        const { forward, right } = this.rig.groundAxes();
        const mx = forward.x * v.y + right.x * v.x;
        const mz = forward.z * v.y + right.z * v.x;
        const len = Math.hypot(mx, mz);
        move = { x: mx / len, z: mz / len };
      }
      this.player.update(dt, move);
      this.nearest = this.#nearestInteractable();
      this.hud.setPrompt(this.nearest ? this.nearest.label : '');
    } else {
      this.player.update(dt, null);
    }

    this.world.update(dt);
    this.rig.update(dt);
    updatePointScale(this.world.pointMaterials, this.renderer.sceneHeight, this.camera.fov);
    this.renderer.render(this.world.scene, this.camera);
  }

  /** 給自動化測試用的介面（網址加上 ?test 才會掛到 window） */
  testApi() {
    return {
      state: () => ({
        state: this.state,
        busy: this.busy,
        dialogueOpen: this.dialogue.isOpen,
        player: { x: this.player.position.x, z: this.player.position.z },
        nearest: this.nearest?.id ?? null,
        inventory: this.quest.inventory.list(),
        lanternsLit: [...this.quest.lanterns.lit],
        worldLanternsLit: this.world.litSeasons(),
        flags: { ...this.quest.flags },
        stats: { ...this.quest.stats },
        ascii: this.renderer.asciiEnabled,
        marker: this.world.marker.visible ? { x: this.world.markerBase.x, z: this.world.markerBase.z } : null,
        muted: this.sfx.muted,
      }),
      interactables: () => this.world.interactables.map(({ id, x, z }) => ({ id, x, z })),
      teleport: (x, z) => this.player.setPosition(x, z),
      projectToScreen: (x, y, z) => {
        const v = this.world.scene.position.clone().set(x, y, z).project(this.camera);
        return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
      },
    };
  }
}
