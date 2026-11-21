// Night towns, real darkness: the light map built from the sim's lit grid, its soft edges, the
// lantern's soft circle and the shared uniforms.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { NIGHT } from '../../src/data/night';
import {
  applyNightDark, glowCircles, lanternLight, LightMap, lightMapValues, lightsBeginSkippingDarkShadows, MAX_GLOWS, NIGHT_UNIFORMS, setGlows, SUN_SHADOW_TEST,
} from '../../src/render3d/nightDark';
import { BLACKOUT_FX, BlackoutFlicker, DUSK_LIGHT, LIGHT_SHINE, WARM_MAP } from '../../src/render3d/nightLights';
import { igniteFire } from '../../src/sim/fire';
import { isLit } from '../../src/sim/light';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld } from '../helpers/worldBuilder';

const N = 24;
/** A night field with one lit lamp at (10, 10), the knight in the far corner (lantern out of the way). */
function lampWorld() {
  const rows = fieldRows(N);
  rows[10] = '.'.repeat(10) + 'L' + '.'.repeat(N - 11);
  return aWorld().withMap(rows).noRookies().atNight(5).withKnightAt(N - 1, N - 1).build().world;
}
const camera = () => new THREE.PerspectiveCamera();

describe('lightMapValues', () => {
  it('is bright inside the light and black far from it', () => {
    const w = lampWorld();
    const v = lightMapValues(w.light.get(w), N);
    expect(v[10 * N + 10]).toBe(255);
    expect(v[2 * N + 2]).toBe(0);
  });

  it("feathers the edge but keeps the half-way contour on the sim's cell boundary", () => {
    const w = lampWorld();
    const v = lightMapValues(w.light.get(w), N);
    // Along the row through the lamp: the last lit cell is above half, the first dark one below.
    let edge = 10;
    while (isLit(w, edge + 1, 10)) edge++;
    expect(v[10 * N + edge]).toBeGreaterThan(127);
    expect(v[10 * N + edge + 1]).toBeLessThan(128);
    // Soft: values between full and none on both sides of the edge, falling steadily outwards.
    expect(v[10 * N + edge]).toBeLessThan(255);
    expect(v[10 * N + edge + 1]).toBeGreaterThan(0);
    for (let i = 10; i < N - 1; i++) expect(v[10 * N + i + 1]).toBeLessThanOrEqual(v[10 * N + i]);
  });

  it('a straight edge runs 2/3 → 1/3 across the boundary', () => {
    const grid = new Uint8Array(9);
    grid.set([1, 0, 0, 1, 0, 0, 1, 0, 0]);
    const v = lightMapValues(grid, 3);
    expect(v[3]).toBe(Math.round((6 / 9) * 255));
    expect(v[4]).toBe(Math.round((3 / 9) * 255));
  });
});

describe('lanternLight', () => {
  it("is full inside the lantern, none outside, and half at the sim's radius", () => {
    const r = NIGHT.radius.lantern;
    expect(lanternLight(r - 1, r)).toBe(1);
    expect(lanternLight(r, r)).toBeCloseTo(0.5);
    expect(lanternLight(r + 1, r)).toBe(0);
  });
});

