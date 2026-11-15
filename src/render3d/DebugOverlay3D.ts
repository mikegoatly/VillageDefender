// Debug overlays for the 3D renderer: flow fields, hitboxes, ranges and labels. Same content as
// render/DebugOverlay.ts: one line mesh rebuilt each frame (only what is enabled) plus HTML labels.

import * as THREE from 'three';
import { KNIGHT } from '../data/balance';
import { MONSTERS } from '../data/monsters';
import { ROOKIES, TOWN_ARROWS } from '../data/rookies';
import { isWalkable } from '../sim/map';
import type { Unit, World } from '../sim/world';
import type { OverlayName } from '../ui/DebugPanel';
import type { Labels } from './Labels';

const MAX_SEGMENTS = 40000;
const Y = 0.08;
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class DebugOverlay3D {
  readonly lines: THREE.LineSegments;
  private readonly positions = new Float32Array(MAX_SEGMENTS * 6);
  private readonly colors = new Float32Array(MAX_SEGMENTS * 6);
  private n = 0;
  private readonly c = new THREE.Color();

  constructor(private readonly labels: Labels) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
  }

  update(world: World, overlays: Record<OverlayName, boolean>) {
    this.n = 0;
    if (overlays.flowKnight) this.flow(world, world.debugInfo().knightFlow, 0);
    if (overlays.flowBuildings) this.flow(world, world.debugInfo().buildingFlow, 0.04);
    if (overlays.hitboxes) this.hitboxes(world);
    if (overlays.ranges) this.ranges(world);
    if (overlays.labels) this.unitLabels(world);
    const g = this.lines.geometry;
    g.setDrawRange(0, this.n * 2);
    this.lines.visible = this.n > 0;
    // Upload only the segments in use (the buffer holds 40k; most frames draw none).
    if (this.n === 0) return;
    for (const name of ['position', 'color']) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * 6);
      a.needsUpdate = true;
    }
  }

  dispose() {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }

  // ------------------------------------------------------------ drawing helpers

  private seg(ax: number, az: number, bx: number, bz: number, color: number, lift = 0) {
    if (this.n >= MAX_SEGMENTS) return;
    const k = this.n++ * 6;
    this.positions.set([ax, Y + lift, az, bx, Y + lift, bz], k);
    this.c.setHex(color);
    this.colors.set([this.c.r, this.c.g, this.c.b, this.c.r, this.c.g, this.c.b], k);
  }

  private circle(x: number, z: number, r: number, color: number) {
    const steps = 24;
    for (let k = 0; k < steps; k++) {
      const a0 = (k / steps) * Math.PI * 2;
      const a1 = ((k + 1) / steps) * Math.PI * 2;
      this.seg(x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, color);
    }
  }

  private cellOutline(i: number, j: number, color: number) {
    const c: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    for (let k = 0; k < 4; k++) {
      const [a, b] = [c[k], c[(k + 1) % 4]];
      this.seg(i + a[0], j + a[1], i + b[0], j + b[1], color);
    }
  }

  // ------------------------------------------------------------ overlays

  private flow(world: World, dist: Float64Array, lift: number) {
    const map = world.map;
    const n = map.size;
    let max = 1;
    for (let k = 0; k < dist.length; k++) if (Number.isFinite(dist[k]) && dist[k] > max) max = dist[k];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (!isWalkable(map, i, j)) continue;
        const d = dist[j * n + i];
        if (!Number.isFinite(d)) {
          this.seg(i - 0.15, j - 0.15, i + 0.15, j + 0.15, 0x888888, lift);
          this.seg(i - 0.15, j + 0.15, i + 0.15, j - 0.15, 0x888888, lift);
          continue;
        }
        const t = Math.min(1, d / max);
        const color = this.c.setRGB(t, 1 - t, 40 / 255).getHex();
        let best = d;
        let ux = 0;
        let uz = 0;
        for (const [di, dj] of DIRS) {
          if (di !== 0 && dj !== 0 && (!isWalkable(map, i + di, j) || !isWalkable(map, i, j + dj))) continue;
          const nd = isWalkable(map, i + di, j + dj) ? dist[(j + dj) * n + i + di] : Infinity;
          if (nd < best) {
            best = nd;
            const len = Math.hypot(di, dj);
            ux = di / len;
            uz = dj / len;
          }
        }
        if (ux === 0 && uz === 0) {
          this.circle(i, j, 0.08, color);
          continue;
        }
        const h = 0.32;
        const tipX = i + ux * h, tipZ = j + uz * h;
        this.seg(i - ux * h, j - uz * h, tipX, tipZ, color, lift);
        // Arrow head.
        this.seg(tipX, tipZ, tipX - ux * 0.12 - uz * 0.08, tipZ - uz * 0.12 + ux * 0.08, color, lift);
        this.seg(tipX, tipZ, tipX - ux * 0.12 + uz * 0.08, tipZ - uz * 0.12 - ux * 0.08, color, lift);
      }
    }
  }

  private units(world: World): { u: Unit; color: number }[] {
    const out: { u: Unit; color: number }[] = [];
    for (const k of world.players) if (k.state !== 'dead') out.push({ u: k, color: 0xffd23c });
    for (const r of world.rookies) if (r.state !== 'dead') out.push({ u: r, color: 0x4aa3ff });
    for (const m of world.monsters) if (m.state !== 'dead') out.push({ u: m, color: 0xff4040 });
    return out;
  }

  private hitboxes(world: World) {
    for (const { u, color } of this.units(world)) this.circle(u.x, u.y, u.radius, color);
    const map = world.map;
    for (let j = 0; j < map.size; j++) {
      for (let i = 0; i < map.size; i++) {
        if (map.ground[j * map.size + i] !== 0 && map.blocked[j * map.size + i] !== 0) this.cellOutline(i, j, 0xff8800);
      }
    }
  }

  private ranges(world: World) {
    const mods = world.progression.mods;
    for (const k of world.players) {
      if (k.state === 'dead') continue;
      this.circle(k.x, k.y, KNIGHT.acquireRange * mods.knight.rangeMul, 0xffd23c);
      this.circle(k.x, k.y, KNIGHT.attackRange * mods.knight.rangeMul + k.radius, 0xffffff);
    }
    for (const r of world.rookies) if (r.state !== 'dead' && r.kind === 'archer') this.circle(r.x, r.y, ROOKIES.archer.range, 0x4aa3ff);
    for (const m of world.monsters) if (m.state !== 'dead' && m.kind === 'zombie') this.circle(m.x, m.y, MONSTERS.zombie.aggroRange, 0x993333);
    if (mods.town.arrowSlits > 0) {
      for (const b of world.buildings) {
        if (b.ruined) continue;
        const cx = b.cells.reduce((a, [i]) => a + i, 0) / b.cells.length;
        const cz = b.cells.reduce((a, [, j]) => a + j, 0) / b.cells.length;
        this.circle(cx, cz, TOWN_ARROWS.range, 0x66dd66);
      }
    }
  }

  private unitLabels(world: World) {
    for (const { u } of this.units(world)) {
      let s: string;
      if (u.team === 'enemy') s = `${Math.ceil(u.hp)}/${u.maxHp} ${u.state}`;
      else if (u.kind === 'knight') s = `${Math.ceil(u.hp)}/${u.maxHp}`;
      else s = `r${u.rank} k${u.unitKills} ${Math.ceil(u.hp)}/${u.maxHp}`;
      this.labels.badge(`dbg-u${u.id}`, u.x, 1.6, u.y, s, u.team === 'enemy' ? '#ff9a9a' : '#bfe0ff', 0.16);
    }
    for (const b of world.buildings) {
      if (b.ruined) continue;
      const cx = b.cells.reduce((a, [i]) => a + i, 0) / b.cells.length;
      const cz = b.cells.reduce((a, [, j]) => a + j, 0) / b.cells.length;
      this.labels.badge(`dbg-b${b.id}`, cx, 0.4, cz, `#${b.id} ${Math.ceil(b.hp)}/${Math.ceil(b.maxHp)}`, '#ffe9a0', 0.16);
    }
  }
}
