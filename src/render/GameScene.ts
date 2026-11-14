// Main game scene: steps the sim at a fixed rate and draws it.
//
// URL params (debug / automated play-testing, plan §5.4):
//   ?seed=42   map + spawn seed        ?speed=4   sim speed multiplier
//   ?god=1     knight takes no damage  ?wave=5    start at this wave

import * as Phaser from 'phaser';
import { DT, MAP } from '../data/balance';
import { InputManager } from '../input/InputManager';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { ROOKIES, type RookieKind } from '../data/rookies';
import { groundDirToScreen, groundToScreen, screenToGround } from '../sim/iso';
import { Ground, type TownMap } from '../sim/map';
import { emptyInput, type InputState } from '../sim/types';
import { World, type Unit } from '../sim/world';
import { installRotateOverlay } from '../ui/RotateOverlay';
import { Hud, type HudWorld } from '../ui/Hud';
import { LevelUpPanel } from '../ui/LevelUpPanel';
import { FxViews } from './FxViews';
import { DebugPanel, debugEnabled, type DebugHost, type OverlayName } from '../ui/DebugPanel';
import { DebugOverlay } from './DebugOverlay';
import { BuildingViews, RUBBLE_TILES, type PlacedBlock } from './BuildingViews';
import { createCharacterAnims, directionFor, preloadSheets, sheetMeta, sheetOrigin } from './sheets';

/** Characters are drawn at this scale relative to a 120 px/unit bake (milestone 0 look test). */
const CHAR_SCALE_AT_120 = 1.4;
/** Sketch tiles: height of one stacked block level, and the top-face centre within the image. */
const SKETCH_LEVEL = 106;
const SKETCH_ORIGIN = { x: 128 / 256, y: 185 / 352 };
const SHEETS = ['knight', 'zombie', 'orc', 'swordsman', 'archer'];
/** Halo colours (decision 8): knight gold, rookies army blue by rank. */
const HALO_KNIGHT = 0xffd75e;
const HALO_ROOKIE = [0x7fb3e6, 0xb9d6f2, 0xffffff];
const ROTATE_CLASS = 'vd-rotate-active';

/**
 * Debug state that survives scene restarts (the panel lives outside the scene; the scene object
 * itself is reused by Phaser on restart).
 */
const debugState = {
  panel: null as DebugPanel | null,
  speed: null as number | null,
  paused: false,
  overlays: { flowKnight: false, flowBuildings: false, hitboxes: false, ranges: false, labels: false } as Record<OverlayName, boolean>,
  lastClick: null as { x: number; y: number } | null,
};

interface UnitView {
  sprite: Phaser.GameObjects.Sprite;
  /** Player only: ring under the feet and see-through copy when behind buildings. */
  halo?: Phaser.GameObjects.Ellipse;
  ghost?: Phaser.GameObjects.Sprite;
  flash: number;
  /** Resting multiply tint (monster archetype colour). */
  tint: number;
}

interface Params {
  seed: number;
  speed: number;
  god: boolean;
  wave: number;
}

function readParams(): Params {
  const q = new URLSearchParams(location.search);
  return {
    seed: Number(q.get('seed') ?? Math.floor(Math.random() * 1e6)),
    speed: Number(q.get('speed') ?? 1),
    god: q.get('god') === '1',
    wave: Number(q.get('wave') ?? 1),
  };
}

export class GameScene extends Phaser.Scene {
  world!: World;
  private params!: Params;
  private input2!: InputManager;
  private hud!: Hud;
  private levelUp!: LevelUpPanel;
  private fx!: FxViews;
  private views = new Map<number, UnitView>();
  /** Decor images (trees, well) for occlusion; building blocks live in buildingViews. */
  private decor: Phaser.GameObjects.Image[] = [];
  private buildingViews!: BuildingViews;
  private accumulator = 0;
  private paused = false;
  private uninstallRotate?: () => void;
  private override: InputState | null = null;
  private debugOverlay?: DebugOverlay;

  constructor() {
    super('Game');
  }

  init(data: { seed?: number }) {
    this.params = readParams();
    if (data.seed !== undefined) this.params.seed = data.seed;
    this.world = new World({ seed: this.params.seed, god: this.params.god, startWave: this.params.wave });
    this.views.clear();
    this.decor = [];
    this.accumulator = 0;
  }