describe('LightMap', () => {
  it('fills the texture from the sim grid and sets the shared uniforms', () => {
    const w = lampWorld();
    const map = new LightMap(N);
    map.update(w, camera(), 0.7);
    // The lit map rides in the alpha of the (finer) direction map.
    const rgba = map.texture.image.data as Uint8Array;
    const n = N * WARM_MAP.res;
    const lit = (i: number, j: number) => rgba[((j * WARM_MAP.res) * n + i * WARM_MAP.res) * 4 + 3];
    expect(map.texture.image.width).toBe(n);
    expect(lit(10, 10)).toBe(255);
    expect(lit(2, 2)).toBe(0);
    expect(NIGHT_UNIFORMS.vdLightMap.value).toBe(map.texture);
    expect(NIGHT_UNIFORMS.vdLantern.value.toArray()).toEqual([N - 1, N - 1, NIGHT.radius.lantern, N]);
    expect(NIGHT_UNIFORMS.vdNight.value.x).toBe(0.7);

    // A broken lamp goes dark in the map; a fallen knight carries no lantern.
    const v0 = map.texture.version;
    w.debugSetLamp(0, false);
    w.players[0].state = 'dead';
    map.update(w, camera(), 1);
    expect(map.texture.version).toBeGreaterThan(v0);
    expect(lit(10, 10)).toBe(0);
    expect(NIGHT_UNIFORMS.vdLantern.value.z).toBe(0);

    map.dispose();
    expect(NIGHT_UNIFORMS.vdNight.value.x).toBe(0);
    expect(NIGHT_UNIFORMS.vdWarm.value.y).toBe(0);
  });

  it("bakes the lamps' warm light, rebuilt only when a light comes or goes, and dims every light at dusk", () => {
    const w = lampWorld();
    const map = new LightMap(N);
    map.update(w, camera(), 1, 1, 0, undefined, 0);
    const n = N * WARM_MAP.res;
    const warm = map.warmTexture.image.data as Uint8Array;
    const texel = (i: number, j: number) => warm[((j * WARM_MAP.res) * n + i * WARM_MAP.res) * 4];
    expect(texel(10, 10)).toBeGreaterThan(100);
    expect(texel(2, 2)).toBe(0);
    expect(NIGHT_UNIFORMS.vdWarmMap.value).toBe(map.warmTexture);
    // On in a night town; the light map's brightness is the dusk dimming × the blackout flicker.
    expect(NIGHT_UNIFORMS.vdWarm.value.toArray()).toEqual([DUSK_LIGHT, 1, 0]);
    expect(NIGHT_UNIFORMS.vdLanternColor.value.x).toBeCloseTo(LIGHT_SHINE.lantern.intensity * DUSK_LIGHT, 4);

    const v0 = map.warmTexture.version;
    map.update(w, camera(), 1);
    expect(map.warmTexture.version).toBe(v0);
    w.debugSetLamp(0, false);
    map.update(w, camera(), 1);
    expect(map.warmTexture.version).toBeGreaterThan(v0);
    expect(texel(10, 10)).toBe(0);
    map.dispose();
  });
});

describe('applyNightDark', () => {
  const shader = (fragment: string) => ({ uniforms: {}, vertexShader: '', fragmentShader: fragment }) as unknown as THREE.WebGLProgramParametersWithUniforms;

  const lit = () => shader('#include <common>\nvoid main() {\n#include <lights_fragment_begin>\n#include <lights_fragment_end>\n}');

  it('lights a lit material with the warm light and darkens what it receives, not its glow', () => {
    const s = lit();
    applyNightDark(s);
    expect(s.fragmentShader).toContain('reflectedLight.directDiffuse += vdWarmLight * BRDF_Lambert(material.diffuseColor)');
    expect(s.fragmentShader).toContain('reflectedLight.directDiffuse *= vdK');
    expect(s.fragmentShader).not.toContain('totalEmissiveRadiance *=');
    expect(Object.keys(s.uniforms)).toEqual(expect.arrayContaining(['vdLightMap', 'vdWarmMap', 'vdLantern', 'vdNight', 'vdWarm', 'vdViewInverse']));
  });

  it('works out the world position per vertex, not per pixel', () => {
    const s = lit();
    s.vertexShader = '#include <common>\nvoid main() {\n#include <project_vertex>\n}';
    applyNightDark(s);
    expect(s.vertexShader).toContain('vdWorldPos = (vdViewInverse * mvPosition).xyz;');
    expect(s.fragmentShader).toContain('vdNightLight(vdWorldPos, normal, vdK, vdWarmLight)');
  });

  it("skips the moon's shadow lookup where it is too dark to see", () => {
    expect(THREE.ShaderChunk.lights_fragment_begin).toContain(SUN_SHADOW_TEST);
    expect(lightsBeginSkippingDarkShadows()).toContain('( directLight.visible && receiveShadow && vdShadow ) ? getShadow( directionalShadowMap[ i ]');
    const s = lit();
    applyNightDark(s);
    expect(s.fragmentShader).toContain('bool vdShadow = vdK > ');
    expect(s.fragmentShader).not.toContain('#include <lights_fragment_begin>');
  });

  it('leaves unlit materials alone, and honours a per-fragment exemption', () => {
    const basic = shader('#include <common>\nvoid main() {\n#include <opaque_fragment>\n}');
    applyNightDark(basic);
    expect(basic.fragmentShader).not.toContain('vdNightLight');
    const unit = lit();
    applyNightDark(unit, 'vUnitFx.z < -0.5');
    expect(unit.fragmentShader).toContain('if (vUnitFx.z < -0.5) vdK = 1.0;');
  });
});

