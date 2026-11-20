// Night towns (Lanternwick): darkness by wave, light sources, the light pool and lightning.

import { describe, expect, it } from 'vitest';
import {
  approach, LIGHT_POOL, LIGHTNING, lightningFlash, lightSources, LightSlots, nightLevel, pickLights, type LightSource,
} from '../../src/render3d/nightLights';
import { mapFromAscii } from '../helpers/mapBuilder';
import { aWorld } from '../helpers/worldBuilder';

const FIELD = [
  '..............',
  '.00.......11..',
  '.00.......11..',
  '..............',
  '..............',
  '..............',
  '.22...........',
  '..............',
];

/** A world on FIELD with lamp posts at `lamps`, the knight at (x, y). */
function litWorld(x = 7, y = 4, lamps: [number, number][] = []) {
  const map = mapFromAscii(FIELD);
  for (const [i, j] of lamps) map.decor.push({ i, j, kind: 'lamp', blocks: false });
  return aWorld().withTownMap(map).noRookies().withKnightAt(x, y).build();
}

const src = (key: string, x: number, z: number, kind: LightSource['kind'] = 'lamp'): LightSource => ({ key, kind, x, y: 1, z, radius: 3, color: 0xffffff });

describe('nightLevel', () => {
  it('is dusk until wave 1, deepens each wave, and is full night from wave 4', () => {
    expect([0, 1, 2, 3, 4, 7, 10].map(nightLevel)).toEqual([0, 0, 1 / 3, 2 / 3, 1, 1, 1]);
  });

  it('is eased towards, never snapped', () => {
    expect(approach(0, 1, 0.12, 1)).toBeCloseTo(0.12);
    expect(approach(0.95, 1, 0.12, 1)).toBe(1);
    expect(approach(1, 2 / 3, 0.12, 0.5)).toBeCloseTo(0.94);
  });
});

describe('lightSources', () => {
  it("lists the knight's lantern first, then every standing building's windows and every lamp post", () => {
    const { world, knight } = litWorld(7, 4, [[5, 5], [12, 7]]);
    const s = lightSources(world);
    expect(s[0]).toMatchObject({ kind: 'lantern', x: knight.x, z: knight.y });
    expect(s.filter((l) => l.kind === 'window')).toHaveLength(3);
    expect(s.filter((l) => l.kind === 'lamp').map((l) => [l.x, l.z])).toEqual([[5, 5], [12, 7]]);
    // The lantern reaches furthest.
    for (const l of s.slice(1)) expect(l.radius).toBeLessThan(s[0].radius);
  });

  it('a ruined building gives no light, and a fallen knight carries no lantern', () => {
    const { world, knight } = litWorld();
    world.buildings[1].ruined = true;
    knight.state = 'dead';
    const s = lightSources(world);
    expect(s.some((l) => l.kind === 'lantern')).toBe(false);
    expect(s.map((l) => l.key)).toEqual(['b0', 'b2']);
  });

  it("puts a building's light outside its camera-facing corner", () => {
    const { world } = litWorld();
    const b = lightSources(world).find((l) => l.key === 'b1')!;
    expect(b.x).toBeGreaterThan(11);
    expect(b.z).toBeGreaterThan(2);
  });
});

describe('pickLights', () => {
  const lantern = src('lantern', 50, 50, 'lantern');
  const near = [src('a', 1, 0), src('b', 2, 0), src('c', 3, 0), src('d', 4, 0)];

  it('always picks the lantern first, then the nearest to the centre', () => {
    const picked = pickLights([...near].reverse().concat(lantern), { x: 0, z: 0 }, 3);
    expect(picked.map((s) => s.key)).toEqual(['lantern', 'a', 'b']);
  });

  it('keeps one of the n for the lantern even while there is none', () => {
    expect(pickLights(near, { x: 0, z: 0 }, 3).map((s) => s.key)).toEqual(['a', 'b']);
  });

  it('favours sources that already hold a slot, so slots do not flicker between neighbours', () => {
    const close = [src('a', 1, 0), src('b', 2, 0), src('c', 2.2, 0)];
    expect(pickLights(close, { x: 0, z: 0 }, 3).map((s) => s.key)).toEqual(['a', 'b']);
    expect(pickLights(close, { x: 0, z: 0 }, 3, new Set(['c'])).map((s) => s.key)).toEqual(['a', 'c']);
  });
});

