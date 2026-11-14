// Milestone 0 look test: baked Mini-rig characters on two candidate town art styles.
//   ?look=sketch (default)  Sketch Town 2D tiles
//   ?look=kit               Fantasy Town Kit buildings baked through tools/bake
// Press L to toggle. Not game code; delete once the art direction is decided.
//
// Sketch-only map-size params:
//   ?shape=diamond|rect  diamond = classic iso square map; rect = cells cut to a screen-aligned
//                        rectangle so a landscape screen is filled edge to edge
//   ?n=11                diamond: cells per side. rect: diamonds across the full width
//   ?ts=1                tile display scale (characters keep their own scale, ?cs)
//   ?aspect=1.9          rect: width / height of the map
//   ?seed=1              building layout seed

import * as Phaser from 'phaser';
import { createCharacterAnims, directionFor, preloadSheets, sheetMeta } from '../render/sheets';

type Look = 'sketch' | 'kit';

const CHARACTERS = ['knight', 'rookie', 'orc', 'zombie', 'skeleton', 'ghost'];
const STATICS = ['ft-house-stone', 'ft-house-wood', 'ft-tree'];
/** Kit look always uses a small diamond map. */
const KIT_GRID = 11;

/** Ground-plane → screen projection at tile scale 1. One grid cell = one ground unit. */
const PROJ: Record<Look, { hx: number; hy: number }> = {
  // Sketch Town Tiled map: 232x110 diamonds.
  sketch: { hx: 116, hy: 55 },
  // Fantasy Town Kit at 120 px/unit, elevation asin(110/232): 1 unit = 169.7x80.5 diamond.
  kit: { hx: 84.85, hy: 40.24 },
};

/** Sketch tiles: height of one stacked block level, and where the top-face centre is in the image. */
const SKETCH_LEVEL = 106;
const SKETCH_ORIGIN = { x: 128 / 256, y: 185 / 352 };

interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  sheet: string;
  x: number; // ground units
  y: number;
  state: 'walk' | 'attack' | 'idle';
  timer: number;
  speed: number;
  angle?: number; // knight/rookie circling
}

export class LookTestScene extends Phaser.Scene {
  private look: Look = 'sketch';
  private walkers: Walker[] = [];
  /** Positioned objects used to fit the camera. (No container: containers ignore child depth.) */
  private placed: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  /** Display scale for characters relative to the town (?cs=1.4). Readability over realism. */
  private charScale = 1;
  private tileScale = 1;
  private shape: 'diamond' | 'rect' = 'diamond';
  private n = 11;
  private aspect = 1.9;
  private seed = 1;
  /** Walkable map cells, keyed `${i},${j}`. */
  private cells = new Set<string>();
  private edgeCells: [number, number][] = [];
  private centre = 5;
  private rng!: Phaser.Math.RandomDataGenerator;

  constructor() {
    super('LookTest');
  }

  init(data: { look?: Look }) {
    const q = new URLSearchParams(location.search);
    this.look = data.look ?? (q.get('look') === 'kit' ? 'kit' : 'sketch');
    this.charScale = Number(q.get('cs') ?? 1.4);
    this.shape = q.get('shape') === 'diamond' ? 'diamond' : 'rect';
    this.n = Number(q.get('n') ?? (this.shape === 'rect' ? 22 : 11));
    this.tileScale = this.look === 'sketch' ? Number(q.get('ts') ?? (this.shape === 'rect' ? 0.55 : 1)) : 1;
    this.aspect = Number(q.get('aspect') ?? 1.9);
    this.seed = Number(q.get('seed') ?? 1);
    this.walkers = [];
  }

  preload() {
    preloadSheets(this, [...CHARACTERS, ...STATICS]);
    const tiles = [
      'grass_center', 'grass_path', 'grass_pathCrossing', 'dirt_center',
      'building_door', 'building_window', 'building_windows', 'building_doorBeige', 'building_windowsBeige',
      'roof_gableBrown', 'roof_gableGreen', 'roof_pointPurple', 'roof_roundedBeige', 'roof_churchBrown',
      'castle_tower', 'tree_single', 'tree_multiple', 'rocks_grass', 'structure_arch',
    ];
    for (const t of tiles) {
      for (const r of ['N', 'E', 'S', 'W']) {
        this.load.image(`st:${t}_${r}`, `assets/tiles/sketch-town/${t}_${r}.png`);
      }
    }
    for (const t of ['well', 'fence_wood', 'tree_pine']) {
      for (const r of ['N', 'E']) {
        this.load.image(`ste:${t}_${r}`, `assets/tiles/sketch-town-expansion/${t}_${r}.png`);
      }
    }
  }

