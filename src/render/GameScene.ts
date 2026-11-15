// Phaser host for one play session: creates the session, loads assets, then hands every frame
// to the GameController (game flow) with a PhaserRenderer (drawing). A restart is a scene restart.

import * as Phaser from 'phaser';
import { GameAudio } from '../audio/GameAudio';
import { GameController } from '../game/GameController';
import { createSession, getProfile, type Session, type SessionData } from '../game/session';
import type { World } from '../sim/world';
import { debugEnabled } from '../ui/DebugPanel';
import { PhaserRenderer } from './PhaserRenderer';

export class GameScene extends Phaser.Scene {
  private session!: Session;
  private controller?: GameController;

  constructor() {
    super('Game');
  }

  /** Used by tools/playtest.mjs through `window.__vd.scene`. */
  get world(): World {
    return this.session.world;
  }

  init(data: SessionData) {
    this.session = createSession(data, getProfile());
  }

  preload() {
    PhaserRenderer.preload(this, this.session.world.map);
    GameAudio.preload(this);
  }

  create() {
    this.controller = new GameController({
      session: this.session,
      renderer: new PhaserRenderer(this, this.session.world, debugEnabled()),
      audio: new GameAudio(this),
      host: { restart: (data) => this.scene.restart(data) },
      profile: getProfile(),
      root: document.getElementById('game')!,
    });
    ((window as unknown as { __vd: Record<string, unknown> }).__vd ??= {}).scene = this;
    this.events.once('shutdown', () => this.controller?.destroy());
  }

  update(_time: number, deltaMs: number) {
    this.controller?.update(deltaMs);
  }
}
