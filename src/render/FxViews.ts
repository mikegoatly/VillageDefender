// Small moving things: XP gems, arrows, and floating text. Pooled by sim id.

import * as Phaser from 'phaser';
import { MAP } from '../data/balance';
import type { Gem, Projectile } from '../sim/world';

const GEM_TEX = 'vd-gem';
const ARROW_TEX = 'vd-arrow';
const AXE_TEX = 'vd-axe';
/** Max simultaneous damage numbers (swarms would otherwise spawn hundreds). */
const MAX_NUMBERS = 40;
/** Arrows fly at roughly chest height. */
const ARROW_LIFT = 38;

export class FxViews {
  private gems = new Map<number, Phaser.GameObjects.Image>();
  private arrows = new Map<number, Phaser.GameObjects.Image>();
  private numbers = 0;
  /** Flail spin ring around the knight. */
  private spin?: Phaser.GameObjects.Graphics;

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
      g.clear();
      // Throwing axe: handle + head, drawn spinning.
      g.fillStyle(0x3b2418, 1).fillRect(10, 2, 4, 22);
      g.fillStyle(0x8a5a3c, 1).fillRect(11, 3, 2, 20);
      g.fillStyle(0x3b2418, 1).fillTriangle(12, 2, 24, 0, 24, 12);
      g.fillStyle(0xcfd6dd, 1).fillTriangle(13, 3, 22, 2, 22, 10);
      g.generateTexture(AXE_TEX, 26, 26);
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
        img = a.kind === 'axe'
          ? this.scene.add.image(0, 0, AXE_TEX).setOrigin(0.5, 0.5).setScale(s * 4)
          : this.scene.add.image(0, 0, ARROW_TEX).setOrigin(0.85, 0.5).setScale(s * 2.4);
        this.arrows.set(a.id, img);
      }
      const p = this.toScreen(a.x, a.y);
      const v = this.toScreen(a.vx, a.vy);
      const rot = a.kind === 'axe' ? time * 18 : Math.atan2(v.y, v.x);
      img.setPosition(p.x, p.y - ARROW_LIFT * s).setRotation(rot).setDepth(p.y + 0.6);
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

  /** Small damage number that pops up and fades. */
  damageNumber(x: number, y: number, n: number, heavy: boolean) {
    if (this.numbers >= MAX_NUMBERS) return;
    this.numbers++;
    const t = this.scene.add
      .text(x + (Math.random() - 0.5) * 20 * MAP.tileScale, y, String(Math.round(n)), {
        fontFamily: 'system-ui, sans-serif', fontSize: heavy ? '44px' : '34px', fontStyle: 'bold',
        color: heavy ? '#ffb347' : '#ffffff', stroke: '#3b2418', strokeThickness: 7,
      })
      .setOrigin(0.5, 1).setScale(MAP.tileScale).setDepth(9e5);
    this.scene.tweens.add({
      targets: t, y: y - 50 * MAP.tileScale, alpha: 0, duration: 650, ease: 'Cubic.easeOut',
      onComplete: () => { t.destroy(); this.numbers--; },
    });
  }

  /** Ground circle that fills up over 	ime seconds: the boss's slam warning. */
  telegraph(gx: number, gy: number, radius: number, time: number) {
    const g = this.scene.add.graphics().setDepth(-4e5);
    const pts = (r: number) => {
      const out: Phaser.Math.Vector2[] = [];
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        const p = this.toScreen(gx + Math.cos(a) * r, gy + Math.sin(a) * r);
        out.push(new Phaser.Math.Vector2(p.x, p.y));
      }
      return out;
    };
    const outer = pts(radius);
    const state = { f: 0 };
    this.scene.tweens.add({
      targets: state, f: 1, duration: time * 1000,
      onUpdate: () => {
        g.clear();
        g.fillStyle(0xb8322c, 0.18).fillPoints(outer, true);
        g.lineStyle(4, 0xb8322c, 0.9).strokePoints(outer, true);
        g.fillStyle(0xb8322c, 0.35).fillPoints(pts(radius * state.f), true);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** Shockwave + dust on the ground (boss slam, hammer slam). */
  shockwave(gx: number, gy: number, radius: number, color = 0xc9b29b) {
    const p = this.toScreen(gx, gy);
    const w = radius * 2 * 116 * 1.414 * MAP.tileScale * 0.75;
    const ring = this.scene.add.ellipse(p.x, p.y, w * 0.2, w * 0.1).setStrokeStyle(6, color, 0.9).setDepth(-3e5);
    this.scene.tweens.add({ targets: ring, scaleX: 5, scaleY: 5, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  /** Red dashed line from the boss toward its charge target. */
  chargeLine(fx: number, fy: number, tx: number, ty: number, time: number) {
    const a = this.toScreen(fx, fy);
    const b = this.toScreen(tx, ty);
    const g = this.scene.add.graphics().setDepth(-3e5);
    g.lineStyle(8, 0xb8322c, 0.75);
    const n = 14;
    for (let k = 0; k < n; k += 2) {
      g.lineBetween(a.x + (b.x - a.x) * (k / n), a.y + (b.y - a.y) * (k / n), a.x + (b.x - a.x) * ((k + 1) / n), a.y + (b.y - a.y) * ((k + 1) / n));
    }
    this.scene.tweens.add({ targets: g, alpha: 0.2, yoyo: true, repeat: Math.max(1, Math.round(time / 0.25)), duration: 125, onComplete: () => g.destroy() });
  }

  /** Flail: a spinning ring around the knight while attacking (null hides it). */
  spinRing(gx: number | null, gy: number, radius: number, time: number) {
    if (gx === null) {
      this.spin?.setVisible(false);
      return;
    }
    this.spin ??= this.scene.add.graphics();
    const g = this.spin.setVisible(true);
    g.clear();
    const p = this.toScreen(gx, gy);
    g.setDepth(p.y + 0.45);
    g.lineStyle(3, 0xcfd6dd, 0.7);
    for (let k = 0; k < 3; k++) {
      const a0 = time * 12 + (k * Math.PI * 2) / 3;
      const pts: Phaser.Math.Vector2[] = [];
      for (let s = 0; s <= 8; s++) {
        const a = a0 + s * 0.12;
        const q = this.toScreen(gx + Math.cos(a) * radius, gy + Math.sin(a) * radius);
        pts.push(new Phaser.Math.Vector2(q.x, q.y - 20 * MAP.tileScale));
      }
      g.strokePoints(pts);
    }
  }

  /** Expanding ring (rally call). */
  pulse(x: number, y: number, color: number) {
    const ring = this.scene.add.ellipse(x, y, 40, 20).setStrokeStyle(4, color, 1).setDepth(8e5);
    this.scene.tweens.add({ targets: ring, scaleX: 12, scaleY: 12, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }
}
