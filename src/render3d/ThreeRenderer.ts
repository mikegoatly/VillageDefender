// Renderer implementation that draws the world in real time with three.js and the Kenney models:
// units, town (role buildings, damage states, auras), effects, labels and debug overlays.

import * as THREE from 'three';
import { BUILDING, MAP } from '../data/balance';
import { BOSS, MONSTERS, type MonsterKind } from '../data/monsters';
import { ROLES, type RoleKind } from '../data/roles';
import type { Renderer, RendererStats } from '../game/Renderer';
import { ISO_HX } from '../sim/iso';
import { slamShape, spinRadius, swingShape } from '../sim/knight';
import { friendlyById, monsterById } from '../sim/queries';
import type { Vec2 } from '../sim/types';
import { norm } from '../sim/units';
import type { SimEvent, Unit, World } from '../sim/world';
import type { OverlayName } from '../ui/DebugPanel';
import type { ModelLibrary } from './assets';
import { CAMERA_DIR, ELEVATION, fitView } from './camera';
import { DebugOverlay3D } from './DebugOverlay3D';
import { isThrust } from './characters';
import { Effects, SLASH } from './Effects';
import { Labels } from './Labels';
import { DustTrails, SpacedTrails, sparkNormal, type DustEmit } from './motionFx';
import { armyGear, knightGear, townFort, type KnightGear } from './upgradeFx';
import { KnightVisuals } from './KnightVisuals';
import { TownVisuals } from './TownVisuals';
import { Particles } from './Particles';
import type { Stage } from './Stage';
import { TownView } from './TownView';
import { FrostView } from './FrostView';
import { TrapView } from './TrapView';
import { CHAR_HEIGHT, CHAR_SCALE, HALO_ROOKIE, UnitBatches } from './UnitBatches';

const MAX_GEMS = 1024;
/** Label heights above the ground (world units). */
const HEAD = { knight: 1.5, rookie: 1.35, monster: 1.1, villager: 1.25 };
const BAR_COLORS = { good: '#8cc152', hurt: '#f0ad4e', bad: '#d9534f' };
const hpColor = (frac: number) => (frac > BUILDING.damagedAt ? BAR_COLORS.good : frac > 0.25 ? BAR_COLORS.hurt : BAR_COLORS.bad);
/** Dash dust per town theme: sandy on grass, grey on graveyard soil, powder on snow. */
const DASH_DUST = { meadow: 0xc9b29b, graveyard: 0x8f8a80, frost: 0xf0f6fb };
const HIT_SPARK = 0xfff0c0;
/** Progress bar over a villager building a trap. */
const TRAP_BAR = '#e8a45a';
/** Top-rank embers. */
const EMBER = 0xff9a3c;
/** Top-rank and per-rank weapon flourishes: embers along a slash edge, slam dust/cracks/embers, flail embers. */
const FLAIR = {
  edgeEmbers: { count: 9, size: 0.06, life: 0.5, rise: 0.8 },
  slamDust: 6,
  cracks: 3,
  slamEmbers: 10,
  spinEmbers: { count: 6, size: 0.05, life: 0.45, speed: 2 },
};
/** Height of the flail's spinning head. */
const SPIN_Y = 0.35;
/** Motes behind a thrown axe: height, spacing, and size and life at rank 0 (they grow with the glow). */
const AXE_TRAIL = { y: 0.55, spacing: 0.12, size: 0.05, life: 0.18 };
/** Ground direction towards the camera, so hit sparks come out of the near side of a body. */
const CAMERA_GROUND = norm({ x: CAMERA_DIR.x, y: CAMERA_DIR.z });

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
  /** Live particles (puffs and sparks). */
  particles: number;
}

export class ThreeRenderer implements Renderer {
  private readonly root = new THREE.Group();
  private readonly town: TownView;
  private readonly units: UnitBatches;
  private readonly particles = new Particles();
  private readonly trails = new DustTrails();
  private readonly axeTrails = new SpacedTrails(AXE_TRAIL.spacing);
  /** How the knight and his weapon look (ranks and upgrades), refreshed every frame. */
  private gear: KnightGear;
  /** Seeds each slam's crack pattern. */
  private cracks = 0;
  private readonly dustColor: number;
  private readonly effects: Effects;
  private readonly knight: KnightVisuals;
  private readonly townFx: TownVisuals;
  private readonly traps = new TrapView();
  private readonly frost: FrostView;
  private readonly labels: Labels;
  private debug: DebugOverlay3D | null = null;
  private readonly gems: THREE.InstancedMesh;
  private readonly gemM = new THREE.Matrix4();
  private readonly gemQ = new THREE.Quaternion();
  private readonly gemV = new THREE.Vector3();
  private readonly gemS = new THREE.Vector3();
  private readonly handlers: ((g: Vec2) => void)[] = [];
  private clock = 0;
  private lastPerf: RenderPerf = { renderMs: 0, calls: 0, triangles: 0, units: 0, particles: 0 };