  create() {
    for (const c of CHARACTERS) {
      if (!this.anims.exists(`${c}:idle:S`)) createCharacterAnims(this, c);
    }
    this.placed = [];
    this.rng = new Phaser.Math.RandomDataGenerator([String(this.seed)]);
    this.buildCells();
    if (this.look === 'sketch') this.buildSketchTown();
    else this.buildKitTown();
    this.spawnCharacters();

    // HUD text lives in the DOM so camera zoom doesn't scale it.
    const hud = document.getElementById('hud');
    if (hud) {
      hud.textContent = `Look test: ${this.look === 'sketch' ? 'Sketch Town tiles' : 'Fantasy Town Kit (baked 3D)'} · L / tap here to toggle`;
      hud.onclick = () => this.toggleLook();
    }
    this.input.keyboard?.on('keydown-L', () => this.toggleLook());

    this.scale.on('resize', this.fitCamera, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.fitCamera, this));
    this.fitCamera();

    (window as unknown as { __vd: Record<string, unknown> }).__vd.stats = () => ({
      cells: this.cells.size,
      monsters: this.walkers.length - 3,
      zoom: this.cameras.main.zoom,
      // knight sprite height on screen in CSS px (baked ~80 px tall at scale 1)
      charPx: Math.round(80 * this.charScale * this.cameras.main.zoom),
      tilePx: Math.round(232 * this.tileScale * this.cameras.main.zoom),
    });
  }

  private toggleLook() {
    this.scene.restart({ look: this.look === 'sketch' ? 'kit' : 'sketch' });
  }

  // ---------- projection ----------

  private toScreen(gx: number, gy: number) {
    const p = PROJ[this.look];
    const s = this.tileScale;
    return { x: (gx - gy) * p.hx * s, y: (gx + gy) * p.hy * s };
  }

  private hasCell(i: number, j: number) {
    return this.cells.has(`${i},${j}`);
  }

  /** Builds the set of map cells for the chosen shape, plus its border cells (spawn edges). */
  private buildCells() {
    this.cells.clear();
    const p = PROJ[this.look];
    if (this.look === 'kit' || this.shape === 'diamond') {
      const g = this.look === 'kit' ? KIT_GRID : this.n;
      this.centre = (g - 1) / 2;
      for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) this.cells.add(`${i},${j}`);
    } else {
      // Keep cells whose screen position falls inside a width:height = aspect rectangle.
      const halfW = this.n * p.hx;
      const halfH = halfW / this.aspect;
      const m = Math.ceil(halfW / p.hx + halfH / p.hy) + 2;
      this.centre = m;
      for (let i = 0; i <= 2 * m; i++) {
        for (let j = 0; j <= 2 * m; j++) {
          const x = (i - j) * p.hx;
          const y = (i + j - 2 * m) * p.hy;
          if (Math.abs(x) <= halfW - p.hx * 0.5 && Math.abs(y) <= halfH - p.hy * 0.5) this.cells.add(`${i},${j}`);
        }
      }
    }
    this.edgeCells = [];
    for (const key of this.cells) {
      const [i, j] = key.split(',').map(Number);
      if (!this.hasCell(i + 1, j) || !this.hasCell(i - 1, j) || !this.hasCell(i, j + 1) || !this.hasCell(i, j - 1)) {
        this.edgeCells.push([i, j]);
      }
    }
  }

  // ---------- Sketch town ----------

  private sketchTile(key: string, i: number, j: number, level: number, depthBias = 0) {
    const { x, y } = this.toScreen(i, j);
    const img = this.add
      .image(x, y - level * SKETCH_LEVEL * this.tileScale, key)
      .setOrigin(SKETCH_ORIGIN.x, SKETCH_ORIGIN.y)
      .setScale(this.tileScale);
    // Ground is always under everything; stacked blocks sort by their footprint's screen y.
    img.setDepth(level === 0 ? -1e5 + y : y + depthBias + level * 0.01);
    this.placed.push(img);
    return img;
  }

  private buildSketchTown() {
    if (this.shape === 'diamond' && this.n === 11) {
      this.buildSketchTownFixed();
      return;
    }
    const c = this.centre;
    // Ground, with the two main roads crossing at the centre.
    for (const key of this.cells) {
      const [i, j] = key.split(',').map(Number);
      let tile = 'st:grass_center_N';
      if (i === c && j === c) tile = 'st:grass_pathCrossing_N';
      else if (i === c) tile = 'st:grass_path_E';
      else if (j === c) tile = 'st:grass_path_N';
      this.sketchTile(tile, i, j, 0);
    }

    // Town occupies the inner part of the map; the rest is open field for the swarm.
    const p = PROJ.sketch;
    let maxX = 0;
    let maxY = 0;
    for (const [i, j] of this.edgeCells) {
      maxX = Math.max(maxX, Math.abs((i - j) * p.hx));
      maxY = Math.max(maxY, Math.abs((i + j - 2 * c) * p.hy));
    }
    const inTown = (i: number, j: number) =>
      Math.abs((i - j) * p.hx) < maxX * 0.5 && Math.abs((i + j - 2 * c) * p.hy) < maxY * 0.5;

    // Building slots on a 4-cell lattice: 2x2 footprint + 2-cell lanes. Main roads stay clear.
    const used = new Set<string>();
    const reach = Math.ceil(c / 4) + 1;
    for (let a = -reach; a < reach; a++) {
      for (let b = -reach; b < reach; b++) {
        const i0 = c + a * 4 + 1;
        const j0 = c + b * 4 + 1;
        const fp = [[i0, j0], [i0 + 1, j0], [i0, j0 + 1], [i0 + 1, j0 + 1]];
        if (!fp.every(([i, j]) => this.hasCell(i, j) && inTown(i, j))) continue;
        if (a === -1 && b === -1) {
          this.sketchTile('ste:well_N', i0 + 1, j0 + 1, 1); // plaza by the crossroads
          continue;
        }
        if (this.rng.frac() < 0.2) continue; // open squares
        this.placeBuilding(i0, j0, used);
      }
    }

    // Scattered trees and rocks outside the town.
    for (const key of this.cells) {
      const [i, j] = key.split(',').map(Number);
      if (inTown(i, j) || i === c || j === c || used.has(key)) continue;
      const r = this.rng.frac();
      if (r < 0.035) this.sketchTile(this.rng.pick(['st:tree_single_N', 'st:tree_multiple_E', 'ste:tree_pine_N', 'ste:tree_pine_E']), i, j, 1);
      else if (r < 0.045) this.sketchTile('st:rocks_grass_N', i, j, 1);
    }
  }

  /** Random building inside the 2x2 slot at (i0, j0): cottage, long house, hall or tower. */
  private placeBuilding(i0: number, j0: number, used: Set<string>) {
    const roofs = ['roof_gableBrown', 'roof_gableGreen', 'roof_gablePurple', 'roof_pointPurple', 'roof_roundedBeige', 'roof_churchBrown', 'roof_slantBrown'];
    const beige = this.rng.frac() < 0.4 ? 'Beige' : '';
    const roof = this.rng.pick(roofs);
    const kind = this.rng.weightedPick(['cottage', 'long', 'long', 'hall', 'tower']);
    let footprint: [number, number][];
    let levels = 1;
    if (kind === 'cottage') {
      footprint = [[i0 + this.rng.between(0, 1), j0 + this.rng.between(0, 1)]];
    } else if (kind === 'long') {
      footprint = this.rng.frac() < 0.5 ? [[i0, j0], [i0 + 1, j0]] : [[i0, j0], [i0, j0 + 1]];
      levels = this.rng.between(1, 2);
    } else if (kind === 'hall') {
      footprint = [[i0, j0], [i0 + 1, j0], [i0, j0 + 1], [i0 + 1, j0 + 1]];
    } else {
      footprint = [[i0 + 1, j0 + 1]];
    }
    for (const [i, j] of footprint) {
      used.add(`${i},${j}`);
      if (kind === 'tower') {
        this.sketchTile('st:castle_wall_S', i, j, 1);
        this.sketchTile('st:castle_tower_S', i, j, 2);
        continue;
      }
      for (let l = 1; l <= levels; l++) {
        const front = i === Math.max(...footprint.map((f) => f[0])) && l === 1;
        const wall = front ? this.rng.pick(['building_door', 'building_doorWindows']) : this.rng.pick(['building_window', 'building_windows']);
        this.sketchTile(`st:${wall}${beige}_S`, i, j, l);
      }
      this.sketchTile(`st:${roof}_S`, i, j, levels + 1);
    }
  }

  /** Original hand-placed 11x11 layout (?shape=diamond&n=11). */
  private buildSketchTownFixed() {
    const c = this.centre;
    for (const key of this.cells) {
      const [i, j] = key.split(',').map(Number);
      let tile = 'st:grass_center_N';
      if (i === c && j === c) tile = 'st:grass_pathCrossing_N';
      else if (i === c) tile = 'st:grass_path_E';
      else if (j === c) tile = 'st:grass_path_N';
      this.sketchTile(tile, i, j, 0);
    }

    // [i, j, wall tile, roof tile, rotation]
    const blocks: [number, number, string, string, string][] = [
      [3, 3, 'building_door', 'roof_gableBrown', 'S'],
      [3, 2, 'building_window', 'roof_gableBrown', 'S'],
      [7, 3, 'building_doorBeige', 'roof_pointPurple', 'S'],
      [3, 7, 'building_windows', 'roof_roundedBeige', 'E'],
      [7, 7, 'building_door', 'roof_churchBrown', 'S'],
      [8, 7, 'building_windowsBeige', 'roof_gableGreen', 'S'],
      [7, 8, 'building_windows', 'roof_gableGreen', 'E'],
    ];
    for (const [i, j, wall, roof, r] of blocks) {
      this.sketchTile(`st:${wall}_${r}`, i, j, 1);
      this.sketchTile(`st:${roof}_${r}`, i, j, 2);
    }
    this.sketchTile('st:castle_tower_S', 2, 8, 1);
    this.sketchTile('ste:well_N', 4, 4, 1);

    const trees: [number, number, string][] = [
      [1, 1, 'st:tree_multiple_N'], [9, 1, 'st:tree_single_N'], [1, 9, 'st:tree_single_E'],
      [9, 9, 'st:tree_multiple_E'], [0, 4, 'ste:tree_pine_N'], [10, 6, 'ste:tree_pine_E'],
      [2, 5, 'st:rocks_grass_N'], [8, 5, 'st:tree_single_N'],
    ];
    for (const [i, j, k] of trees) this.sketchTile(k, i, j, 1);
  }

  // ---------- Kit town ----------

  private buildKitTown() {
    const g = this.add.graphics();
    g.setDepth(-2e5);
    
    const p = PROJ.kit;
    for (let i = 0; i < KIT_GRID; i++) {
      for (let j = 0; j < KIT_GRID; j++) {
        const { x, y } = this.toScreen(i, j);
        const path = i === this.centre || j === this.centre;
        const shade = (i + j) % 2 === 0;
        g.fillStyle(path ? (shade ? 0xd9b48a : 0xd2ab80) : shade ? 0x8cc152 : 0x84b94b);
        g.lineStyle(2, path ? 0xb48a60 : 0x6f9a3e, 0.6);
        const pts = [
          new Phaser.Math.Vector2(x, y - p.hy),
          new Phaser.Math.Vector2(x + p.hx, y),
          new Phaser.Math.Vector2(x, y + p.hy),
          new Phaser.Math.Vector2(x - p.hx, y),
        ];
        g.fillPoints(pts, true);
        g.strokePoints(pts, true);
      }
    }

    const place = (sheet: string, gx: number, gy: number) => {
      const meta = sheetMeta(this, sheet);
      const { x, y } = this.toScreen(gx, gy);
      const img = this.add.image(x, y, sheet, 0).setOrigin(meta.pivotX / meta.frameWidth, meta.pivotY / meta.frameHeight);
      img.setDepth(y);
      this.placed.push(img);
    };
    // 2x2 houses are centred between four cells.
    place('ft-house-stone', 2.5, 2.5);
    place('ft-house-stone', 7.5, 7.5);
    place('ft-house-wood', 7, 3);
    place('ft-house-wood', 3, 7);
    place('ft-house-wood', 8, 2);
    place('ft-house-wood', 2, 8);
    for (const [i, j] of [[1, 1], [9, 1], [1, 9], [9, 9], [0, 4], [10, 6], [8, 5], [4, 9]]) place('ft-tree', i, j);
  }

  // ---------- characters ----------

  private spawnCharacters() {
    const c = this.centre;
    this.addWalker('knight', c + 0.6, c + 0.6, 1.4, 0);
    this.addWalker('rookie', c - 1.2, c + 1.8, 1.1, Math.PI);
    this.addWalker('rookie', c + 2, c - 1, 1.1, Math.PI / 2);
    const count = Math.max(10, Math.round(this.edgeCells.length / 3));
    const kinds = ['orc', 'zombie', 'skeleton', 'ghost'];
    const monsters = Array.from({ length: count }, (_, k) => kinds[k % kinds.length]);
    monsters.forEach((m, k) => {
      const w = this.addWalker(m, 0, 0, 0.7 + (k % 3) * 0.15);
      this.respawnAtEdge(w, k / monsters.length);
    });
  }

  private addWalker(sheet: string, x: number, y: number, speed: number, angle?: number): Walker {
    const meta = sheetMeta(this, sheet);
    const sprite = this.add
      .sprite(0, 0, sheet, 0)
      .setOrigin(meta.pivotX / meta.frameWidth, meta.pivotY / meta.frameHeight)
      .setScale(this.charScale);
    
    const w: Walker = { sprite, sheet, x, y, state: 'walk', timer: 0, speed, angle };
    this.walkers.push(w);
    return w;
  }

  private respawnAtEdge(w: Walker, t: number) {
    // Random point on the map border, spread by t so the first frame looks populated.
    const [ei, ej] = this.edgeCells[Math.floor(t * this.edgeCells.length) % this.edgeCells.length];
    w.x = ei;
    w.y = ej;
    // Start somewhere along the approach so not everyone arrives at once.
    const k = Phaser.Math.FloatBetween(0, 0.5);
    w.x += (this.centre - w.x) * k;
    w.y += (this.centre - w.y) * k;
    w.state = 'walk';
  }

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    const rScale = Math.max(1, this.edgeCells.length / 40) ** 0.5;
    const invScale = 1 / this.tileScale;
    for (const w of this.walkers) {
      let dx = 0;
      let dy = 0;
      if (w.angle !== undefined) {
        // Friendly units circle the village centre.
        w.angle += (w.speed / 3) * dt * invScale;
        const r = (w.sheet === 'knight' ? 1.6 : 2.6) * rScale;
        const tx = this.centre + Math.cos(w.angle) * r;
        const ty = this.centre + Math.sin(w.angle) * r;
        dx = tx - w.x;
        dy = ty - w.y;
        w.x = tx;
        w.y = ty;
        this.play(w, 'walk', dx, dy);
      } else if (w.state === 'walk') {
        dx = this.centre - w.x;
        dy = this.centre - w.y;
        const d = Math.hypot(dx, dy);
        if (d < 2.6 * rScale) {
          w.state = 'attack';
          w.timer = 2.5;
        } else {
          w.x += (dx / d) * w.speed * dt * invScale;
          w.y += (dy / d) * w.speed * dt * invScale;
        }
        this.play(w, w.state, dx, dy);
      } else {
        w.timer -= dt;
        if (!w.sprite.anims.isPlaying) w.sprite.anims.restart();
        if (w.timer <= 0) this.respawnAtEdge(w, Math.random());
      }
      const s = this.toScreen(w.x, w.y);
      w.sprite.setPosition(s.x, s.y).setDepth(s.y + 0.5);
    }
  }

  private play(w: Walker, anim: string, gdx: number, gdy: number) {
    // Facing is chosen from the screen-space direction of ground movement.
    const p = PROJ[this.look];
    const dir = directionFor((gdx - gdy) * p.hx, (gdx + gdy) * p.hy);
    const key = `${w.sheet}:${anim}:${dir}`;
    if (w.sprite.anims.currentAnim?.key !== key) w.sprite.play(key);
  }

  private fitCamera() {
    const b = new Phaser.Geom.Rectangle();
    let first = true;
    for (const o of this.placed) {
      const ob = o.getBounds();
      if (first) b.setTo(ob.x, ob.y, ob.width, ob.height);
      else Phaser.Geom.Rectangle.Union(b, ob, b);
      first = false;
    }
    // Ground corners matter for the kit look, whose ground is a Graphics object.
    for (const [i, j] of this.edgeCells) {
      const s = this.toScreen(i, j);
      Phaser.Geom.Rectangle.Union(b, new Phaser.Geom.Rectangle(s.x, s.y, 1, 1), b);
    }
    const cam = this.cameras.main;
    const margin = 0.96;
    const zoom = Math.min((this.scale.width / b.width) * margin, (this.scale.height / b.height) * margin);
    cam.setZoom(zoom);
    cam.centerOn(b.centerX, b.centerY);
  }
}
