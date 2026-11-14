// Building visuals: damage tint, hit shake/flash, HP bars, smoke when badly damaged, rubble when ruined.
// The Sketch tiles have no damaged variants (plan §4.3 gap), so damage is shown with effects.

import * as Phaser from 'phaser';
import { BUILDING, MAP } from '../data/balance';
import type { Building } from '../sim/map';
import type { BuildingState } from '../sim/world';
import { ROLES, type RoleKind } from '../data/roles';

/** Placed tile image plus its resting position (for hit shake). */
export interface PlacedBlock {
  img: Phaser.GameObjects.Image;
  baseX: number;
  level: number;
  i: number;
  j: number;
}

interface View {
  blocks: PlacedBlock[];
  bar: Phaser.GameObjects.Graphics;
  smoke?: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Screen-space anchor above the roof. */
  top: { x: number; y: number };
  shake: number;
  ruined: boolean;
  /** Top block of each cell (the roof) with its original texture, for role roofs. */
  roofs: { img: Phaser.GameObjects.Image; key: string }[];
  role: RoleKind | null;
  icon?: Phaser.GameObjects.Text;
  /** Ground ring showing a role's aura/range (planning). */
  aura?: Phaser.GameObjects.Graphics;
  centre: { x: number; y: number };
}

export const RUBBLE_TILES = ['st:rocks_dirt_N', 'st:rocks_dirt_E', 'st:rocks_grass_S'];
const PUFF = 'vd-puff';

export class BuildingViews {
  private views = new Map<number, View>();
  /** Building highlighted during planning (-1 none). */
  private highlighted = -1;
  private aurasVisible = false;

  constructor(
    private readonly scene: Phaser.Scene,
    /** Places a Sketch tile (key, cell i, j, stack level) and returns the image. */
    private readonly placeTile: (key: string, i: number, j: number, level: number) => Phaser.GameObjects.Image,
    private readonly toScreen: (gx: number, gy: number) => { x: number; y: number },
  ) {
    if (!scene.textures.exists(PUFF)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(16, 16, 16);
      g.generateTexture(PUFF, 32, 32);
      g.destroy();
    }
  }

  add(def: Building, blocks: PlacedBlock[]) {
    let top = { x: 0, y: Infinity };
    for (const b of blocks) {
      const bounds = b.img.getBounds();
      // Visible block top sits ~36% down the tile image.
      const y = bounds.y + bounds.height * 0.36;
      if (y < top.y) top = { x: b.img.x, y };
    }
    // Centre the bar over the footprint.
    const cx = def.cells.reduce((s, [i, j]) => s + this.toScreen(i, j).x, 0) / def.cells.length;
    top.x = cx;
    const bar = this.scene.add.graphics().setDepth(5e5);
    // Roof = highest block on each cell.
    const roofs: View['roofs'] = [];
    for (const [i, j] of def.cells) {
      const onCell = blocks.filter((b) => b.i === i && b.j === j);
      const roof = onCell.reduce<PlacedBlock | null>((a, b) => (!a || b.level > a.level ? b : a), null);
      if (roof) roofs.push({ img: roof.img, key: roof.img.texture.key });
    }
    const cxg = def.cells.reduce((s, [i]) => s + i, 0) / def.cells.length;
    const cyg = def.cells.reduce((s, [, j]) => s + j, 0) / def.cells.length;
    this.views.set(def.id, { blocks, bar, top, shake: 0, ruined: false, roofs, role: null, centre: { x: cxg, y: cyg } });
  }

