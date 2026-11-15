// Draws the world with Phaser: baked character sprites on Sketch tiles.
// Game flow lives in game/GameController; this class only turns sim state and events into pixels.

import * as Phaser from 'phaser';
import { MAP } from '../data/balance';
import { BOSS, MONSTERS, type MonsterKind } from '../data/monsters';
import { ROLE_ORDER, ROLES, type RoleKind } from '../data/roles';
import { ROOKIES, type RookieKind } from '../data/rookies';
import { WEAPONS } from '../data/weapons';
import type { Renderer, RendererStats } from '../game/Renderer';
import { groundDirToScreen, groundToScreen, screenToGround } from '../sim/iso';
import { Ground, type TownMap } from '../sim/map';
import type { Vec2 } from '../sim/types';
import type { SimEvent, Unit, World } from '../sim/world';
import type { OverlayName } from '../ui/DebugPanel';
import { BuildingViews, RUBBLE_TILES, type PlacedBlock } from './BuildingViews';
import { DebugOverlay } from './DebugOverlay';
import { FxViews } from './FxViews';
import { createCharacterAnims, directionFor, preloadSheets, sheetMeta, sheetOrigin } from './sheets';

/** Characters are drawn at this scale relative to a 120 px/unit bake (milestone 0 look test). */
const CHAR_SCALE_AT_120 = 1.4;
/** Sketch tiles: height of one stacked block level, and the top-face centre within the image. */
const SKETCH_LEVEL = 106;
const SKETCH_ORIGIN = { x: 128 / 256, y: 185 / 352 };
const SHEETS = [
  'knight', 'knight-spear', 'knight-hammer', 'knight-axe', 'knight-flail',
  'zombie', 'orc', 'skeleton', 'ghost', 'vampire', 'swordsman', 'archer',
];
/** Halo colours (decision 8): knight gold, rookies army blue by rank. */
const HALO_KNIGHT = 0xffd75e;
const HALO_ROOKIE = [0x7fb3e6, 0xb9d6f2, 0xffffff];

interface UnitView {
  sprite: Phaser.GameObjects.Sprite;
  /** Player only: ring under the feet and see-through copy when behind buildings. */
  halo?: Phaser.GameObjects.Ellipse;
  /** Rookie rank chevrons (veteran ▲, captain ▲▲). */
  badge?: Phaser.GameObjects.Text;
  ghost?: Phaser.GameObjects.Sprite;
  flash: number;
  /** Resting multiply tint (monster archetype colour). */
  tint: number;
}

export class PhaserRenderer implements Renderer {
  private readonly views = new Map<number, UnitView>();
  /** Decor images (trees, well) for occlusion; building blocks live in buildingViews. */
  private readonly decor: Phaser.GameObjects.Image[] = [];
  private buildingViews!: BuildingViews;
  private readonly fx: FxViews;
  private readonly debugOverlay?: DebugOverlay;

  /** Queues every texture the map and the characters need; call from the scene's preload(). */
  static preload(scene: Phaser.Scene, map: TownMap) {
    preloadSheets(scene, SHEETS);
    for (const key of tileKeys(map)) {
      if (scene.textures.exists(key)) continue;
      const [pack, name] = key.split(':');
      const dir = pack === 'ste' ? 'sketch-town-expansion' : 'sketch-town';
      scene.load.image(key, `assets/tiles/${dir}/${name}.png`);
    }
  }

  constructor(private readonly scene: Phaser.Scene, private readonly world: World, debug: boolean) {
    for (const s of SHEETS) createCharacterAnims(scene, s);
    this.drawMap();
    this.fx = new FxViews(scene, (x, y) => this.toScreen(x, y));
    if (debug) this.debugOverlay = new DebugOverlay(scene, (x, y) => this.toScreen(x, y));
    scene.scale.on('resize', this.fitCamera, this);
    this.fitCamera();
  }

  destroy() {
    this.scene.scale.off('resize', this.fitCamera, this);
    this.debugOverlay?.destroy();
  }

  // ------------------------------------------------------------------ Renderer

  sync(world: World, dt: number) {
    this.syncUnits(world, dt);
    this.buildingViews.update(world.buildings, this.scene.time.now / 1000, dt);
  }

