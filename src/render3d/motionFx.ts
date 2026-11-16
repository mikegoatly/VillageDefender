// Render-side motion cues worked out from sim state alone (no three.js here, so they are unit
// tested): dust trails behind dashing units, the knight's slash and where hit sparks fly.

import { MONSTERS, type MonsterKind } from '../data/monsters';
import type { Mods } from '../data/upgrades';
import type { WeaponDef } from '../data/weapons';
import { swingShape } from '../sim/knight';
import type { Vec2 } from '../sim/types';
import { norm } from '../sim/units';
import type { Unit } from '../sim/world';

/** Ground distance between dust puffs in a dash trail. */
export const DUST_SPACING = 0.22;
/** A jump further than this in one frame is a teleport (debug, respawn), not a dash. */
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

/** Receives one puff of dash dust: where it starts, the way it drifts (unit vector) and its size multiplier. */
export type DustEmit = (x: number, z: number, dirX: number, dirZ: number, size: number) => void;

interface Trail {
  x: number;
  y: number;
  /** Distance travelled since the last puff. */
  carry: number;
  /** Last update this unit was dashing in (stale trails are dropped). */
  frame: number;
}

/**
 * Lays dust behind dashing units, one puff every DUST_SPACING travelled, so the trail looks the
 * same at any frame rate or dash speed. A unit's trail starts fresh with each dash.
 */
export class DustTrails {
  private readonly trails = new Map<number, Trail>();
  private frame = 0;

  /** Units currently leaving a trail. */
  get tracked(): number {
    return this.trails.size;
  }

  update(lists: readonly (readonly Unit[])[], emit: DustEmit) {
    const frame = ++this.frame;
    for (const list of lists) {
      for (const u of list) {
        const size = dashSize(u);
        if (size > 0) this.step(u, size, frame, emit);
      }
    }
    if (this.trails.size === 0) return;
    for (const [id, t] of this.trails) if (t.frame !== frame) this.trails.delete(id);
  }

  private step(u: Unit, size: number, frame: number, emit: DustEmit) {
    const t = this.trails.get(u.id);
    const dx = t ? u.x - t.x : 0;
    const dy = t ? u.y - t.y : 0;
    const d = Math.hypot(dx, dy);
    if (!t || d > TELEPORT) {
      // Kick-off: a puff where the dash starts.
      this.trails.set(u.id, { x: u.x, y: u.y, carry: 0, frame });
      emit(u.x, u.y, -u.facing.x, -u.facing.y, size);
      return;
    }
    t.frame = frame;
    if (d <= 0) return;
    const ux = dx / d;
    const uy = dy / d;
    // Puffs fall at fixed distances along this frame's path.
    let along = DUST_SPACING - t.carry;
    while (along <= d + 1e-9) {
      emit(t.x + ux * along, t.y + uy * along, -ux, -uy, size);
      along += DUST_SPACING;
    }
    t.carry = d - (along - DUST_SPACING);
    t.x = u.x;
    t.y = u.y;
  }
}

/** The sweep a sword or spear swing covers (null for weapons that don't sweep). */
export function slashShape(wd: WeaponDef, km: Mods['knight']): { reach: number; halfArc: number } | null {
  return wd.style === 'arc' ? swingShape(wd, km) : null;
}

/**
 * Ground direction hit sparks leave a struck unit in: towards whoever hit it, leaning towards the
 * camera (`camera`, a ground unit vector) so they come out of the body's near side.
 */
export function sparkNormal(struck: Vec2, from: Vec2 | null, camera: Vec2): Vec2 {
  const toward = from ? norm({ x: from.x - struck.x, y: from.y - struck.y }) : camera;
  return norm({ x: toward.x + camera.x, y: toward.y + camera.y });
}
