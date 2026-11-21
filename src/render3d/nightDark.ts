// Night towns: the night light, all in one global shader patch on the lit materials (anything with
// `lights_fragment_end`: ground, buildings, trees, decor, units). There are no real lights at night:
//
// - Warm light: every window and lamp lights the scene from a warm-light map (nightLights.warmMapValues:
//   three.js's point-light falloff baked into a texture, rebuilt only when a building falls or a lamp
//   changes), and the knight's lantern, wisps and fires are point lights computed in the shader. One
//   texture read plus a few cheap terms per fragment instead of a pool of real point lights, which
//   every lit fragment of every material would have looped over (the slow part on weak GPUs).
// - Real darkness: from wave 3 (when the sim's darkness rules start, eased in with the night level)
//   every lit material is darkened outside the sim's light, so light is the player's sight as well as
//   the archers'. The light map is a texture, one texel per cell, built from the sim's lit grid
//   (sim/light.ts) and softened by a 3×3 blur, which keeps the 0.5 contour on the sim's cell edges;
//   bilinear sampling smooths it further. The lantern is a circle in the shader with a soft edge
//   centred on the sim's radius; so is each will-o'-wisp and each pumpkin fire (up to MAX_GLOWS, a
//   uniform array, each with its own strength). During the Pumpkin King's blackout the light map,
//   windows, lamps and wisps are scaled down to nothing while the lantern and the fires stay.
//
// Unlit materials (MeshBasic: glowing eyes and pieces, window panes, lamp heads, halos, rings,
// telegraphs) and emissive light are untouched, so they still read in the dark. The patch is installed
// once, before any material compiles, and is inert (one uniform test) until a night town turns it on.

import * as THREE from 'three';
import { lampShines, type Lightable } from '../sim/light';
import { NIGHT } from '../data/night';
import type { World } from '../sim/world';
import { MONSTERS, PUMPKIN_KING, type MonsterKind } from '../data/monsters';
import { duskLight, fireLight, LIGHT_REACH, LIGHT_SHINE, linearRgb, NIGHT_LIGHT, staticLightSources, upsampleInto, WARM_MAP, warmMapValues, type WarmMap } from './nightLights';

/** How dark it gets outside the light at full night (a faint moon), and the lantern's soft edge (cells, each side). */
export const REAL_DARK = { floor: 0.1, lanternFeather: 0.5 };

let blank: THREE.DataTexture | null = null;
function blankTexture(): THREE.DataTexture {
  if (!blank) {
    blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    blank.needsUpdate = true;
  }
  return blank;
}

/** Wisps and fires lighting the ground in the shader at once (nearest the knight first; the rest are still lit in the sim). */
export const MAX_GLOWS = 8;
/**
 * The warm-light maps are baked for the ground; the lights hang about `height` up. Higher up, the
 * light comes in flatter (none from above past `height`: roofs stay moonlit) and fades out by twice
 * that height.
 */
const WARM_HEIGHT = 1.1;
/** Wisps and fires as lights: one height and decay for both (close to each kind's own). */
const GLOW_LIGHT = { y: 0.65, decay: 1.5 };

/** Shared uniform objects: every patched material holds these same objects, so one write updates all. */
export const NIGHT_UNIFORMS = {
  /** WARM_MAP.res texels per cell: which way the warm light comes from (RGB, nightLights.warmMapValues) and how lit (A). */
  vdLightMap: { value: blankTexture() as THREE.Texture },
  /** The warm light of every window and lamp (nightLights.warmMapValues), WARM_MAP.res texels per cell. */
  vdWarmMap: { value: blankTexture() as THREE.Texture },
  vdViewInverse: { value: new THREE.Matrix4() },
  /** Lantern x, z, radius (0 = none), and the map size in cells. */
  vdLantern: { value: new THREE.Vector4(0, 0, 0, 1) },
  /** Strength 0..1 (0 = off: other towns, dusk), the floor at full strength, and how bright the light map is (0 in a blackout). */
  vdNight: { value: new THREE.Vector3(0, REAL_DARK.floor, 1) },
  /** Warm light: x = warm-map brightness (dusk × blackout flicker), y = 1 in a night town (0: no warm light at all), z = glow slots in use. */
  vdWarm: { value: new THREE.Vector3(0, 0, 0) },
  /** The lantern's light colour × intensity (linear, dusk included). */
  vdLanternColor: { value: new THREE.Vector3() },
  /** Moving lights besides the lantern (wisps, fires): x, z, radius (0 = unused slot), strength 0..1. */
  vdGlows: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  /** Each glow's light colour × intensity × strength (linear, dusk included). */
  vdGlowColors: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector3()) },
};

