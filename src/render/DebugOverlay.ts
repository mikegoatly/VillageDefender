// Debug overlays drawn over the map: flow fields, hitboxes, ranges, labels.
// One Graphics redrawn each frame (only what is enabled) plus pooled Text objects for labels.

import * as Phaser from 'phaser';
import { KNIGHT } from '../data/balance';
import { MONSTERS } from '../data/monsters';
import { ROOKIES, TOWN_ARROWS } from '../data/rookies';
import { isWalkable } from '../sim/map';
import type { Unit, World } from '../sim/world';
import type { OverlayName } from '../ui/DebugPanel';

type ToScreen = (gx: number, gy: number) => { x: number; y: number };

const DEPTH = 9.5e5;
const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export class DebugOverlay {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private used = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly toScreen: ToScreen) {
    this.g = scene.add.graphics().setDepth(DEPTH);
  }

  update(world: World, overlays: Record<OverlayName, boolean>): void {
    const { g } = this;
    g.clear();
    this.used = 0;
    if (overlays.flowKnight) this.flow(world, world.debugInfo().knightFlow, 0);
    if (overlays.flowBuildings) this.flow(world, world.debugInfo().buildingFlow, 1);
    if (overlays.hitboxes) this.hitboxes(world);
    if (overlays.ranges) this.ranges(world);
    if (overlays.labels) this.labels(world);
    for (let k = this.used; k < this.texts.length; k++) this.texts[k].setVisible(false);
  }

  destroy(): void {
    this.g.destroy();
    for (const t of this.texts) t.destroy();
    this.texts.length = 0;
  }

  // ------------------------------------------------------------ drawing helpers

  private circle(x: number, y: number, r: number, color: number, alpha: number, width = 1.5) {
    const { g } = this;
    g.lineStyle(width, color, alpha);
    g.beginPath();
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const p = this.toScreen(x + Math.cos(a) * r, y + Math.sin(a) * r);
      if (k === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.strokePath();
  }

  private cellOutline(i: number, j: number, color: number, alpha: number) {
    const { g } = this;
    g.lineStyle(1, color, alpha);
    g.beginPath();
    const c: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]];
    c.forEach(([di, dj], k) => {
      const p = this.toScreen(i + di, j + dj);
      if (k === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    });
    g.strokePath();
  }

  private text(x: number, y: number, s: string, color: string) {
    let t = this.texts[this.used];
    if (!t) {
      t = this.scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#fff', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5, 1).setDepth(DEPTH + 1);
      this.texts.push(t);
    }
    this.used++;
    t.setText(s).setColor(color).setPosition(x, y).setVisible(true);
  }

  // ------------------------------------------------------------ overlays

  private flow(world: World, dist: Float64Array, which: number) {
    const { g, toScreen } = this;
    const map = world.map;
    const n = map.size;
    let max = 1;
    for (let k = 0; k < dist.length; k++) if (Number.isFinite(dist[k]) && dist[k] > max) max = dist[k];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (!isWalkable(map, i, j)) continue;
        const d = dist[j * n + i];
        const c = toScreen(i, j);
        if (!Number.isFinite(d)) {
          g.lineStyle(1.5, 0x888888, 0.9);
          g.lineBetween(c.x - 5, c.y - 3, c.x + 5, c.y + 3);
          g.lineBetween(c.x - 5, c.y + 3, c.x + 5, c.y - 3);
          continue;
        }
        const t = Math.min(1, d / max);
        const color = Phaser.Display.Color.GetColor(Math.round(255 * t), Math.round(255 * (1 - t)), 40);
        let best = d;
        let tx = 0;
        let ty = 0;
        let found = false;
        for (const [di, dj] of DIRS) {
          if (di !== 0 && dj !== 0 && (!isWalkable(map, i + di, j) || !isWalkable(map, i, j + dj))) continue;
          const nd = isWalkable(map, i + di, j + dj) ? dist[(j + dj) * n + i + di] : Infinity;
          if (nd < best) {
            best = nd;
            tx = i + di;
            ty = j + dj;
            found = true;
          }
        }
        g.fillStyle(color, 0.9);
        if (!found) {
          g.fillCircle(c.x, c.y, 3 + which);
          continue;
        }
        const e = toScreen(tx, ty);
        const dx = e.x - c.x;
        const dy = e.y - c.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const half = 11;
        const x1 = c.x + ux * half;
        const y1 = c.y + uy * half * 0.9;
        g.lineStyle(1.5, color, 0.9);
        g.lineBetween(c.x - ux * half, c.y - uy * half, x1, y1);
        g.fillTriangle(x1 + ux * 4, y1 + uy * 4, x1 - uy * 3, y1 + ux * 3, x1 + uy * 3, y1 - ux * 3);
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
    for (const { u, color } of this.units(world)) this.circle(u.x, u.y, u.radius, color, 1);
    const map = world.map;
    for (let j = 0; j < map.size; j++) {
      for (let i = 0; i < map.size; i++) {
        if (map.ground[j * map.size + i] !== 0 && map.blocked[j * map.size + i] !== 0) this.cellOutline(i, j, 0xff8800, 0.6);
      }
    }
  }

  private ranges(world: World) {
    const mods = world.progression.mods;
    for (const k of world.players) {
      if (k.state === 'dead') continue;
      this.circle(k.x, k.y, KNIGHT.acquireRange * mods.knight.rangeMul, 0xffd23c, 0.5);
      this.circle(k.x, k.y, KNIGHT.attackRange * mods.knight.rangeMul + k.radius, 0xffffff, 0.7);
    }
    for (const r of world.rookies) {
      if (r.state === 'dead' || r.kind !== 'archer') continue;
      this.circle(r.x, r.y, ROOKIES.archer.range, 0x4aa3ff, 0.4);
    }
    for (const m of world.monsters) {
      if (m.state === 'dead' || m.kind !== 'zombie') continue;
      this.circle(m.x, m.y, MONSTERS.zombie.aggroRange, 0xff4040, 0.2, 1);
    }
    if (mods.town.arrowSlits > 0) {
      for (const b of world.buildings) {
        if (b.ruined) continue;
        let cx = 0;
        let cy = 0;
        for (const [i, j] of b.cells) { cx += i; cy += j; }
        this.circle(cx / b.cells.length, cy / b.cells.length, TOWN_ARROWS.range, 0x66dd66, 0.35);
      }
    }
  }

  private labels(world: World) {
    for (const { u } of this.units(world)) {
      const p = this.toScreen(u.x, u.y);
      let s: string;
      if (u.team === 'enemy') s = `${Math.ceil(u.hp)}/${u.maxHp} ${u.state}`;
      else if (u.kind === 'knight') s = `${Math.ceil(u.hp)}/${u.maxHp}`;
      else s = `r${u.rank} k${u.unitKills} ${Math.ceil(u.hp)}/${u.maxHp}`;
      this.text(p.x, p.y - 40, s, u.team === 'enemy' ? '#ff9a9a' : '#bfe0ff');
    }
    for (const b of world.buildings) {
      if (b.ruined) continue;
      let cx = 0;
      let cy = 0;
      for (const [i, j] of b.cells) { cx += i; cy += j; }
      const p = this.toScreen(cx / b.cells.length, cy / b.cells.length);
      this.text(p.x, p.y - 20, `#${b.id} ${Math.ceil(b.hp)}/${Math.ceil(b.maxHp)}`, '#ffe9a0');
    }
  }
}