  onGroundPointerDown(handler: (ground: Vec2) => void) {
    // Scene input listeners are removed by Phaser when the scene shuts down.
    this.scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => handler(screenToGround(p.worldX, p.worldY, MAP.tileScale)));
  }

  setPlanning(on: boolean) {
    this.buildingViews.setAurasVisible(on);
  }

  highlightBuilding(id: number) {
    this.buildingViews.highlight(id);
  }

  setRole(id: number, role: RoleKind | null) {
    this.buildingViews.setRole(id, role);
  }

  /** Drops the knight's sprite; the next sync rebuilds it from the new weapon's sheet. */
  knightWeaponChanged() {
    for (const p of this.world.players) {
      const v = this.views.get(p.id);
      if (!v) continue;
      v.sprite.destroy();
      v.halo?.destroy();
      v.ghost?.destroy();
      this.views.delete(p.id);
    }
  }

  updateDebugOverlay(world: World, overlays: Record<OverlayName, boolean>) {
    this.debugOverlay?.update(world, overlays);
  }

  screenOf(ground: Vec2): Vec2 {
    const p = this.toScreen(ground.x, ground.y);
    const cam = this.scene.cameras.main;
    return { x: (p.x - cam.worldView.x) * cam.zoom, y: (p.y - cam.worldView.y) * cam.zoom };
  }

  stats(): RendererStats {
    const zoom = this.scene.cameras.main.zoom;
    return { zoom, charPx: 80 * (this.charScale('knight') * sheetMeta(this.scene, 'knight').pixelsPerUnit / 120) * zoom };
  }

  /** Game-feel effects: flashes, damage numbers, shakes, boss telegraphs, floating text. */
  onEvent(world: World, e: SimEvent) {
    const s = MAP.tileScale;
    const cam = this.scene.cameras.main;
    switch (e.type) {
      case 'hit': {
        const v = this.views.get(e.unit);
        if (v) v.flash = 0.08;
        const m = world.monsters.find((u) => u.id === e.unit);
        if (!m) return;
        const p = this.toScreen(e.x, e.y);
        this.fx.damageNumber(p.x, p.y - 70 * s * (MONSTERS[m.kind as MonsterKind].scale), e.damage, e.damage >= 20);
        return;
      }
      case 'death': {
        const m = world.monsters.find((u) => u.id === e.unit);
        if (m && (m.kind === 'brute' || m.kind === 'warlord')) {
          cam.shake(m.kind === 'warlord' ? 600 : 160, m.kind === 'warlord' ? 0.012 : 0.005);
        }
        return;
      }
      case 'swing':
        // Flail: restart the swing animation on every damage pulse so it keeps spinning.
        if (e.weapon === 'flail') this.views.get(e.unit)?.sprite.anims.restart();
        if (e.weapon === 'hammer') {
          // Shockwave where the slam lands, timed with the hit.
          const k = world.players[0];
          const r = WEAPONS.hammer.range * world.progression.mods.knight.rangeMul;
          const x = k.x + k.facing.x * r;
          const y = k.y + k.facing.y * r;
          this.scene.time.delayedCall(WEAPONS.hammer.hitTime * 1000, () => this.fx.shockwave(x, y, WEAPONS.hammer.arc));
        }
        return;
      case 'bossSpawn':
        cam.shake(500, 0.008);
        return;
      case 'bossSlamWarn':
      case 'bossBoulderWarn':
        this.fx.telegraph(e.x, e.y, e.radius, e.time);
        return;
      case 'bossBoulder':
        this.fx.shockwave(e.x, e.y, e.radius, 0x8a7a6a);
        cam.shake(260, 0.01);
        return;
      case 'bossSlam':
        this.fx.shockwave(e.x, e.y, e.radius, 0xb8322c);
        cam.shake(320, 0.012);
        return;
      case 'bossCharge': {
        const boss = world.monsters.find((u) => u.id === e.unit);
        const b = world.buildings[e.building];
        if (!boss || !b) return;
        const cx = b.cells.reduce((a, [i]) => a + i, 0) / b.cells.length;
        const cy = b.cells.reduce((a, [, j]) => a + j, 0) / b.cells.length;
        this.fx.chargeLine(boss.x, boss.y, cx, cy, BOSS.charge.windup);
        return;
      }
      case 'playerHurt': {
        cam.shake(120, 0.004);
        const v = this.views.get(e.unit);
        if (v) v.flash = 0.1;
        return;
      }
      case 'buildingHit':
        this.buildingViews.hit(e.building);
        return;
      case 'buildingDestroyed':
        this.buildingViews.destroyed(world.map.buildings[e.building]);
        cam.shake(220, 0.006);
        return;
      case 'levelUp': {
        const k = world.players[0];
        const p = this.toScreen(k.x, k.y);
        this.fx.floatText(p.x, p.y - 90 * s, `Level ${e.level}!`);
        return;
      }
      case 'rookieJoined': {
        const r = world.rookies.find((u) => u.id === e.unit);
        if (!r) return;
        const p = this.toScreen(r.x, r.y);
        this.fx.floatText(p.x, p.y - 80 * s, e.kind === 'archer' ? 'Archer joins!' : 'Swordsman joins!', '#b9d6f2');
        return;
      }
      case 'rookiePromoted': {
        const r = world.rookies.find((u) => u.id === e.unit);
        if (!r) return;
        const p = this.toScreen(r.x, r.y);
        this.fx.floatText(p.x, p.y - 80 * s, e.rank === 1 ? 'Veteran!' : 'Captain!', '#ffffff');
        return;
      }
      case 'rally': {
        const k = world.players[0];
        const p = this.toScreen(k.x, k.y);
        this.fx.pulse(p.x, p.y, 0x7fb3e6);
        this.fx.floatText(p.x, p.y - 90 * s, 'Rally!', '#b9d6f2');
        return;
      }
      default:
    }
  }

  // ------------------------------------------------------------------ map

  private toScreen(gx: number, gy: number) {
    return groundToScreen(gx, gy, MAP.tileScale);
  }

  private tile(key: string, i: number, j: number, level: number) {
    const { x, y } = this.toScreen(i, j);
    const img = this.scene.add
      .image(x, y - level * SKETCH_LEVEL * MAP.tileScale, key)
      .setOrigin(SKETCH_ORIGIN.x, SKETCH_ORIGIN.y)
      .setScale(MAP.tileScale);
    img.setDepth(level === 0 ? -1e6 + y : y + level * 0.01);
    return img;
  }

  private drawMap() {
    const map = this.world.map;
    const c = map.centre;
    for (let j = 0; j < map.size; j++) {
      for (let i = 0; i < map.size; i++) {
        const g = map.ground[j * map.size + i];
        if (g === Ground.None) continue;
        let key = 'st:grass_center_N';
        if (g === Ground.Water) key = 'st:grass_river_E';
        else if (g === Ground.Bridge) key = 'st:grass_riverBridge_E';
        else if (i === c && j === c) key = 'st:grass_pathCrossing_N';
        else if (i === c) key = 'st:grass_path_E';
        else if (j === c) key = 'st:grass_path_N';
        this.tile(key, i, j, 0);
      }
    }
    this.buildingViews = new BuildingViews(this.scene, (k, i, j, l) => this.tile(k, i, j, l), (x, y) => this.toScreen(x, y));
    for (const b of map.buildings) {
      const placed: PlacedBlock[] = b.blocks.map((bl) => {
        const img = this.tile(bl.tile, bl.i, bl.j, bl.level);
        return { img, baseX: img.x, level: bl.level, i: bl.i, j: bl.j };
      });
      this.buildingViews.add(b, placed);
    }
    for (const d of map.decor) this.decor.push(this.tile(d.tile, d.i, d.j, 1));
  }

  private fitCamera() {
    const map = this.world.map;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const side of Object.values(map.edges)) {
      for (const [i, j] of side) {
        const s = this.toScreen(i, j);
        minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
      }
    }
    // Pad for tile half-widths, the cube sides below the ground and tall props at the top edge.
    const hx = 116 * MAP.tileScale;
    const top = 150 * MAP.tileScale;
    const bottom = 170 * MAP.tileScale;
    const w = maxX - minX + hx * 2;
    const h = maxY - minY + top + bottom;
    const cam = this.scene.cameras.main;
    const zoom = Math.min(this.scene.scale.width / w, this.scene.scale.height / h);
    cam.setZoom(zoom);
    cam.centerOn((minX + maxX) / 2, (minY - top + maxY + bottom) / 2);
  }

  // ------------------------------------------------------------------ units

  private charScale(sheet: string) {
    return (CHAR_SCALE_AT_120 * 120) / sheetMeta(this.scene, sheet).pixelsPerUnit;
  }

  private viewFor(u: Unit): UnitView {
    let v = this.views.get(u.id);
    if (v) return v;
    const def = u.team === 'enemy' ? MONSTERS[u.kind as MonsterKind] : null;
    const sheet = def ? def.sheet : u.kind === 'knight' ? WEAPONS[this.world.weapon].sheet : ROOKIES[u.kind as RookieKind].sheet;
    const meta = sheetMeta(this.scene, sheet);
    const [ox, oy] = sheetOrigin(meta);
    const scale = this.charScale(sheet) * (def?.scale ?? 1);
    const tint = def?.tint ?? 0xffffff;
    const sprite = this.scene.add.sprite(0, 0, sheet).setOrigin(ox, oy).setScale(scale).setTint(tint).setAlpha(def?.alpha ?? 1);
    v = { sprite, flash: 0, tint };
    if (u.team === 'player') {
      // Friendly halo (decision 8) and see-through silhouette for occlusion (decision 9).
      const knight = u.kind === 'knight';
      const col = knight ? HALO_KNIGHT : HALO_ROOKIE[u.rank];
      const hs = knight ? 1.4 : 1.1;
      v.halo = this.scene.add.ellipse(0, 0, 70 * MAP.tileScale * hs, 34 * MAP.tileScale * hs)
        .setStrokeStyle(3, col, 0.95).setFillStyle(col, 0.25);
      if (knight) v.ghost = this.scene.add.sprite(0, 0, sheet).setOrigin(ox, oy).setScale(scale)
        .setTint(0xffd75e).setTintMode(Phaser.TintModes.FILL).setAlpha(0.4).setDepth(1e6).setVisible(false);
    }
    this.views.set(u.id, v);
    return v;
  }

  private syncUnits(world: World, dt: number) {
    const now = this.scene.time.now / 1000;
    const live = new Set<number>();
    for (const u of [...world.players, ...world.rookies, ...world.monsters]) {
      live.add(u.id);
      const v = this.viewFor(u);
      const s = this.toScreen(u.x, u.y);
      v.sprite.setPosition(s.x, s.y).setDepth(s.y + 0.5);

      const face = groundDirToScreen(u.facing.x, u.facing.y);
      const dir = directionFor(face.x, face.y);
      const anim = u.state === 'dead' ? 'die' : u.state === 'attack' ? 'attack' : u.state === 'dodge' ? 'walk' : u.moving ? 'walk' : 'idle';
      const key = `${v.sprite.texture.key}:${anim}:${dir}`;
      if (v.sprite.anims.currentAnim?.key !== key) {
        // Keep the walk cycle phase when only the facing changes.
        const keepPhase = v.sprite.anims.currentAnim?.key.split(':')[1] === anim && anim === 'walk';
        const progress = v.sprite.anims.getProgress();
        v.sprite.play(key);
        if (keepPhase) v.sprite.anims.setProgress(progress);
      }
      v.sprite.anims.timeScale = u.state === 'dodge' ? 2.2 : 1;

      // Hit flash.
      if (v.flash > 0) {
        v.flash -= dt;
        v.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        if (v.flash <= 0) v.sprite.setTint(v.tint).setTintMode(Phaser.TintModes.MULTIPLY);
      }
      // Alpha: corpses fade out; ghosts flicker in and out of view; hurt friendlies blink.
      const mdef = u.team === 'enemy' ? MONSTERS[u.kind as MonsterKind] : null;
      let alpha = mdef?.alpha ?? 1;
      if (mdef?.phasing) alpha *= 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(now * 2.2 + u.id * 1.7));
      if (u.state === 'dead') alpha *= Math.max(0, 1 - Math.max(0, u.stateTime - 0.7) / 0.5);
      else if (u.invuln > 0 && u.team === 'player' && u.state !== 'dodge') alpha = 0.6;
      v.sprite.setAlpha(alpha);

      if (v.halo && u.kind !== 'knight') {
        // Promotions: brighter halo and slightly bigger body.
        v.halo.setStrokeStyle(3 + u.rank, HALO_ROOKIE[u.rank], 0.95);
        v.sprite.setScale(this.charScale(v.sprite.texture.key) * (1 + 0.06 * u.rank));
        // Rank chevrons above the head so veterans/captains read at a glance (play-test note).
        if (u.rank > 0 && u.state !== 'dead') {
          const text = u.rank === 1 ? '▲' : '▲▲';
          v.badge ??= this.scene.add.text(0, 0, text, { fontFamily: 'system-ui, sans-serif', fontSize: '40px', fontStyle: 'bold', color: '#ffd75e', stroke: '#3b2418', strokeThickness: 7 }).setOrigin(0.5, 1).setScale(MAP.tileScale);
          if (v.badge.text !== text) v.badge.setText(text).setColor(u.rank === 2 ? '#ffffff' : '#ffd75e');
          v.badge.setPosition(s.x, s.y - 105 * MAP.tileScale * (1 + 0.06 * u.rank)).setDepth(s.y + 0.6).setVisible(true);
        } else v.badge?.setVisible(false);
      }
      if (v.halo) {
        v.halo.setPosition(s.x, s.y + 4 * MAP.tileScale).setDepth(s.y + 0.4).setVisible(u.state !== 'dead');
      }
      if (v.ghost) {
        v.ghost.setPosition(s.x, s.y).setFrame(v.sprite.frame.name);
        v.ghost.setVisible(u.state !== 'dead' && this.isOccluded(v.sprite));
      }
    }
    this.fx.sync(world.gems, world.projectiles, now);
    // Flail: show the spinning ring while the knight attacks.
    const k = world.players[0];
    const spinning = world.weapon === 'flail' && k && k.state === 'attack';
    this.fx.spinRing(spinning ? k.x : null, k?.y ?? 0, WEAPONS.flail.range * world.progression.mods.knight.rangeMul, now);
    for (const [id, v] of this.views) {
      if (live.has(id)) continue;
      v.sprite.destroy();
      v.halo?.destroy();
      v.ghost?.destroy();
      v.badge?.destroy();
      this.views.delete(id);
    }
  }

  /** True when a building/decor block drawn in front of the sprite overlaps it. */
  private isOccluded(sprite: Phaser.GameObjects.Sprite): boolean {
    const b = sprite.getBounds();
    // Only the body matters, not the transparent margins of the cell.
    const body = new Phaser.Geom.Rectangle(b.centerX - b.width * 0.15, b.y + b.height * 0.35, b.width * 0.3, b.height * 0.4);
    for (const img of [...this.buildingViews.allBlocks(), ...this.decor]) {
      if (img.depth <= sprite.depth) continue;
      if (Math.abs(img.y - sprite.y) > 400 * MAP.tileScale) continue;
      const ib = img.getBounds();
      // Tile images have transparent space above the block; shrink to the visible block.
      const vis = new Phaser.Geom.Rectangle(ib.x + ib.width * 0.06, ib.y + ib.height * 0.36, ib.width * 0.88, ib.height * 0.6);
      // Require a real overlap (≥35% of the body), not just a touching edge.
      const inter = Phaser.Geom.Rectangle.Intersection(vis, body);
      if (inter.width * inter.height >= body.width * body.height * 0.35) return true;
    }
    return false;
  }
}

/** Every texture key the map needs. */
function tileKeys(map: TownMap): Set<string> {
  const keys = new Set(['st:grass_center_N', 'st:grass_path_E', 'st:grass_path_N', 'st:grass_pathCrossing_N', 'st:grass_river_E', 'st:grass_riverBridge_E']);
  for (const b of map.buildings) for (const bl of b.blocks) keys.add(bl.tile);
  for (const d of map.decor) keys.add(d.tile);
  for (const r of RUBBLE_TILES) keys.add(r);
  for (const k of ROLE_ORDER) keys.add(`st:${ROLES[k].roof}_S`);
  return keys;
}
