// Renderer implementation that draws the world in real time with three.js and the Kenney models:
// units, town (role buildings, damage states, auras), effects, labels and debug overlays.

import * as THREE from 'three';
import { BUILDING, MAP } from '../data/balance';
import { BOSS, MONSTERS, type MonsterKind } from '../data/monsters';
import { ROLES, type RoleKind } from '../data/roles';
import { WEAPONS } from '../data/weapons';
import type { Renderer, RendererStats } from '../game/Renderer';
import { ISO_HX } from '../sim/iso';
import type { Vec2 } from '../sim/types';
import type { SimEvent, World } from '../sim/world';
import type { OverlayName } from '../ui/DebugPanel';
import type { ModelLibrary } from './assets';
import { ELEVATION, fitView } from './camera';
import { DebugOverlay3D } from './DebugOverlay3D';
import { Effects } from './Effects';
import { Labels } from './Labels';
import { Particles } from './Particles';
import type { Stage } from './Stage';
import { TownView } from './TownView';
import { CHAR_HEIGHT, CHAR_SCALE, HALO_ROOKIE, UnitBatches } from './UnitBatches';

const MAX_GEMS = 1024;
/** Label heights above the ground (world units). */
const HEAD = { knight: 1.5, rookie: 1.35, monster: 1.1 };
const BAR_COLORS = { good: '#8cc152', hurt: '#f0ad4e', bad: '#d9534f' };

export interface ThreeRendererOptions {
  silhouettes: boolean;
}

/** Per-frame cost, for the perf overlay and tools/measure3d.mjs. */
export interface RenderPerf {
  /** CPU ms spent turning sim state into GPU buffers and submitting the frame. */
  renderMs: number;
  calls: number;
  triangles: number;
  units: number;
}

export class ThreeRenderer implements Renderer {
  private readonly root = new THREE.Group();
  private readonly town: TownView;
  private readonly units: UnitBatches;
  private readonly particles = new Particles();
  private readonly effects: Effects;
  private readonly labels: Labels;
  private debug: DebugOverlay3D | null = null;
  private readonly gems: THREE.InstancedMesh;
  private readonly gemM = new THREE.Matrix4();
  private readonly gemQ = new THREE.Quaternion();
  private readonly gemV = new THREE.Vector3();
  private readonly gemS = new THREE.Vector3();
  private readonly handlers: ((g: Vec2) => void)[] = [];
  private clock = 0;
  private lastPerf: RenderPerf = { renderMs: 0, calls: 0, triangles: 0, units: 0 };

