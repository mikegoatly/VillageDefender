// Renderer implementation that draws the world in real time with three.js and the Kenney models.
// Units, town (role buildings, damage states, auras), smoke and gems. Combat effects and debug
// overlays are still no-ops here (phase 4 of docs/PORT_3D_PLAN.md).

import * as THREE from 'three';
import { ISO_HX } from '../sim/iso';
import { MAP } from '../data/balance';
import type { RoleKind } from '../data/roles';
import type { Renderer, RendererStats } from '../game/Renderer';
import type { Vec2 } from '../sim/types';
import type { SimEvent, World } from '../sim/world';
import type { OverlayName } from '../ui/DebugPanel';
import type { ModelLibrary } from './assets';
import { ELEVATION, fitView } from './camera';
import { Particles } from './Particles';
import type { Stage } from './Stage';
import { TownView } from './TownView';
import { CHAR_HEIGHT, CHAR_SCALE, UnitBatches } from './UnitBatches';

const MAX_GEMS = 1024;

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
  private readonly gems: THREE.InstancedMesh;
  private readonly gemM = new THREE.Matrix4();
  private readonly handlers: ((g: Vec2) => void)[] = [];
  private clock = 0;
  private lastPerf: RenderPerf = { renderMs: 0, calls: 0, triangles: 0, units: 0 };

  constructor(private readonly stage: Stage, library: ModelLibrary, world: World, opts: ThreeRendererOptions) {
    stage.setView(fitView(world.map));
    this.town = new TownView(library, world.map, this.particles);
    this.units = new UnitBatches(library, { silhouettes: opts.silhouettes });
    this.gems = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0x4fe0a0 }), MAX_GEMS);
    this.gems.frustumCulled = false;
    this.gems.count = 0;
    this.root.add(this.town.root, this.units.root, this.gems, this.particles.mesh);
    stage.scene.add(this.root);
    stage.canvas.addEventListener('pointerdown', this.onPointerDown);
  }

  sync(world: World, dt: number) {
    const t0 = performance.now();
    this.clock += dt;
    this.units.sync(world, dt);
    this.town.sync(world.buildings);
    this.particles.update(dt);
    this.syncGems(world);
    const draw = this.stage.render();
    this.lastPerf = { renderMs: performance.now() - t0, calls: draw.calls, triangles: draw.triangles, units: this.units.size };
  }

  onEvent(_world: World, _e: SimEvent) {
    // Phase 4: hit flashes, damage numbers, shakes, telegraphs, floating text.
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

  updateDebugOverlay(_world: World, _overlays: Record<OverlayName, boolean>) {
    // Phase 4: flow fields, hitboxes, ranges, labels.
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
    this.gems.geometry.dispose();
    (this.gems.material as THREE.Material).dispose();
    this.gems.dispose();
  }

  private syncGems(world: World) {
    const n = Math.min(world.gems.length, MAX_GEMS);
    const t = this.clock;
    for (let k = 0; k < n; k++) {
      const g = world.gems[k];
      this.gemM.makeRotationY(t * 3 + g.id).setPosition(g.x, 0.18 + Math.sin(t * 4 + g.id) * 0.04, g.y);
      this.gems.setMatrixAt(k, this.gemM);
    }
    this.gems.count = n;
    this.gems.instanceMatrix.needsUpdate = true;
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    const g = this.stage.groundAt(e.clientX, e.clientY);
    if (g) for (const h of this.handlers) h(g);
  };
}