  preload() {
    preloadSheets(this, SHEETS);
    for (const key of tileKeys(this.world.map)) {
      if (this.textures.exists(key)) continue;
      const [pack, name] = key.split(':');
      const dir = pack === 'ste' ? 'sketch-town-expansion' : 'sketch-town';
      this.load.image(key, `assets/tiles/${dir}/${name}.png`);
    }
  }

  create() {
    for (const s of SHEETS) createCharacterAnims(this, s);
    this.drawMap();

    const root = document.getElementById('game')!;
    this.input2 = new InputManager({ root });
    this.uninstallRotate = installRotateOverlay(document.body);
    this.hud = new Hud(document.body, {
      onRetry: () => this.restart(this.params.seed),
      onNewTown: () => this.restart(),
    });
    this.levelUp = new LevelUpPanel(document.body, (i) => {
      this.world.chooseUpgrade(i);
      this.handleEvents();
    });
    this.fx = new FxViews(this, (x, y) => this.toScreen(x, y));
    this.setupDebug();

    this.scale.on('resize', this.fitCamera, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.fitCamera, this);
      this.input2.destroy();
      this.uninstallRotate?.();
      this.hud.destroy();
      this.levelUp.destroy();
      this.debugOverlay?.destroy();
    });
    this.fitCamera();
    this.exposeDebug();
  }

  update(_time: number, deltaMs: number) {
    this.paused = document.documentElement.classList.contains(ROTATE_CLASS);
    const input = this.override ?? this.input2.poll();
    if (!this.paused && !debugState.paused) {
      this.accumulator += Math.min(deltaMs / 1000, 0.1) * this.params.speed;
      let steps = 0;
      while (this.accumulator >= DT && steps < 8 * Math.max(1, this.params.speed)) {
        this.world.tick([input]);
        this.handleEvents();
        this.accumulator -= DT;
        steps++;
      }
    }
    this.sync(deltaMs / 1000);
    this.buildingViews.update(this.world.buildings, this.time.now / 1000, deltaMs / 1000);
    this.syncUi();
    this.debugOverlay?.update(this.world, debugState.overlays);
    debugState.panel?.update();
  }

  /** Debug panel (dev builds or ?debug=1): created once, survives restarts; overlays per scene. */
  private setupDebug() {
    if (!debugEnabled()) return;
    if (debugState.speed !== null) this.params.speed = debugState.speed;
    this.debugOverlay = new DebugOverlay(this, (x, y) => this.toScreen(x, y));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      debugState.lastClick = screenToGround(p.worldX, p.worldY, MAP.tileScale);
    });
    if (debugState.panel) return;
    // The host always reads the live scene/world, so it stays valid across restarts.
    const scene = this;
    const host: DebugHost = {
      world: () => scene.world,
      seed: () => scene.params.seed,
      restart: (seed?: number) => scene.restart(seed),
      get speed() { return scene.params.speed; },
      set speed(v: number) { scene.params.speed = v; debugState.speed = v; },
      get paused() { return debugState.paused; },
      set paused(v: boolean) { debugState.paused = v; },
      stepTicks: (n: number) => scene.step(n, scene.override ?? scene.input2.poll()),
      overlays: debugState.overlays,
      lastClickGround: () => debugState.lastClick,
    };
    debugState.panel = new DebugPanel(host);
  }

  /** HUD and the level-up panel (the sim pauses itself while a choice is open). */
  private syncUi() {
    this.hud.update(this.hudView());
    const offers = this.world.progression.offers;
    if (offers && this.world.status === 'playing') this.levelUp.show(offers, this.world.progression.level);
    else if (this.levelUp.visible) this.levelUp.hide();
  }

  private hudView(): HudWorld {
    const w = this.world;
    return {
      status: w.status, lossReason: w.lossReason, wave: w.wave, totalWaves: w.totalWaves, time: w.time,
      kills: w.kills, stars: w.stars, players: w.players, buildings: w.buildings,
      knightLevel: w.progression.level, xp: w.progression.xp, xpToNext: w.progression.xpToNext,
      rookies: w.rookies.filter((r) => r.state !== 'dead').length, rookieCap: w.rookieCap,
    };
  }

  /** Advances the sim by n ticks immediately (debug/automation). */
  step(n: number, input: InputState = this.override ?? emptyInput()) {
    for (let k = 0; k < n; k++) {
      this.world.tick([input]);
      this.handleEvents();
    }
    this.sync(0);
    this.buildingViews.update(this.world.buildings, this.time.now / 1000, 0);
    this.syncUi();
  }

  restart(seed?: number) {
    this.scene.restart({ seed: seed ?? Math.floor(Math.random() * 1e6) });
  }

  // ------------------------------------------------------------------ map

  private toScreen(gx: number, gy: number) {
    return groundToScreen(gx, gy, MAP.tileScale);
  }

  private tile(key: string, i: number, j: number, level: number) {
    const { x, y } = this.toScreen(i, j);
    const img = this.add
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
        if (i === c && j === c) key = 'st:grass_pathCrossing_N';
        else if (i === c) key = 'st:grass_path_E';
        else if (j === c) key = 'st:grass_path_N';
        this.tile(key, i, j, 0);
      }
    }
    this.buildingViews = new BuildingViews(this, (k, i, j, l) => this.tile(k, i, j, l), (x, y) => this.toScreen(x, y));
    for (const b of map.buildings) {
      const placed: PlacedBlock[] = b.blocks.map((bl) => {
        const img = this.tile(bl.tile, bl.i, bl.j, bl.level);
        return { img, baseX: img.x, level: bl.level };
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
    const cam = this.cameras.main;
    const zoom = Math.min(this.scale.width / w, this.scale.height / h);
    cam.setZoom(zoom);
    cam.centerOn((minX + maxX) / 2, (minY - top + maxY + bottom) / 2);
  }

  // ------------------------------------------------------------------ units

  private charScale(sheet: string) {
    return (CHAR_SCALE_AT_120 * 120) / sheetMeta(this, sheet).pixelsPerUnit;
  }

  private viewFor(u: Unit): UnitView {
    let v = this.views.get(u.id);
    if (v) return v;
    const def = u.team === 'enemy' ? MONSTERS[u.kind as MonsterKind] : null;
    const sheet = def ? def.sheet : u.kind === 'knight' ? 'knight' : ROOKIES[u.kind as RookieKind].sheet;
    const meta = sheetMeta(this, sheet);
    const [ox, oy] = sheetOrigin(meta);
    const scale = this.charScale(sheet) * (def?.scale ?? 1);
    const tint = def?.tint ?? 0xffffff;
    const sprite = this.add.sprite(0, 0, sheet).setOrigin(ox, oy).setScale(scale).setTint(tint);
    v = { sprite, flash: 0, tint };
    if (u.team === 'player') {
      // Friendly halo (decision 8) and see-through silhouette for occlusion (decision 9).
      const knight = u.kind === 'knight';
      const col = knight ? HALO_KNIGHT : HALO_ROOKIE[u.rank];
      const hs = knight ? 1.4 : 1.1;
      v.halo = this.add.ellipse(0, 0, 70 * MAP.tileScale * hs, 34 * MAP.tileScale * hs)
        .setStrokeStyle(3, col, 0.95).setFillStyle(col, 0.25);
      if (knight) v.ghost = this.add.sprite(0, 0, sheet).setOrigin(ox, oy).setScale(scale)
        .setTint(0xffd75e).setTintMode(Phaser.TintModes.FILL).setAlpha(0.4).setDepth(1e6).setVisible(false);
    }
    this.views.set(u.id, v);
    return v;
  }

  private sync(dt: number) {
    const live = new Set<number>();
    for (const u of [...this.world.players, ...this.world.rookies, ...this.world.monsters]) {
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
      // Fade corpses out.
      v.sprite.setAlpha(u.state === 'dead' ? Math.max(0, 1 - Math.max(0, u.stateTime - 0.7) / 0.5) : u.invuln > 0 && u.team === 'player' && u.state !== 'dodge' ? 0.6 : 1);

      if (v.halo && u.kind !== 'knight') {
        // Promotions: brighter halo and slightly bigger body.
        v.halo.setStrokeStyle(3 + u.rank, HALO_ROOKIE[u.rank], 0.95);
        v.sprite.setScale(this.charScale(v.sprite.texture.key) * (1 + 0.06 * u.rank));
      }
      if (v.halo) {
        v.halo.setPosition(s.x, s.y + 4 * MAP.tileScale).setDepth(s.y + 0.4).setVisible(u.state !== 'dead');
      }
      if (v.ghost) {
        v.ghost.setPosition(s.x, s.y).setFrame(v.sprite.frame.name);
        v.ghost.setVisible(u.state !== 'dead' && this.isOccluded(v.sprite));
      }
    }
    this.fx.sync(this.world.gems, this.world.projectiles, this.time.now / 1000);
    for (const [id, v] of this.views) {
      if (live.has(id)) continue;
      v.sprite.destroy();
      v.halo?.destroy();
      v.ghost?.destroy();
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

  private handleEvents() {
    for (const e of this.world.events) {
      if (e.type === 'hit') {
        const v = this.views.get(e.unit);
        if (v) v.flash = 0.08;
      } else if (e.type === 'playerHurt') {
        this.cameras.main.shake(120, 0.004);
        const v = this.views.get(e.unit);
        if (v) v.flash = 0.1;
      } else if (e.type === 'buildingHit') {
        this.buildingViews.hit(e.building);
      } else if (e.type === 'buildingDestroyed') {
        this.buildingViews.destroyed(this.world.map.buildings[e.building]);
        this.cameras.main.shake(220, 0.006);
      } else if (e.type === 'levelUp') {
        const k = this.world.players[0];
        const p = this.toScreen(k.x, k.y);
        this.fx.floatText(p.x, p.y - 90 * MAP.tileScale, `Level ${e.level}!`);
      } else if (e.type === 'rookieJoined') {
        const r = this.world.rookies.find((u) => u.id === e.unit);
        if (r) {
          const p = this.toScreen(r.x, r.y);
          this.fx.floatText(p.x, p.y - 80 * MAP.tileScale, e.kind === 'archer' ? 'Archer joins!' : 'Swordsman joins!', '#b9d6f2');
        }
      } else if (e.type === 'rookiePromoted') {
        const r = this.world.rookies.find((u) => u.id === e.unit);
        if (r) {
          const p = this.toScreen(r.x, r.y);
          this.fx.floatText(p.x, p.y - 80 * MAP.tileScale, e.rank === 1 ? 'Veteran!' : 'Captain!', '#ffffff');
        }
      } else if (e.type === 'rally') {
        const k = this.world.players[0];
        const p = this.toScreen(k.x, k.y);
        this.fx.pulse(p.x, p.y, 0x7fb3e6);
        this.fx.floatText(p.x, p.y - 90 * MAP.tileScale, 'Rally!', '#b9d6f2');
      } else if (e.type === 'waveWarning') {
        this.hud.warn(e.wave, e.sides);
      }
    }
  }

  // ------------------------------------------------------------------ debug

  private exposeDebug() {
    const vd = ((window as unknown as { __vd: Record<string, unknown> }).__vd ??= {});
    vd.scene = this;
    vd.world = () => this.world;
    vd.step = (n: number) => this.step(n);
    vd.setInput = (s: InputState | null) => {
      this.override = s;
    };
    vd.restart = (seed?: number) => this.restart(seed);
    vd.overlays = debugState.overlays;
    vd.choose = (i: number) => {
      this.world.chooseUpgrade(i);
      this.handleEvents();
      this.syncUi();
    };
    vd.stats = () => ({
      seed: this.params.seed,
      time: +this.world.time.toFixed(2),
      wave: this.world.wave,
      kills: this.world.kills,
      monsters: this.world.monsters.filter((m) => m.state !== 'dead').length,
      hp: this.world.players[0]?.hp,
      status: this.world.status,
      buildings: `${this.world.standingBuildings()}/${this.world.buildings.length}`,
      stars: this.world.stars,
      level: this.world.progression.level,
      choosing: this.world.choosing,
      rookies: this.world.rookies.filter((r) => r.state !== 'dead').map((r) => `${r.kind}:${r.rank}`).join(','),
      zoom: +this.cameras.main.zoom.toFixed(3),
      charPx: Math.round(80 * (this.charScale('knight') * sheetMeta(this, 'knight').pixelsPerUnit / 120) * this.cameras.main.zoom),
      device: this.input2.activeDevice,
      cells: this.world.map.ground.reduce((a, g) => a + (g ? 1 : 0), 0),
    });
  }
}

/** Every texture key the map needs. */
function tileKeys(map: TownMap): Set<string> {
  const keys = new Set(['st:grass_center_N', 'st:grass_path_E', 'st:grass_path_N', 'st:grass_pathCrossing_N']);
  for (const b of map.buildings) for (const bl of b.blocks) keys.add(bl.tile);
  for (const d of map.decor) keys.add(d.tile);
  for (const r of RUBBLE_TILES) keys.add(r);
  return keys;
}

