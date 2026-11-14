import * as Phaser from 'phaser';
import { LookTestScene } from './lookTest/LookTestScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#d9bfa6',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [LookTestScene],
});

// Debug hook for automated play-testing (see docs/GAME_PLAN.md §5.4).
(window as unknown as { __vd: unknown }).__vd = { game };