describe('LightSlots', () => {
  it('gives the lantern slot 0 and fades the nearest sources in', () => {
    const slots = new LightSlots(3, 4);
    const all = [src('lantern', 0, 0, 'lantern'), src('far', 9, 0), src('a', 1, 0), src('b', 2, 0)];
    slots.update(all, { x: 0, z: 0 }, 0.1);
    expect(slots.slots.map((s) => s.source?.key)).toEqual(['lantern', 'a', 'b']);
    expect(slots.weightOf('a')).toBe(0);
    for (let k = 0; k < 2; k++) slots.update(all, { x: 0, z: 0 }, 0.1);
    expect(slots.weightOf('lantern')).toBe(1);
    expect(slots.weightOf('a')).toBeCloseTo(0.8);
    expect(slots.weightOf('far')).toBe(0);
  });

  it('hands a slot to a newly near source only after the old one has faded out', () => {
    const slots = new LightSlots(2, 4);
    const sources = [src('a', 1, 0), src('b', 20, 0)];
    for (let k = 0; k < 5; k++) slots.update(sources, { x: 0, z: 0 }, 0.1);
    expect(slots.slots[1].source?.key).toBe('a');
    // The centre moves next to b: a fades out first...
    slots.update(sources, { x: 20, z: 0 }, 0.1);
    expect(slots.slots[1]).toMatchObject({ source: { key: 'a' } });
    expect(slots.weightOf('a')).toBeCloseTo(0.6);
    slots.update(sources, { x: 20, z: 0 }, 0.1);
    expect(slots.slots[1].source?.key).toBe('a');
    // ...then b takes the slot the moment it is free, and fades in.
    slots.update(sources, { x: 20, z: 0 }, 0.1);
    expect(slots.slots[1]).toMatchObject({ source: { key: 'b' }, weight: 0 });
    slots.update(sources, { x: 20, z: 0 }, 0.1);
    expect(slots.weightOf('b')).toBeCloseTo(0.4);
  });

  it('keeps a constant number of slots however many sources there are', () => {
    const slots = new LightSlots();
    const many = Array.from({ length: 40 }, (_, k) => src(`s${k}`, k, 0));
    slots.update(many, { x: 0, z: 0 }, 1);
    expect(slots.slots).toHaveLength(LIGHT_POOL);
    expect(slots.slots.slice(1).every((s) => s.source)).toBe(true);
    // No lantern: slot 0 stays empty rather than going to a lamp.
    expect(slots.slots[0].source).toBeNull();
  });

  it('follows a moving source (the walking knight)', () => {
    const { world, knight } = litWorld();
    const slots = new LightSlots(4);
    slots.update(lightSources(world), { x: knight.x, z: knight.y }, 0.1);
    knight.x += 2;
    slots.update(lightSources(world), { x: knight.x, z: knight.y }, 0.1);
    expect(slots.slots[0].source?.x).toBe(knight.x);
  });
});

describe('lightningFlash', () => {
  it('is a quick double flash, dark before and after', () => {
    expect(lightningFlash(-0.1)).toBe(0);
    expect(lightningFlash(0)).toBe(1);
    expect(lightningFlash(0.1)).toBeLessThan(0.2);
    expect(lightningFlash(0.12)).toBeGreaterThan(0.8);
    expect(lightningFlash(LIGHTNING.length)).toBe(0);
    expect(LIGHTNING.length).toBeLessThan(0.3);
  });
});