describe("will-o'-wisps in the light map", () => {
  it('each living wisp lights a soft circle of its sim radius in the shader; dead ones and spare slots are off', () => {
    const { world, monsters } = aWorld().withMap(fieldRows(N)).noRookies().atNight(5).withKnightAt(N - 1, N - 1)
      .withMonster('wisp', 5, 5).withMonster('wisp', 8, 9).withMonster('zombie', 3, 3).build();
    monsters[1].state = 'dead';
    const slots = Array.from({ length: MAX_GLOWS }, () => new THREE.Vector4(9, 9, 9, 9));
    const colors = Array.from({ length: MAX_GLOWS }, () => new THREE.Vector3(9, 9, 9));
    expect(setGlows(slots, glowCircles(world), world.players[0], colors, 0.5)).toBe(1);
    expect(slots[0].toArray()).toEqual([5, 5, NIGHT.radius.wisp, 1]);
    // Its light: the wisp's colour × intensity × strength × dusk; spare slots give none.
    expect(colors[0].y).toBeGreaterThan(colors[0].x);
    expect(Math.max(colors[0].x, colors[0].y, colors[0].z)).toBeLessThanOrEqual(LIGHT_SHINE.wisp.intensity * 0.5);
    expect(colors[1].toArray()).toEqual([0, 0, 0]);
    for (const s of slots.slice(1)) expect(s.z).toBe(0);
    expect(isLit(world, 5 + NIGHT.radius.wisp - 0.2, 5)).toBe(true);
  });

  it('with more wisps than slots, the ones nearest the knight get them', () => {
    const b = aWorld().withMap(fieldRows(N)).noRookies().atNight(5).withKnightAt(0, 0);
    for (let k = 0; k < MAX_GLOWS + 2; k++) b.withMonster('wisp', N - 1 - k, N - 1 - k);
    const { world } = b.build();
    const slots = Array.from({ length: MAX_GLOWS }, () => new THREE.Vector4());
    setGlows(slots, glowCircles(world), world.players[0]);
    expect(Math.max(...slots.map((s) => s.x))).toBe(N - 1 - 2);
  });

  it('the shader checks the glow slots', () => {
    const sh = { uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <lights_fragment_end>' } as unknown as THREE.WebGLProgramParametersWithUniforms;
    applyNightDark(sh);
    expect(sh.fragmentShader).toContain(`uniform vec4 vdGlows[${MAX_GLOWS}]`);
    expect(Object.keys(sh.uniforms)).toContain('vdGlows');
  });
});

describe("the Pumpkin King's fires and blackout in the light map", () => {
  it('a fire lights a circle of its sim radius; in a blackout the wisps and the light map go, the fire stays', () => {
    const { world } = aWorld().withMap(fieldRows(N)).noRookies().atNight(9).withKnightAt(N - 1, N - 1).withMonster('wisp', 5, 5).build();
    igniteFire(world, 12, 12);
    world.fires[0].until = world.time + 4; // well past flaring up, not yet dying down
    const lit = glowCircles(world, 1, 0);
    expect(lit.map((c) => [c.x, c.y, c.radius])).toEqual([[5, 5, NIGHT.radius.wisp], [12, 12, NIGHT.radius.fire]]);
    expect(lit[1].strength).toBeGreaterThan(0.5);
    world.blackout = 3;
    expect(glowCircles(world, 0, 0).map((c) => [c.x, c.y])).toEqual([[12, 12]]);
    new LightMap(N).update(world, camera(), 1, 0);
    expect(NIGHT_UNIFORMS.vdNight.value.z).toBe(0);
  });

  it('the shader scales the light map by the blackout and each glow by its strength', () => {
    const sh = { uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <lights_fragment_end>' } as unknown as THREE.WebGLProgramParametersWithUniforms;
    applyNightDark(sh);
    expect(sh.fragmentShader).toContain('* vdNight.z');
    expect(sh.fragmentShader).toContain('* g.w');
  });
});

describe('blackout flicker (render)', () => {
  const run = (f: BlackoutFlicker, w: { blackoutWarn: number; blackout: number }, seconds: number) => {
    const seen: number[] = [];
    for (let t = 0; t < seconds; t += 1 / 60) seen.push(f.update(w, 1.5, 1 / 60));
    return seen;
  };

  it('steady when nothing is happening; stutters through the warning; out in the blackout; stutters back, then steady', () => {
    let r = 0;
    const f = new BlackoutFlicker(() => (r = (r + 0.37) % 1));
    expect(new Set(run(f, { blackoutWarn: 0, blackout: 0 }, 1))).toEqual(new Set([1]));
    const warn = run(f, { blackoutWarn: 1, blackout: 0 }, 1);
    expect(Math.min(...warn)).toBeLessThan(0.2);
    expect(Math.max(...warn)).toBe(1);
    expect(run(f, { blackoutWarn: 0, blackout: 3 }, 1).at(-1)).toBe(0);
    const back = run(f, { blackoutWarn: 0, blackout: 0 }, BLACKOUT_FX.back);
    expect(Math.min(...back)).toBeLessThan(0.2);
    expect(run(f, { blackoutWarn: 0, blackout: 0 }, 0.5).every((v) => v === 1)).toBe(true);
  });
});