const f2 = (v: number) => v.toFixed(2);
const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D vdLightMap;
uniform sampler2D vdWarmMap;
uniform mat4 vdViewInverse;
uniform vec4 vdLantern;
uniform vec3 vdNight;
uniform vec3 vdWarm;
uniform vec3 vdLanternColor;
uniform vec4 vdGlows[${MAX_GLOWS}];
uniform vec3 vdGlowColors[${MAX_GLOWS}];
varying vec3 vdWorldPos;
float vdCircle(vec2 w, vec2 c, float r) {
  return 1.0 - smoothstep(r - ${f2(REAL_DARK.lanternFeather)}, r + ${f2(REAL_DARK.lanternFeather)}, distance(w, c));
}
// A point light at p on a surface at w facing n (three.js's physical falloff; nightLights.pointFalloff),
// d = the distance.
float vdPoint(vec3 w, vec3 n, vec3 p, float d, float decay, float cutoff) {
  float edge = clamp(1.0 - pow4(d / cutoff), 0.0, 1.0);
  return edge * edge / max(pow(d, decay), 0.01) * max(dot(n, (p - w) / d), 0.0);
}
// Night light at a fragment (world position, view-space normal): how much of its light it keeps (k:
// real darkness, 1 when off) and the warm light it gets from windows, lamps, the lantern, wisps and
// fires. Lights out of reach cost one distance check.
void vdNightLight(vec3 w, vec3 viewNormal, out float k, out vec3 warm) {
  vec3 n = mat3(vdViewInverse) * viewNormal;
  vec2 uv = (w.xz + 0.5) / vdLantern.w;
  vec3 m = texture2D(vdWarmMap, uv).rgb;
  vec4 l = texture2D(vdLightMap, uv);
  // Light from all round (lights on several sides) averages to a shorter direction: that part lights
  // every face alike, at the mean cosine (a half).
  vec3 toLight = vec3(l.r * 2.0 - 1.0, l.b, l.g * 2.0 - 1.0);
  float spread = 0.5 * (1.0 - min(length(toLight), 1.0));
  toLight.y *= clamp(1.0 - w.y / ${f2(WARM_HEIGHT)}, 0.0, 1.0);
  float facing = (max(dot(n, toLight), 0.0) + spread) * clamp(2.0 - w.y / ${f2(WARM_HEIGHT)}, 0.0, 1.0);
  warm = m * m * (${f2(WARM_MAP.scale)} * vdWarm.x * facing);
  float lit = l.a * vdNight.z;
  float reach = vdLantern.z * ${f2(LIGHT_REACH)};
  vec3 p = vec3(vdLantern.x, ${f2(NIGHT_LIGHT.lantern.y)}, vdLantern.y);
  float d = distance(w, p);
  if (d < reach) {
    lit = max(lit, vdCircle(w.xz, p.xz, vdLantern.z));
    warm += vdLanternColor * vdPoint(w, n, p, d, ${f2(LIGHT_SHINE.lantern.decay)}, reach);
  }
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    if (float(i) >= vdWarm.z) break;
    vec4 g = vdGlows[i];
    reach = g.z * ${f2(LIGHT_REACH)};
    p = vec3(g.x, ${f2(GLOW_LIGHT.y)}, g.y);
    d = distance(w, p);
    if (d < reach) {
      lit = max(lit, vdCircle(w.xz, g.xy, g.z) * g.w);
      warm += vdGlowColors[i] * vdPoint(w, n, p, d, ${f2(GLOW_LIGHT.decay)}, reach);
    }
  }
  k = vdNight.x <= 0.0 ? 1.0 : mix(1.0, mix(vdNight.y, 1.0, lit), vdNight.x);
}
`;

/**
 * Adds the night light to a lit material's shader (no-op for unlit ones): the warm light of windows,
 * lamps, the lantern, wisps and fires (there are no real lights at night), then the darkness.
 * `exempt`: a GLSL bool expression that skips the darkness per fragment (friendly units are never darkened).
 * Inert (one uniform test) outside night towns.
 */
export function applyNightDark(shader: THREE.WebGLProgramParametersWithUniforms, exempt?: string) {
  Object.assign(shader.uniforms, NIGHT_UNIFORMS);
  if (!nightDarkOn) return;
  if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) return;
  // The world position comes from the vertex shader (the camera is fixed: one matrix per vertex, not per pixel).
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
uniform mat4 vdViewInverse;
varying vec3 vdWorldPos;`)
    .replace('#include <project_vertex>', `#include <project_vertex>
vdWorldPos = (vdViewInverse * mvPosition).xyz;`);
  // Worked out before the lights, so the moon's shadow lookup can be skipped where it is too dark to show.
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
${FRAGMENT_PARS}`)
    .replace('#include <lights_fragment_begin>', `float vdK = 1.0;
