// Render-side motion cues worked out from sim state alone (no three.js here, so they are unit
// tested): dust trails behind dashing units and the shape of the knight's sword/spear slash.

import { MONSTERS, type MonsterKind } from '../data/monsters';
import type { Mods } from '../data/upgrades';
import type { WeaponDef } from '../data/weapons';
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

/** One puff of dash dust: where it starts, the way it drifts (unit vector) and its size multiplier. */
export interface DustPuff {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  size: number;
}

interface Trail {
  x: number;
  y: number;
  /** Distance travelled since the last puff. */
  carry: number;
}

/**
 * Lays dust behind dashing units, one puff every DUST_SPACING travelled, so the trail looks the
 * same at any frame rate or dash speed. A unit's trail starts fresh with each dash.
 */
export class DustTrails {
  private readonly trails = new Map<number, Trail>();
  private readonly puff: DustPuff = { x: 0, z: 0, dirX: 0, dirZ: 0, size: 1 };

  /** Units currently leaving a trail. */
  get tracked(): number {
    return this.trails.size;
  }

  /** `emit` gets a reused object: copy it if you keep it. */
  update(units: Iterable<Unit>, emit: (p: DustPuff) => void) {
    const seen = new Set<number>();
    for (const u of units) {
      const size = dashSize(u);
      if (size <= 0) continue;
      seen.add(u.id);
      const t = this.trails.get(u.id);
      const dx = t ? u.x - t.x : 0;
      const dy = t ? u.y - t.y : 0;
      const d = Math.hypot(dx, dy);
      if (!t || d > TELEPORT) {
        // Kick-off: a puff where the dash starts.
        this.trails.set(u.id, { x: u.x, y: u.y, carry: 0 });
        this.emitAt(emit, u.x, u.y, -u.facing.x, -u.facing.y, size);
        continue;
      }
      if (d <= 0) continue;
      const ux = dx / d;
      const uy = dy / d;
      // Puffs fall at fixed distances along this frame's path.
      let along = DUST_SPACING - t.carry;
      while (along <= d + 1e-9) {
        this.emitAt(emit, t.x + ux * along, t.y + uy * along, -ux, -uy, size);
        along += DUST_SPACING;
      }
      t.carry = d - (along - DUST_SPACING);
      t.x = u.x;
      t.y = u.y;
    }
    for (const id of this.trails.keys()) if (!seen.has(id)) this.trails.delete(id);
  }

  private emitAt(emit: (p: DustPuff) => void, x: number, z: number, dirX: number, dirZ: number, size: number) {
    const p = this.puff;
    p.x = x;
    p.z = z;
    p.dirX = dirX;
    p.dirZ = dirZ;
    p.size = size;
    emit(p);
  }
}

/** The sweep a sword or spear swing covers (null for weapons that don't sweep). Mirrors sim/knight weaponHit. */
export function slashShape(wd: WeaponDef, km: Mods['knight']): { reach: number; halfArc: number } | null {
  if (wd.style !== 'arc') return null;
  return { reach: wd.range * km.rangeMul, halfArc: Math.min(Math.PI, wd.arc * km.arcMul) };
}
