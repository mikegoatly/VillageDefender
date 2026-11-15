import * as Phaser from 'phaser';
import { GameScene } from './render/GameScene';

if (new URLSearchParams(location.search).get('look') === '3d') {
  // Spike: real-time three.js renderer using the Kenney GLB models (dev server only).
  void import('./render3d/spike').then((m) => m.startSpike3d(document.getElementById('game')!));
} else {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#d9bfa6',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    // Keyboard is read by src/input directly; Phaser's keyboard plugin is only used for R (restart).
    scene: [GameScene],
  });

  // Debug hook for automated play-testing (docs/GAME_PLAN.md §5.4). GameScene adds world/step/etc.
  (window as unknown as { __vd: Record<string, unknown> }).__vd = { game };
}