vec3 vdWarmLight = vec3(0.0);
if (vdWarm.y > 0.0) vdNightLight(vdWorldPos, normal, vdK, vdWarmLight);${exempt ? `\nif (${exempt}) vdK = 1.0;` : ''}
bool vdShadow = vdK > ${f2(DARK_SHADOW)};
${lightsBeginSkippingDarkShadows()}`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
if (vdWarm.y > 0.0) {
  reflectedLight.directDiffuse += vdWarmLight * BRDF_Lambert(material.diffuseColor);
  reflectedLight.directDiffuse *= vdK;
  reflectedLight.indirectDiffuse *= vdK;
  reflectedLight.directSpecular *= vdK;
  reflectedLight.indirectSpecular *= vdK;
}`);
}

/**
 * Where real darkness keeps no more than this of the light, the moon's shadow is not looked up (five
 * filtered shadow-map taps a fragment): a shadow at a tenth of the moonlight doesn't show.
 */
export const DARK_SHADOW = 0.2;
/** The directional (moon) light's shadow test in three.js's lights chunk, which gets `&& vdShadow`. */
export const SUN_SHADOW_TEST = '( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]';

/** three.js's lights_fragment_begin chunk, with the moon's shadow skipped in the dark (unchanged if three's chunk ever differs). */
export function lightsBeginSkippingDarkShadows(): string {
  return THREE.ShaderChunk.lights_fragment_begin.replace(SUN_SHADOW_TEST, SUN_SHADOW_TEST.replace('receiveShadow )', 'receiveShadow && vdShadow )'));
}

let installed = false;
let nightDarkOn = true;

/** Debug (`&nightdark=0`, measuring): leave the darkness out of every shader. Call before anything compiles. */
export function disableNightDark() {
  nightDarkOn = false;
}

/**
 * Installs the patch on every material that has no onBeforeCompile of its own (call once, before
 * anything renders). Materials with their own hook (unit materials) call applyNightDark themselves.
 */
export function installNightDark() {
  if (installed) return;
  installed = true;
  THREE.Material.prototype.onBeforeCompile = function vdNightDark(shader: THREE.WebGLProgramParametersWithUniforms) {
    applyNightDark(shader);
  };
}

