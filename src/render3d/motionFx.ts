// Render-side motion cues worked out from sim state alone (no three.js here, so they are unit
// tested): trails behind dashing units and flying things, and where hit sparks fly.

import { MONSTERS, type MonsterKind } from '../data/monsters';
import type { Vec2 } from '../sim/types';
import { norm } from '../sim/units';
import type { Unit } from '../sim/world';

/** Ground distance between dust puffs in a dash trail. */
export const DUST_SPACING = 0.22;
/** A jump further than this in one frame is a teleport (debug, respawn), not travel. */
const TELEPORT = 3;
/** A charging boss throws up more dust than his size alone suggests. */
const CHARGE_DUST = 1.6;

/** Size of the dust a unit kicks up while dashing (0 when it isn't dashing). */
export function dashSize(u: Pick<Unit, 'team' | 'kind' | 'state' | 'burstTime' | 'boss'>): number {
  if (u.state === 'dead') return 0;
  if (u.team === 'player') return u.kind === 'knight' && u.state === 'dodge' ? 1 : 0;
  const scale = MONSTERS[u.kind as MonsterKind].scale;
  if (u.boss?.ability === 'charging') return scale * CHARGE_DUST;
  return u.burstTime > 0 ? scale : 0;
}

/** Receives one puff: where it starts, the way it drifts (unit vector, back along the path) and its size multiplier. */
export type DustEmit = (x: number, z: number, dirX: number, dirZ: number, size: number) => void;

interface Trail {
  x: number;
  y: number;
  /** Distance travelled since the last puff. */
  carry: number;
  /** Last pass this thing was moving in (stale trails are dropped). */
  pass: number;
}

/**
 * Lays puffs behind moving things (by id), one every `spacing` travelled, so a trail looks the
 * same at any frame rate or speed. Call begin(), add() each thing that should leave a trail this
 * frame, then end(); a trail starts fresh after a frame without it.
 */
export class SpacedTrails {
  private readonly trails = new Map<number, Trail>();
  private pass = 0;

  constructor(private readonly spacing: number) {}

  /** Things currently leaving a trail. */
  get tracked(): number {
    return this.trails.size;
  }

  begin() {
    this.pass++;
  }

  /** (backX, backY) is the drift direction for the first puff, before there is a path. */
  add(id: number, x: number, y: number, backX: number, backY: number, size: number, emit: DustEmit) {
    const t = this.trails.get(id);
    const dx = t ? x - t.x : 0;
    const dy = t ? y - t.y : 0;
    const d = Math.hypot(dx, dy);
    if (!t || d > TELEPORT) {
      // Kick-off: a puff where the trail starts.
      this.trails.set(id, { x, y, carry: 0, pass: this.pass });
      emit(x, y, backX, backY, size);
      return;
    }
    t.pass = this.pass;
    if (d <= 0) return;
    const ux = dx / d;
    const uy = dy / d;
    // Puffs fall at fixed distances along this frame's path.
    let along = this.spacing - t.carry;
    while (along <= d + 1e-9) {
      emit(t.x + ux * along, t.y + uy * along, -ux, -uy, size);
      along += this.spacing;
    }
    t.carry = d - (along - this.spacing);
    t.x = x;
    t.y = y;
  }

  end() {
    if (this.trails.size === 0) return;
    for (const [id, t] of this.trails) if (t.pass !== this.pass) this.trails.delete(id);
  }
}

/** Dust behind dashing units (see dashSize). */
export class DustTrails {
  private readonly trails = new SpacedTrails(DUST_SPACING);

  /** Units currently leaving a trail. */
  get tracked(): number {
    return this.trails.tracked;
  }

  update(lists: readonly (readonly Unit[])[], emit: DustEmit) {
    this.trails.begin();
    for (const list of lists) {
      for (const u of list) {
        const size = dashSize(u);
        if (size > 0) this.trails.add(u.id, u.x, u.y, -u.facing.x, -u.facing.y, size, emit);
      }
    }
    this.trails.end();
  }
}

/**
 * Ground direction hit sparks leave a struck unit in: towards whoever hit it, leaning towards the
 * camera (`camera`, a ground unit vector) so they come out of the body's near side.
 */
export function sparkNormal(struck: Vec2, from: Vec2 | null, camera: Vec2): Vec2 {
  const toward = from ? norm({ x: from.x - struck.x, y: from.y - struck.y }) : camera;
  return norm({ x: toward.x + camera.x, y: toward.y + camera.y });
}
