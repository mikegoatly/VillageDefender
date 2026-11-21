// Night towns (Lanternwick): darkness by wave, light sources, the warm-light map and lightning.

import { describe, expect, it } from 'vitest';
import {
  approach, DUSK_LIGHT, duskLight, LIGHT_REACH, LIGHT_SHINE, LIGHTNING, lightningFlash, lightSources, linearRgb, nightLevel,
  pointFalloff, staticLightSources, upsampleInto, WARM_MAP, warmMapValues, type LightSource,
} from '../../src/render3d/nightLights';
import { NIGHT } from '../../src/data/night';
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
  for (const [i, j] of lamps) map.decor.push({ i, j, kind: 'lamp', blocks: false, lit: true });
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
  it("lists the knight's lantern first, then every standing building's windows and every lit lamp post", () => {
    const { world, knight } = litWorld(7, 4, [[5, 5], [12, 7]]);
    const s = lightSources(world);
    expect(s[0]).toMatchObject({ kind: 'lantern', x: knight.x, z: knight.y });
    expect(s.filter((l) => l.kind === 'window')).toHaveLength(3);
    expect(s.filter((l) => l.kind === 'lamp').map((l) => [l.x, l.z])).toEqual([[5, 5], [12, 7]]);
    // The lantern reaches furthest, and every reach is the sim's lit radius.
    for (const l of s.slice(1)) expect(l.radius).toBeLessThan(s[0].radius);
    for (const l of s) expect(l.radius).toBe(NIGHT.radius[l.kind]);
  });

  it('a dark or knocked-over lamp post gives no light', () => {
    const { world } = litWorld(7, 4, [[5, 5], [12, 7]]);
    world.lamps[0].lit = false;
    world.lamps[1].hp = 0;
    expect(lightSources(world).some((l) => l.kind === 'lamp')).toBe(false);
  });

  it('a ruined building gives no light, and a fallen knight carries no lantern', () => {
    const { world, knight } = litWorld();
    world.debugSetBuildingHp(1, 0);
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

describe('staticLightSources', () => {
  it('lists windows and lit lamps only, and keeps them through a blackout (the renderer fades them)', () => {
    const { world } = litWorld(7, 4, [[5, 5]]);
    world.blackout = 3;
    expect(lightSources(world).map((l) => l.kind)).toEqual(['lantern']);
    expect(staticLightSources(world).map((l) => l.key)).toEqual(['b0', 'b1', 'b2', 'l0']);
  });
});

describe('pointFalloff', () => {
  it("is three.js's physical falloff: inverse power of distance, faded to nothing at the cutoff", () => {
    expect(pointFalloff(1, 1.5, 100)).toBeCloseTo(1, 3);
    expect(pointFalloff(2, 2, 100)).toBeCloseTo(0.25, 3);
    expect(pointFalloff(5, 1.5, 5)).toBe(0);
    expect(pointFalloff(6, 1.5, 5)).toBe(0);
    // Never blows up right at the light.
    expect(pointFalloff(0, 1.5, 5)).toBe(100);
  });
});

describe('warmMapValues', () => {
  const N = 12;
  const res = WARM_MAP.res;
  const n = N * res;
  /** Texel index (RGBA offset) nearest world (x, z). */
  const texel = (x: number, z: number) => (Math.round((z + 0.5) * res - 0.5) * n + Math.round((x + 0.5) * res - 0.5)) * 4;
  /** Decoded light arriving (red channel) at world (x, z). */
  const at = (v: Uint8Array, x: number, z: number) => (v[texel(x, z)] / 255) ** 2 * WARM_MAP.scale;
  /** Decoded direction to the light at world (x, z): [x, up, z]. */
  const dirAt = (v: Uint8Array, x: number, z: number) => {
    const t = texel(x, z);
    return [v[t] / 127.5 - 1, v[t + 2] / 255, v[t + 1] / 127.5 - 1];
  };

  it("bakes a lamp's light as its real light would give it: brightest under it, none past its reach", () => {
    const lamp = src('l', 6, 6);
    const { color } = warmMapValues([lamp], N);
    expect(color).toHaveLength(n * n * 4);
    const under = at(color, 6.25, 6.25);
    const d = Math.hypot(0.25, 0.25, lamp.y);
    expect(under).toBeCloseTo(LIGHT_SHINE.lamp.intensity * pointFalloff(d, LIGHT_SHINE.lamp.decay, lamp.radius * LIGHT_REACH), 1);
    expect(at(color, 8, 6)).toBeLessThan(under);
    expect(at(color, 6 + lamp.radius * LIGHT_REACH + 0.5, 6)).toBe(0);
    expect(color[3]).toBe(255);
  });

  it('records where the light comes from: towards the lamp, and from higher up the nearer it is', () => {
    const { dir } = warmMapValues([src('l', 6, 6)], N);
    const east = dirAt(dir, 8.25, 6.25);
    expect(east[0]).toBeLessThan(-0.5);
    expect(Math.abs(east[2])).toBeLessThan(0.2);
    const south = dirAt(dir, 6.25, 3.75);
    expect(south[2]).toBeGreaterThan(0.5);
    expect(dirAt(dir, 6.25, 6.25)[1]).toBeGreaterThan(dirAt(dir, 8.25, 6.25)[1]);
    // Lights on both sides: the directions cancel, leaving light from all round (a short vector).
    const both = warmMapValues([src('a', 4.25, 6.25), src('b', 8.25, 6.25)], N).dir;
    expect(Math.abs(dirAt(both, 6.25, 6.25)[0])).toBeLessThan(0.02);
  });

  it('adds overlapping lights, in their own (linear) colour', () => {
    const one = warmMapValues([src('a', 5, 6)], N).color;
    const two = warmMapValues([src('a', 5, 6), src('b', 7, 6)], N).color;
    expect(at(two, 6, 6)).toBeGreaterThan(at(one, 6, 6));
    const warm = warmMapValues([{ ...src('w', 6, 6, 'window'), color: 0xff8000 }], N).color;
    const t = texel(6, 6);
    expect(warm[t]).toBeGreaterThan(warm[t + 1]);
    expect(warm[t + 2]).toBe(0);
  });

  it('is empty with no lights', () => {
    const { color } = warmMapValues([], N);
    expect(color.filter((_, k) => k % 4 !== 3).every((x) => x === 0)).toBe(true);
  });
});

describe('upsampleInto', () => {
  it('upsamples a per-cell map so bilinear sampling still gives its surface: values at cell edges are kept', () => {
    // A lit/dark edge between cells 1 and 2 (2/3 → 1/3, as the light map's blur leaves it).
    const values = new Uint8Array([170, 170, 85, 85]);
    const out = new Uint8Array(2 * 4 * 4).fill(7);
    upsampleInto(values, 4, 2, out, 3);
    const alpha = Array.from({ length: 8 }, (_, t) => out[t * 4 + 3]);
    // Texels 3 and 4 sit a quarter cell either side of the edge at 1.5: mean = the edge's value.
    expect((alpha[3] + alpha[4]) / 2).toBeCloseTo(127.5, 0);
    expect(alpha[0]).toBe(170);
    expect(alpha[7]).toBe(85);
    expect(out[0]).toBe(7);
  });
});

describe('linearRgb and duskLight', () => {
  it('converts sRGB hex to linear like three.js, and lights are dimmer at dusk', () => {
    expect(linearRgb(0xffffff)).toEqual([1, 1, 1]);
    expect(linearRgb(0x808080)[0]).toBeCloseTo(0.2159, 3);
    expect(duskLight(0)).toBe(DUSK_LIGHT);
    expect(duskLight(1)).toBe(1);
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