/** The lantern's light at distance d from the knight (the shader's soft edge, mirrored for tests). */
export function lanternLight(d: number, radius: number): number {
  const f = REAL_DARK.lanternFeather;
  const t = Math.min(1, Math.max(0, (d - (radius - f)) / (2 * f)));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Light-map texel values (0..255, one per cell) from the sim's static lit grid: a 3×3 box blur of
 * lit (1) / dark (0) cells, so an edge runs 2/3 → 1/3 across the sim's cell boundary (the 0.5
 * contour stays exactly where the sim's rounding puts it).
 */
export function lightMapValues(grid: Uint8Array, size: number, out: Uint8Array = new Uint8Array(size * size)): Uint8Array {
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let sum = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = Math.min(size - 1, Math.max(0, j + dj));
        for (let di = -1; di <= 1; di++) {
          const ii = Math.min(size - 1, Math.max(0, i + di));
          sum += grid[jj * size + ii];
        }
      }
      out[j * size + i] = Math.round((sum / 9) * 255);
    }
  }
  return out;
}

/**
 * The light map and the warm-light map for one night town: rebuilt when the sim's lit grid or the
 * static lights change, and the shared uniforms (lantern, glows, camera, strength) set every frame.
 */
export class LightMap {
  /** WARM_MAP.res texels per cell: the warm light's direction (RGB) and the lit map (A, from the sim's lit grid). */
  readonly texture: THREE.DataTexture;
  /** WARM_MAP.res texels per cell: the warm light's colour. */
  readonly warmTexture: THREE.DataTexture;
  private readonly values: Uint8Array<ArrayBufferLike>;
  private readonly maps: WarmMap;
  private grid: Uint8Array | null = null;
  private readonly lastGrid: Uint8Array;
  /** Which buildings stand and which lamps shine, as last baked into the warm map. */
  private warmKey: Uint8Array = new Uint8Array(0);
  private readonly lanternColor = linearRgb(NIGHT_LIGHT.lantern.color);
  private readonly glowColors = { wisp: linearRgb(NIGHT_LIGHT.wisp.color), fire: linearRgb(NIGHT_LIGHT.fire.color) };

  constructor(private readonly size: number) {
    this.values = new Uint8Array(size * size);
    this.lastGrid = new Uint8Array(size * size).fill(2);
    const n = size * WARM_MAP.res;
    this.maps = { color: new Uint8Array(n * n * 4), dir: new Uint8Array(n * n * 4) };
    this.texture = dataTexture(this.maps.dir, n);
    this.warmTexture = dataTexture(this.maps.color, n);
  }

  /**
   * `strength`: 0..1, how far real darkness has come in (eased with the night level). `staticLight`:
   * 0..1, how bright windows, lamps and wisps are (the blackout's flicker); `clock` flickers the fires;
   * `floor`: how dark the dark is (the harvest moon lifts it a little); `level`: the shown night level
   * (lights are dimmer at dusk).
   */
  update(world: World & Lightable, camera: THREE.Camera, strength: number, staticLight = 1, clock = 0, floor = REAL_DARK.floor, level = 1) {
    this.grid = world.light.get(world);
    if (!sameBytes(this.grid, this.lastGrid)) {
      this.lastGrid.set(this.grid);
      lightMapValues(this.grid, this.size, this.values);
      upsampleInto(this.values, this.size, WARM_MAP.res, this.maps.dir, 3);
      this.texture.needsUpdate = true;
    }
    const key = staticKey(world);
    if (!sameBytes(key, this.warmKey)) {
      this.warmKey = key;
      warmMapValues(staticLightSources(world), this.size, WARM_MAP.res, this.maps);
      this.warmTexture.needsUpdate = true;
      this.texture.needsUpdate = true;
    }
    const dusk = duskLight(level);
    const u = NIGHT_UNIFORMS;
    u.vdLightMap.value = this.texture;
    u.vdWarmMap.value = this.warmTexture;
    u.vdViewInverse.value.copy(camera.matrixWorld);
    const k = world.players[0];
    const on = k && k.state !== 'dead';
    u.vdLantern.value.set(on ? k.x : 0, on ? k.y : 0, on ? NIGHT.radius.lantern : 0, this.size);
    u.vdNight.value.set(strength, floor, staticLight);
    const [r, g, b] = this.lanternColor;
    const li = LIGHT_SHINE.lantern.intensity * dusk;
    u.vdLanternColor.value.set(r * li, g * li, b * li);
    const used = setGlows(u.vdGlows.value, glowCircles(world, staticLight, clock), on ? k : null, u.vdGlowColors.value, dusk, this.glowColors);
    u.vdWarm.value.set(staticLight * dusk, 1, used);
  }

