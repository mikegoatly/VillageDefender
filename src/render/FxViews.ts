// Small moving things: XP gems, arrows, and floating text. Pooled by sim id.

import * as Phaser from 'phaser';
import { MAP } from '../data/balance';
import type { Gem, Projectile } from '../sim/world';

const GEM_TEX = 'vd-gem';
const ARROW_TEX = 'vd-arrow';
/** Arrows fly at roughly chest height. */
const ARROW_LIFT = 38;

export class FxViews {
  private gems = new Map<number, Phaser.GameObjects.Image>();
  private arrows = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly toScreen: (gx: number, gy: number) => { x: number; y: number },
  ) {
    if (!scene.textures.exists(GEM_TEX)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      // Faceted sapphire with a dark outline, matching the Sketch outlines.
      const diamond = (cx: number, top: number, mid: number, bottom: number, half: number) => {
        g.fillTriangle(cx, top, cx + half, mid, cx - half, mid);
        g.fillTriangle(cx - half, mid, cx + half, mid, cx, bottom);
      };
      g.fillStyle(0x3b2418, 1);
      diamond(12, 0, 12, 28, 12);
      g.fillStyle(0x4aa3ff, 1);
      diamond(12, 3, 12, 24, 9);
      g.fillStyle(0xbfe3ff, 1).fillTriangle(12, 3, 16, 10, 8, 10);
      g.generateTexture(GEM_TEX, 24, 28);
      g.clear();
      g.fillStyle(0x3b2418, 1).fillRect(0, 2, 30, 3);
      g.fillStyle(0x8a5a3c, 1).fillRect(1, 3, 26, 1);
      g.fillStyle(0xdddddd, 1).fillTriangle(30, 0, 36, 3.5, 30, 7);
      g.fillStyle(0xf3e3d0, 1).fillTriangle(0, 0, 5, 3.5, 0, 7);
      g.generateTexture(ARROW_TEX, 36, 7);
      g.destroy();
    }
  }

  sync(gems: Gem[], projectiles: Projectile[], time: number) {
    const s = MAP.tileScale;
    const liveGems = new Set<number>();
    for (const g of gems) {
      liveGems.add(g.id);
      let img = this.gems.get(g.id);
      if (!img) {
        img = this.scene.add.image(0, 0, GEM_TEX).setOrigin(0.5, 1).setScale(1.8 * s * (g.value >= 5 ? 1.5 : g.value >= 2 ? 1.2 : 1));
        this.gems.set(g.id, img);
      }
      const p = this.toScreen(g.x, g.y);
      // Gentle bob while lying on the ground.
      const bob = g.magnet ? 0 : Math.sin(time * 4 + g.id) * 3 * s;
      img.setPosition(p.x, p.y - 10 * s + bob).setDepth(p.y + 0.2);
    }
    for (const [id, img] of this.gems) {
      if (!liveGems.has(id)) {
        img.destroy();
        this.gems.delete(id);
      }
    }

    const liveArrows = new Set<number>();
    for (const a of projectiles) {
      liveArrows.add(a.id);
      let img = this.arrows.get(a.id);
      if (!img) {
        img = this.scene.add.image(0, 0, ARROW_TEX).setOrigin(0.85, 0.5).setScale(s * 1.4);
        this.arrows.set(a.id, img);
      }
      const p = this.toScreen(a.x, a.y);
      const v = this.toScreen(a.vx, a.vy);
      img.setPosition(p.x, p.y - ARROW_LIFT * s).setRotation(Math.atan2(v.y, v.x)).setDepth(p.y + 0.6);
    }
    for (const [id, img] of this.arrows) {
      if (!liveArrows.has(id)) {
        img.destroy();
        this.arrows.delete(id);
      }
    }
  }

  /** Text that floats up and fades (level up, promotions, rally). */
  floatText(x: number, y: number, text: string, color = '#ffd75e') {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: '56px', fontStyle: 'bold', color, stroke: '#3b2418', strokeThickness: 8 })
      .setOrigin(0.5, 1)
      .setScale(MAP.tileScale)
      .setDepth(9e5);
    this.scene.tweens.add({ targets: t, y: y - 70 * MAP.tileScale, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /** Expanding ring (rally call). */
  pulse(x: number, y: number, color: number) {
    const ring = this.scene.add.ellipse(x, y, 40, 20).setStrokeStyle(4, color, 1).setDepth(8e5);
    this.scene.tweens.add({ targets: ring, scaleX: 12, scaleY: 12, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }
}