  constructor(private readonly stage: Stage, library: ModelLibrary, world: World, opts: ThreeRendererOptions) {
    stage.setTheme(world.map.theme ?? 'meadow');
    stage.setView(fitView(world.map));
    this.town = new TownView(library, world.map, this.particles);
    this.units = new UnitBatches(library, { silhouettes: opts.silhouettes });
    this.effects = new Effects(library);
    this.labels = new Labels(stage, stage.canvas.parentElement!);
    // Faceted sapphire, as in the sprite renderer.
    this.gems = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.1),
      new THREE.MeshLambertMaterial({ color: 0x4aa3ff, emissive: 0x16304d, flatShading: true }),
      MAX_GEMS,
    );
    this.gems.frustumCulled = false;
    this.gems.count = 0;
    this.root.add(this.town.root, this.units.root, this.effects.root, this.gems, this.particles.mesh);
    stage.scene.add(this.root);
    stage.canvas.addEventListener('pointerdown', this.onPointerDown);
  }

  sync(world: World, dt: number) {
    const t0 = performance.now();
    this.clock += dt;
    this.units.sync(world, dt);
    this.town.sync(world.buildings, dt);
    this.particles.update(dt);
    this.effects.update(dt, world.projectiles);
    this.syncFlail(world);
    this.syncGems(world);
    this.syncLabels(world);
    this.labels.layout();
    const draw = this.stage.render(dt);
    this.lastPerf = { renderMs: performance.now() - t0, calls: draw.calls, triangles: draw.triangles, units: this.units.size };
  }

  /** Game-feel effects: flashes, damage numbers, shakes, telegraphs, floating text. */
  onEvent(world: World, e: SimEvent) {
    switch (e.type) {
      case 'hit': {
        this.units.flash(e.unit, 0.08);
        const m = world.monsters.find((u) => u.id === e.unit);
        if (m) this.labels.damageNumber(e.x, HEAD.monster * MONSTERS[m.kind as MonsterKind].scale, e.y, e.damage, e.damage >= 20);
        return;
      }
      case 'death': {
        const m = world.monsters.find((u) => u.id === e.unit);
        if (m?.kind === 'warlord') this.stage.shake(600, 0.012);
        else if (m?.kind === 'brute') this.stage.shake(160, 0.005);
        return;
      }
      case 'swing':
        // Flail: restart the swing on every damage pulse so it keeps spinning.
        if (e.weapon === 'flail') this.units.restartAnim(e.unit);
        if (e.weapon === 'hammer') {
          // Shockwave where the slam lands, timed with the hit.
          const k = world.players[0];
          const r = WEAPONS.hammer.range * world.progression.mods.knight.rangeMul;
          const x = k.x + k.facing.x * r;
          const y = k.y + k.facing.y * r;
          this.effects.later(WEAPONS.hammer.hitTime, () => this.effects.shockwave(x, y, WEAPONS.hammer.arc));
        }
        return;
      case 'bossSpawn':
        this.stage.shake(500, 0.008);
        return;
      case 'bossSlamWarn':
      case 'bossBoulderWarn':
        this.effects.telegraph(e.x, e.y, e.radius, e.time);
        return;
      case 'bossBoulder':
        this.effects.shockwave(e.x, e.y, e.radius, 0x8a7a6a);
        this.particles.burst(e.x, 0.3, e.y, 12, 0x9a8a7a, 0.3, 1.8, 1);
        this.stage.shake(260, 0.01);
        return;
      case 'bossSlam':
        this.effects.shockwave(e.x, e.y, e.radius, 0xb8322c);
        this.stage.shake(320, 0.012);
        return;
      case 'wailWarn':
        this.effects.telegraph(e.x, e.y, e.radius, e.time);
        return;
      case 'wail':
        this.effects.shockwave(e.x, e.y, e.radius, 0xb58cff);
        this.particles.burst(e.x, 0.5, e.y, 10, 0xd6b0ff, 0.3, 1.6, 1);
        this.stage.shake(180, 0.006);
        return;
      case 'monsterSurfaced':
        this.particles.burst(e.x, 0.1, e.y, 12, 0x7a5a3a, 0.3, 1.4, 1);
        return;
      case 'fuseLit':
        this.effects.telegraph(e.x, e.y, e.radius, e.time);
        return;
      case 'explosion':
        this.effects.shockwave(e.x, e.y, e.radius, 0xff8a2a);
        this.particles.burst(e.x, 0.3, e.y, 14, 0xffa040, 0.3, 2, 1);
        this.stage.shake(220, 0.008);
        return;
      case 'monsterRaised':
        this.particles.burst(e.x, 0.2, e.y, 10, 0x9a5cff, 0.3, 1.5, 1.5);
        return;
      case 'bossCharge': {
        const boss = world.monsters.find((u) => u.id === e.unit);
        const b = world.buildings[e.building];
        if (!boss || !b) return;
        const cx = b.cells.reduce((a, [i]) => a + i, 0) / b.cells.length;
        const cy = b.cells.reduce((a, [, j]) => a + j, 0) / b.cells.length;
        this.effects.chargeLine(boss.x, boss.y, cx, cy, BOSS.charge.windup);
        return;
      }
      case 'playerHurt':
        this.stage.shake(120, 0.004);
        this.units.flash(e.unit, 0.1);
        return;
      case 'buildingHit':
        this.town.hit(e.building);
        return;
      case 'buildingDestroyed':
        // TownView swaps in the ruin and its dust when it sees the building's state.
        this.stage.shake(220, 0.006);
        return;
      case 'levelUp': {
        const k = world.players[0];
        this.labels.floatText(k.x, HEAD.knight, k.y, `Level ${e.level}!`);
        return;
      }
      case 'rookieJoined': {
        const r = world.rookies.find((u) => u.id === e.unit);
        if (r) this.labels.floatText(r.x, HEAD.rookie, r.y, e.kind === 'archer' ? 'Archer joins!' : 'Swordsman joins!', '#b9d6f2');
        return;
      }
      case 'rookiePromoted': {
        const r = world.rookies.find((u) => u.id === e.unit);
        if (r) this.labels.floatText(r.x, HEAD.rookie, r.y, e.rank === 1 ? 'Veteran!' : 'Captain!', '#ffffff');
        return;
      }
      case 'rally': {
        const k = world.players[0];
        this.effects.pulse(k.x, k.y, HALO_ROOKIE[0]);
        this.labels.floatText(k.x, HEAD.knight, k.y, 'Rally!', '#b9d6f2');
        return;
      }
      default:
    }
  }

  onGroundPointerDown(handler: (ground: Vec2) => void) {
    this.handlers.push(handler);
  }

  setPlanning(on: boolean) {
    this.town.setPlanning(on);
  }

  highlightBuilding(id: number) {
    this.town.highlight(id);
  }

  setRole(_id: number, _role: RoleKind | null) {
    // Nothing to do: TownView rebuilds a building when its role in the sim changes.
  }

  knightWeaponChanged() {
    // Nothing to do: the knight's batch is chosen from world.weapon every frame.
  }

  updateDebugOverlay(world: World, overlays: Record<OverlayName, boolean>) {
    if (!this.debug) {
      this.debug = new DebugOverlay3D(this.labels);
      this.root.add(this.debug.lines);
    }
    this.debug.update(world, overlays);
  }

  screenOf(ground: Vec2): Vec2 {
    return this.stage.toScreen(ground.x, 0, ground.y);
  }

  stats(): RendererStats {
    const ppu = this.stage.pixelsPerUnit();
    // Comparable with the sprite renderer: a cell is 2·ISO_HX·tileScale px wide there, √2·ppu here.
    return { zoom: (Math.SQRT2 * ppu) / (2 * ISO_HX * MAP.tileScale), charPx: CHAR_HEIGHT * CHAR_SCALE * ppu * Math.cos(ELEVATION) };
  }

  perf(): RenderPerf {
    return this.lastPerf;
  }

  destroy() {
    this.stage.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeFromParent();
    this.town.dispose();
    this.units.dispose();
    this.particles.dispose();
    this.effects.dispose();
    this.debug?.dispose();
    this.labels.destroy();
    this.gems.geometry.dispose();
    (this.gems.material as THREE.Material).dispose();
    this.gems.dispose();
  }

  private syncFlail(world: World) {
    const k = world.players[0];
    const spinning = world.weapon === 'flail' && k && k.state === 'attack';
    this.effects.spinRing(spinning ? k.x : null, k?.y ?? 0, WEAPONS.flail.range * world.progression.mods.knight.rangeMul);
  }

  private syncGems(world: World) {
    const n = Math.min(world.gems.length, MAX_GEMS);
    const t = this.clock;
    for (let k = 0; k < n; k++) {
      const g = world.gems[k];
      const bob = g.magnet ? 0 : Math.sin(t * 4 + g.id) * 0.04;
      this.gemQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t * 3 + g.id);
      this.gemM.compose(this.gemV.set(g.x, 0.18 + bob, g.y), this.gemQ, this.gemS.setScalar(g.value >= 5 ? 1.5 : g.value >= 2 ? 1.2 : 1));
      this.gems.setMatrixAt(k, this.gemM);
    }
    this.gems.count = n;
    this.gems.instanceMatrix.needsUpdate = true;
  }

  /** Building HP bars and role icons, rookie rank chevrons. */
  private syncLabels(world: World) {
    for (const b of world.buildings) {
      if (b.ruined) continue;
      const top = this.town.topOf(b.id);
      const frac = b.hp / b.maxHp;
      if (frac < 1) {
        const color = frac > BUILDING.damagedAt ? BAR_COLORS.good : frac > 0.25 ? BAR_COLORS.hurt : BAR_COLORS.bad;
        this.labels.bar(`bar${b.id}`, top.x, top.y, top.z, frac, color);
      }
      if (b.role) this.labels.badge(`role${b.id}`, top.x, top.y + 0.35, top.z, ROLES[b.role].icon, '#3b2418', 0.3, '#f3e3d0');
    }
    for (const r of world.rookies) {
      if (r.rank <= 0 || r.state === 'dead') continue;
      this.labels.badge(`rank${r.id}`, r.x, HEAD.rookie * (1 + 0.06 * r.rank), r.y, r.rank === 1 ? '▲' : '▲▲', r.rank === 2 ? '#ffffff' : '#ffd75e', 0.3);
    }
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    const g = this.stage.groundAt(e.clientX, e.clientY);
    if (g) for (const h of this.handlers) h(g);
  };
}