  /** Turns the night light off again (the town is left; materials are shared across sessions). */
  dispose() {
    NIGHT_UNIFORMS.vdNight.value.set(0, REAL_DARK.floor, 1);
    NIGHT_UNIFORMS.vdWarm.value.set(0, 0, 0);
    for (const g of NIGHT_UNIFORMS.vdGlows.value) g.set(0, 0, 0, 0);
    NIGHT_UNIFORMS.vdLightMap.value = blankTexture();
    NIGHT_UNIFORMS.vdWarmMap.value = blankTexture();
    this.texture.dispose();
    this.warmTexture.dispose();
  }
}

function dataTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** One byte per building (standing) and lamp (shining): the warm map is rebuilt when this changes. */
function staticKey(world: Lightable): Uint8Array {
  const key = new Uint8Array(world.buildings.length + world.lamps.length);
  world.buildings.forEach((b, k) => { key[k] = b.ruined ? 0 : 1; });
  world.lamps.forEach((l, k) => { key[world.buildings.length + k] = lampShines(l) ? 1 : 0; });
  return key;
}

/** A soft circle of light in the shader besides the lantern: a wisp or a fire. */
export interface GlowCircle { kind: 'wisp' | 'fire'; x: number; y: number; radius: number; strength: number }

/**
 * The moving and short-lived lights: living wisps (none in a blackout; `staticLight` dims them in its
 * flicker) and burning fires (flickering, flaring up and dying down). Exported for tests.
 */
export function glowCircles(world: Pick<World, 'glows' | 'fires' | 'blackout' | 'time'>, staticLight = 1, clock = 0): GlowCircle[] {
  const out: GlowCircle[] = [];
  if (world.blackout <= 0) {
    for (const m of world.glows) {
      if (m.state !== 'dead') out.push({ kind: 'wisp', x: m.x, y: m.y, radius: MONSTERS[m.kind as MonsterKind].light ?? 0, strength: staticLight });
    }
  }
  for (const f of world.fires) {
    const left = f.until - world.time;
    out.push({ kind: 'fire', x: f.x, y: f.y, radius: NIGHT.radius.fire, strength: fireLight(PUMPKIN_KING.fire.time - left, left, clock, f.id) });
  }
  return out;
}

/**
 * Fills the glow slots with the circles (nearest `near` first when there are more than slots), the
 * rest cleared, and each slot's light colour (`colors`: linear colour × intensity × strength × `dusk`).
 * Returns how many slots are in use (they come first). Exported for tests.
 */
export function setGlows(
  slots: THREE.Vector4[], circles: readonly GlowCircle[], near: { x: number; y: number } | null,
  colors?: THREE.Vector3[], dusk = 1, rgb?: Record<GlowCircle['kind'], [number, number, number]>,
): number {
  let list = [...circles];
  if (list.length > slots.length && near) list = list.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
  slots.forEach((s, i) => {
    const c = list[i];
    if (c) s.set(c.x, c.y, c.radius, c.strength);
    else s.set(0, 0, 0, 0);
    if (!colors) return;
    if (!c) {
      colors[i].set(0, 0, 0);
      return;
    }
    const [r, g, b] = rgb?.[c.kind] ?? linearRgb(NIGHT_LIGHT[c.kind].color);
    const k = LIGHT_SHINE[c.kind].intensity * c.strength * dusk;
    colors[i].set(r * k, g * k, b * k);
  });
  return Math.min(list.length, slots.length);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}