  /** Shows a role on a building: role roof on every cell, an icon badge and its aura ring. */
  setRole(id: number, role: RoleKind | null) {
    const v = this.views.get(id);
    if (!v || v.ruined || v.role === role) return;
    v.role = role;
    for (const r of v.roofs) r.img.setTexture(role ? `st:${ROLES[role].roof}_S` : r.key);
    v.icon?.destroy();
    v.icon = undefined;
    v.aura?.destroy();
    v.aura = undefined;
    if (!role) return;
    const s = MAP.tileScale;
    v.icon = this.scene.add
      .text(v.top.x, v.top.y - 34 * s, ROLES[role].icon, {
        fontFamily: 'system-ui, sans-serif', fontSize: '44px', color: '#3b2418',
        backgroundColor: '#f3e3d0', padding: { x: 10, y: 2 },
      })
      .setOrigin(0.5, 1).setScale(s).setDepth(5e5 + 1);
    const radius = ROLES[role].radius;
    if (radius > 0) {
      v.aura = this.scene.add.graphics().setDepth(-5e5).setVisible(this.aurasVisible);
      const col = role === 'chapel' ? 0x9fd27a : role === 'smithy' ? 0xf0ad4e : 0x7fb3e6;
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k <= 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        const p = this.toScreen(v.centre.x + Math.cos(a) * radius, v.centre.y + Math.sin(a) * radius);
        pts.push(new Phaser.Math.Vector2(p.x, p.y));
      }
      v.aura.fillStyle(col, 0.12).fillPoints(pts, true);
      v.aura.lineStyle(3, col, 0.8).strokePoints(pts, true);
    }
  }

  /** Aura rings are shown while planning. */
  setAurasVisible(on: boolean) {
    this.aurasVisible = on;
    for (const v of this.views.values()) v.aura?.setVisible(on && !v.ruined);
  }

  highlight(id: number) {
    this.highlighted = id;
  }

  /** Every block image, for occlusion checks. */
  allBlocks(): Phaser.GameObjects.Image[] {
    const out: Phaser.GameObjects.Image[] = [];
    for (const v of this.views.values()) for (const b of v.blocks) out.push(b.img);
    return out;
  }

  hit(id: number) {
    const v = this.views.get(id);
    if (v) v.shake = 0.18;
  }

  destroyed(def: Building) {
    const v = this.views.get(def.id);
    if (!v || v.ruined) return;
    v.ruined = true;
    for (const b of v.blocks) b.img.destroy();
    v.blocks = [];
    v.roofs = [];
    v.icon?.destroy();
    v.aura?.destroy();
    v.smoke?.stop();
    // Rubble on each footprint cell (still blocks movement in the sim).
    def.cells.forEach(([i, j], k) => {
      const img = this.placeTile(RUBBLE_TILES[(i + j + k) % RUBBLE_TILES.length], i, j, 1);
      img.setTint(0xb8a493);
      v.blocks.push({ img, baseX: img.x, level: 1, i, j });
    });
    // Dust burst.
    const s = MAP.tileScale;
    const burst = this.scene.add.particles(v.top.x, v.top.y + 80 * s, PUFF, {
      speed: { min: 30 * s * 2, max: 120 * s * 2 }, angle: { min: 180, max: 360 },
      scale: { start: 1.6 * s, end: 3 * s }, alpha: { start: 0.7, end: 0 },
      tint: 0xc9b29b, lifespan: 900, quantity: 24, emitting: false,
    }).setDepth(4e5);
    burst.explode(24);
    this.scene.time.delayedCall(1200, () => burst.destroy());
    v.bar.clear();
  }

  update(states: BuildingState[], time: number, dt: number) {
    const s = MAP.tileScale;
    for (const b of states) {
      const v = this.views.get(b.id);
      if (!v || v.ruined) continue;
      const frac = b.hp / b.maxHp;

      // Darken with damage; brief white flash + shake on hit.
      const shade = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0xffffff), Phaser.Display.Color.ValueToColor(0x8f6f60), 100, Math.round((1 - frac) * 100),
      );
      const tint = Phaser.Display.Color.GetColor(shade.r, shade.g, shade.b);
      v.shake = Math.max(0, v.shake - dt);
      const offset = v.shake > 0 ? Math.sin(time * 90) * 3 * s * (v.shake / 0.18) : 0;
      for (const blk of v.blocks) {
        blk.img.x = blk.baseX + offset;
        if (v.shake > 0.12) blk.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        else if (b.id === this.highlighted) blk.img.setTint(0x3a3010).setTintMode(Phaser.TintModes.ADD);
        else blk.img.setTint(tint).setTintMode(Phaser.TintModes.MULTIPLY);
      }

      // Smoke once badly damaged.
      if (frac < BUILDING.damagedAt && !v.smoke) {
        v.smoke = this.scene.add.particles(v.top.x, v.top.y, PUFF, {
          speedY: { min: -40 * s * 2, max: -70 * s * 2 }, speedX: { min: -10, max: 10 },
          scale: { start: 0.9 * s, end: 2.6 * s }, alpha: { start: 0.55, end: 0 },
          tint: 0x5b4a44, lifespan: 1600, frequency: 160,
        }).setDepth(4e5);
      }

      // HP bar once damaged.
      v.bar.clear();
      if (frac < 1) {
        const w = 90 * s;
        const h = 9 * s;
        const x = v.top.x - w / 2;
        const y = v.top.y - 26 * s;
        v.bar.fillStyle(0x3b2418, 0.85).fillRect(x - 2, y - 2, w + 4, h + 4);
        v.bar.fillStyle(frac > BUILDING.damagedAt ? 0x8cc152 : frac > 0.25 ? 0xf0ad4e : 0xd9534f, 1).fillRect(x, y, w * frac, h);
      }
    }
  }
}