  constructor(private readonly stage: Stage, library: ModelLibrary, world: World, opts: ThreeRendererOptions) {
    const theme = world.map.theme ?? 'meadow';
    stage.setTheme(theme);
    this.dustColor = DASH_DUST[theme];
    this.gear = knightGear(world);
    stage.setView(fitView(world.map));
    this.town = new TownView(library, world.map, this.particles);
    this.units = new UnitBatches(library, { silhouettes: opts.silhouettes });
    this.effects = new Effects(library);
    this.frost = new FrostView(library);
    this.knight = new KnightVisuals(this.particles, this.effects, this.dustColor);
    this.townFx = new TownVisuals(this.particles);
    this.labels = new Labels(stage, stage.canvas.parentElement!);
    // Faceted sapphire, as in the sprite renderer.
    this.gems = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.1),
      new THREE.MeshLambertMaterial({ color: 0x4aa3ff, emissive: 0x16304d, flatShading: true }),
      MAX_GEMS,
    );
    this.gems.frustumCulled = false;
    this.gems.count = 0;
    this.root.add(this.town.root, this.units.root, this.effects.root, this.traps.root, this.frost.root, this.gems, this.particles.root);
    stage.scene.add(this.root);
    stage.canvas.addEventListener('pointerdown', this.onPointerDown);
  }

  sync(world: World, dt: number) {
    const t0 = performance.now();
    this.clock += dt;
    const gear = (this.gear = knightGear(world));
    this.units.sync(world, dt, gear, armyGear(world), this.knight.sync(world, dt, gear));
    this.town.sync(world.buildings, dt, townFort(world));
    this.syncDust(world);
    this.townFx.sync(world, dt);
    this.particles.update(dt);
    this.effects.update(dt, world.projectiles);
    this.traps.sync(world.traps);
    this.frost.sync(world, dt);
    this.syncFlail(world);
    this.syncAxeTrails(world);
    this.syncGems(world);
    this.syncLabels(world);
    this.labels.layout();
    const draw = this.stage.render(dt);
    this.lastPerf = { renderMs: performance.now() - t0, calls: draw.calls, triangles: draw.triangles, units: this.units.size, particles: this.particles.live };
  }

  /** Game-feel effects: flashes, damage numbers, shakes, telegraphs, floating text. */
  onEvent(world: World, e: SimEvent) {
    this.townFx.onEvent(world, e);
    this.frost.onEvent(world, e);
    switch (e.type) {
      case 'hit': {
        this.units.flash(e.unit, 0.08);
        const m = monsterById(world, e.unit);
        if (!m) return;
        const scale = MONSTERS[m.kind as MonsterKind].scale;
        this.labels.damageNumber(e.x, HEAD.monster * scale, e.y, e.damage, e.damage >= 20);
        this.hitSparks(world, e.by, m, scale, e.damage);
        if (e.by === world.players[0]?.id) this.knight.onKnightHit(world, m, scale);
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
        this.swingFx(world);
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
      case 'freezeWarn':
        this.effects.telegraph(e.x, e.y, e.radius, e.time);
        return;
      case 'freeze':
        this.effects.shockwave(e.x, e.y, e.radius, 0x9fd8ff);
        this.particles.burst(e.x, 0.4, e.y, 12, 0xdff4ff, 0.3, 1.6, 1);
        return;
      case 'iceStomp':
        this.particles.burst(e.x, 0.2, e.y, 16, 0xe8f6ff, 0.35, 2, 1.2);
        return;
      case 'monsterSplit':
        this.particles.burst(e.x, 0.5, e.y, 6, 0xbfe8ff, 0.25, 1.6, 1);
        return;
      case 'monstersHealed':
        this.effects.pulse(e.x, e.y, 0x7fe0a0, e.radius);
        for (const id of e.healed) {
          const m = monsterById(world, id);
          if (m) this.particles.burst(m.x, 0.6, m.y, 3, 0x7fe0a0, 0.2, 1, 0.8);
        }
        return;
      case 'kegPlanted':
        this.particles.burst(e.x, 0.2, e.y, 5, 0xc9b29b, 0.25, 1, 0.8);
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
      case 'trapCalled':
        this.labels.floatText(e.x, HEAD.knight, e.y, 'Trap!', '#e8a45a');
        return;
      case 'trapSet':
        this.effects.shockwave(e.x, e.y, e.radius, 0xe8a45a);
        this.particles.burst(e.x, 0.1, e.y, 8, 0x8a6a48, 0.3, 1.2, 1);
        return;
      case 'trapPulse':
        this.particles.burst(e.x, 0.15, e.y, 3, 0xe8a45a, 0.25, 1.4, 0.8);
        return;
      case 'trapSpent':
        this.effects.shockwave(e.x, e.y, e.radius * 0.8, 0x8f8a80);
        this.particles.burst(e.x, 0.15, e.y, 10, 0x8f8a80, 0.3, 1.4, 1);
        return;
      case 'trapRunnerDown':
        this.particles.burst(e.x, 0.3, e.y, 8, 0xd9534f, 0.3, 1.4, 1);
        this.labels.floatText(e.x, HEAD.rookie, e.y, 'Villager down!', '#f0a0a0');
        return;
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
    this.traps.dispose();
    this.frost.dispose();
    this.debug?.dispose();
    this.labels.destroy();
    this.gems.geometry.dispose();
    (this.gems.material as THREE.Material).dispose();
    this.gems.dispose();
  }

  private syncFlail(world: World) {
    const k = world.players[0];
    const spinning = world.weapon === 'flail' && k && k.state === 'attack';
    this.effects.spinRing(spinning ? k.x : null, k?.y ?? 0, spinRadius(world.weaponDef, world.progression.mods.knight));
  }

  /** A fading streak behind each thrown axe, longer and brighter with the weapon's rank. */
  private syncAxeTrails(world: World) {
    this.axeTrails.begin();
    if (world.weapon === 'axes') {
      for (const p of world.projectiles) if (p.kind === 'axe') this.axeTrails.add(p.id, p.x, p.y, 0, 0, 1, this.emitAxeTrail);
    }
    this.axeTrails.end();
  }

  private readonly emitAxeTrail: DustEmit = (x, z) => {
    const { glow, color, flourish } = this.gear.weapon;
    this.particles.mote(x, AXE_TRAIL.y, z, color, AXE_TRAIL.size * (1 + glow), AXE_TRAIL.life * (1 + glow * 2));
    if (flourish) this.particles.spark(x, AXE_TRAIL.y, z, 1, EMBER, 0.6);
  };

  /** Dust behind the dodging knight, lunging and fleeing monsters and a charging boss. */
  private syncDust(world: World) {
    this.trails.update([world.players, world.monsters], this.emitDust);
  }

  private readonly emitDust: DustEmit = (x, z, dirX, dirZ, size) => this.particles.dust(x, z, dirX, dirZ, this.dustColor, size);

  /** Sparks sprayed out of the near side of a struck monster; harder hits throw more. */
  private hitSparks(world: World, by: number, m: Unit, scale: number, damage: number) {
    const n = sparkNormal(m, friendlyById(world, by), CAMERA_GROUND);
    const byKnight = by === world.players[0]?.id;
    // Sharpened Blade: the knight's hits throw up to twice as many, faster.
    const blade = byKnight ? this.gear.blade : 0;
    const count = Math.round(Math.min(10, 4 + Math.floor(damage / 6)) * (1 + blade));
    const out = m.radius * 1.2;
    const color = byKnight && world.weaponRank > 0 ? this.gear.weapon.color : HIT_SPARK;
    this.particles.spark(m.x + n.x * out, 0.5 * scale, m.y + n.y * out, count, color, 3 * (1 + blade * 0.4), n.x * 0.7, n.y * 0.7);
  }

  /** The knight's swing or slam, drawn to its real size and dressed for the weapon's rank. */
  private swingFx(world: World) {
    const k = world.players[0];
    if (!k) return;
    const wd = world.weaponDef;
    const km = world.progression.mods.knight;
    if (wd.style === 'arc') this.slashFx(world, k, wd.hitTime, swingShape(wd, km));
    else if (wd.style === 'area') this.slamFx(k, wd.hitTime, slamShape(wd, km), world.weaponRank);
    else if (wd.style === 'spin') this.spinFx(k, spinRadius(wd, km), world.weaponRank);
  }

  /** Sword slash or spear thrust; ranked, a glint at the blade's point; top rank, embers along the edge. */
  private slashFx(world: World, k: Unit, hitTime: number, { reach, halfArc }: { reach: number; halfArc: number }) {
    const wfx = this.gear.weapon;
    const rank = world.weaponRank;
    const thrust = isThrust(world.weapon);
    this.effects.later(Math.max(0, hitTime - SLASH.sweep), () => {
      if (k.state === 'dead') return;
      if (thrust) this.effects.thrust(k.x, k.y, k.facing.x, k.facing.y, reach, halfArc, wfx.color);
      else this.effects.slash(k.x, k.y, k.facing.x, k.facing.y, reach, halfArc, wfx.color);
      this.knight.onSlash(world, k, reach, halfArc, wfx.color, thrust);
      const fa = Math.atan2(k.facing.y, k.facing.x);
      if (rank > 0) this.glint(k.x + Math.cos(fa) * reach, k.y + Math.sin(fa) * reach, wfx.color);
      if (!wfx.flourish) return;
      const { count, size, life, rise } = FLAIR.edgeEmbers;
      for (let n = 0; n < count; n++) {
        const a = fa - halfArc + (2 * halfArc * n) / (count - 1);
        this.particles.mote(k.x + Math.cos(a) * reach, SLASH.y, k.y + Math.sin(a) * reach, EMBER, size, life, 0, rise, 0);
      }
    });
  }

  /** Warhammer: shockwave, dust and cracks where the slam lands (more with rank), timed with the hit. */
  private slamFx(k: Unit, hitTime: number, { reach, radius }: { reach: number; radius: number }, rank: number) {
    const wfx = this.gear.weapon;
    const x = k.x + k.facing.x * reach;
    const y = k.y + k.facing.y * reach;
    this.effects.later(hitTime, () => {
      this.effects.shockwave(x, y, radius, rank > 0 ? wfx.color : undefined);
      this.particles.burst(x, 0.1, y, FLAIR.slamDust + rank * 2, this.dustColor, 0.18, 1.6, 0.8);
      this.effects.crack(x, y, radius, FLAIR.cracks + rank * 2, ++this.cracks);
      if (wfx.flourish) this.particles.spark(x, 0.15, y, FLAIR.slamEmbers, EMBER, 2.6);
    });
  }

  /** Flail: sparks off the spinning head each pulse (more with rank); top rank sheds circling embers. */
  private spinFx(k: Unit, r: number, rank: number) {
    const wfx = this.gear.weapon;
    const n = 1 + rank;
    for (let s = 0; s < n; s++) {
      const a = this.clock * 12 + (s * Math.PI * 2) / n;
      this.particles.spark(k.x + Math.cos(a) * r, SPIN_Y, k.y + Math.sin(a) * r, 2, wfx.color, 1.6, Math.cos(a) * 0.5, Math.sin(a) * 0.5);
    }
    if (!wfx.flourish) return;
    const { count, size, life, speed } = FLAIR.spinEmbers;
    for (let s = 0; s < count; s++) {
      const a = (s * Math.PI * 2) / count + this.clock;
      // Tangential drift so the embers carry on round the knight.
      this.particles.mote(k.x + Math.cos(a) * r, SPIN_Y, k.y + Math.sin(a) * r, EMBER, size, life, -Math.sin(a) * speed, 0.2, Math.cos(a) * speed);
    }
  }

  /** A quick star of light at a point (a ranked blade's tip). */
  private glint(x: number, z: number, color: number) {
    this.particles.mote(x, SLASH.y, z, 0xffffff, 0.09, 0.18);
    for (let n = 0; n < 3; n++) this.particles.mote(x, SLASH.y, z, color, 0.05, 0.3, (n - 1) * 0.8, 0.6, (1 - n) * 0.5);
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

  /** Building and rookie HP bars (once hurt), role icons, rookie rank chevrons. */
  private syncLabels(world: World) {
    for (const b of world.buildings) {
      if (b.ruined) continue;
      const top = this.town.topOf(b.id);
      const frac = b.hp / b.maxHp;
      if (frac < 1) this.labels.bar(`bar${b.id}`, top.x, top.y, top.z, frac, hpColor(frac));
      if (b.role) this.labels.badge(`role${b.id}`, top.x, top.y + 0.35, top.z, ROLES[b.role].icon, '#3b2418', 0.3, '#f3e3d0');
    }
    for (const r of world.trapRunners) {
      if (r.setLeft !== null) this.labels.bar(`trap${r.id}`, r.x, HEAD.villager, r.y, 1 - r.setLeft / r.setTotal, TRAP_BAR);
    }
    for (const r of world.rookies) {
      if (r.state === 'dead') continue;
      const frac = r.hp / r.maxHp;
      if (frac < 1) this.labels.bar(`hp${r.id}`, r.x, HEAD.rookie, r.y, frac, hpColor(frac));
      if (r.rank <= 0) continue;
      this.labels.badge(`rank${r.id}`, r.x, HEAD.rookie * (1 + 0.06 * r.rank), r.y, r.rank === 1 ? '▲' : '▲▲', r.rank === 2 ? '#ffffff' : '#ffd75e', 0.3);
    }
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    const g = this.stage.groundAt(e.clientX, e.clientY);
    if (g) for (const h of this.handlers) h(g);
  };
}
