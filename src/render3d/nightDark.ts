// Night towns: real darkness. From wave 3 (when the sim's darkness rules start, eased in with the
// night level) every lit material is darkened outside the sim's light, so light is the player's
// sight as well as the archers'. One mechanism for everything: a global shader patch on the lit
// materials (anything with `lights_fragment_end`: ground, buildings, trees, decor, units) that
// scales the light they receive by a light map sampled at the fragment's world XZ. Unlit materials
// (MeshBasic: glowing eyes and pieces, window panes, lamp heads, halos, rings, telegraphs) and
// emissive light are untouched, so they still read in the dark.
//
// The light map is a texture, one texel per cell, built from the sim's lit grid (sim/light.ts) and
// softened by a 3×3 blur, which keeps the 0.5 contour on the sim's cell edges; bilinear sampling
// smooths it further. The knight's lantern moves every frame, so it is a circle in the shader with a
// soft edge centred on the sim's radius; so is each will-o'-wisp (up to MAX_GLOWS, a uniform array). The patch is installed once, before any material compiles,
// and is inert (one uniform test) until a night town turns it on.

import * as THREE from 'three';
import type { Lightable } from '../sim/light';
import { NIGHT } from '../data/night';
import type { Unit, World } from '../sim/world';
import { MONSTERS, type MonsterKind } from '../data/monsters';

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

/** Will-o'-wisps lighting the ground in the shader at once (nearest the knight first; the rest are still lit in the sim). */
export const MAX_GLOWS = 8;

/** Shared uniform objects: every patched material holds these same objects, so one write updates all. */
export const NIGHT_UNIFORMS = {
  vdLightMap: { value: blankTexture() as THREE.Texture },
  vdViewInverse: { value: new THREE.Matrix4() },
  /** Lantern x, z, radius (0 = none), and the map size in cells. */
  vdLantern: { value: new THREE.Vector4(0, 0, 0, 1) },
  /** Strength 0..1 (0 = off: other towns, dusk), and the floor at full strength. */
  vdNight: { value: new THREE.Vector2(0, REAL_DARK.floor) },
  /** Moving lights besides the lantern (wisps): x, z, radius (0 = unused slot). */
  vdGlows: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector4(0, 0, 0, 0)) },
};

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D vdLightMap;
uniform mat4 vdViewInverse;
uniform vec4 vdLantern;
uniform vec2 vdNight;
uniform vec4 vdGlows[${MAX_GLOWS}];
float vdCircle(vec2 w, vec2 c, float r) {
  return 1.0 - smoothstep(r - ${REAL_DARK.lanternFeather.toFixed(2)}, r + ${REAL_DARK.lanternFeather.toFixed(2)}, distance(w, c));
}
float vdDarkness(vec3 viewPos) {
  if (vdNight.x <= 0.0) return 1.0;
  vec2 w = (vdViewInverse * vec4(viewPos, 1.0)).xz;
  float lit = texture2D(vdLightMap, (w + 0.5) / vdLantern.w).r;
  if (vdLantern.z > 0.0) lit = max(lit, vdCircle(w, vdLantern.xy, vdLantern.z));
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    if (vdGlows[i].z > 0.0) lit = max(lit, vdCircle(w, vdGlows[i].xy, vdGlows[i].z));
  }
  return mix(1.0, mix(vdNight.y, 1.0, lit), vdNight.x);
}
`;

/**
 * Adds the darkness to a lit material's shader (no-op for unlit ones). `exempt`: a GLSL bool
 * expression that skips it per fragment (friendly units are never darkened).
 */
export function applyNightDark(shader: THREE.WebGLProgramParametersWithUniforms, exempt?: string) {
  Object.assign(shader.uniforms, NIGHT_UNIFORMS);
  if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) return;
  const k = exempt ? `(${exempt}) ? 1.0 : vdDarkness(geometryPosition)` : 'vdDarkness(geometryPosition)';
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  float vdK = ${k};
  reflectedLight.directDiffuse *= vdK;
  reflectedLight.indirectDiffuse *= vdK;
  reflectedLight.directSpecular *= vdK;
  reflectedLight.indirectSpecular *= vdK;
}`);
}

let installed = false;

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
 * The light map for one night town: rebuilt from the sim's lit grid when it changes, and the
 * shared uniforms (lantern, camera, strength) updated every frame.
 */
export class LightMap {
  readonly texture: THREE.DataTexture;
  private readonly values: Uint8Array<ArrayBufferLike>;
  private readonly rgba: Uint8Array;
  private grid: Uint8Array | null = null;
  private readonly lastGrid: Uint8Array;

  constructor(private readonly size: number) {
    this.values = new Uint8Array(size * size);
    this.lastGrid = new Uint8Array(size * size).fill(2);
    this.rgba = new Uint8Array(size * size * 4);
    this.texture = new THREE.DataTexture(this.rgba, size, size);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  /** `strength`: 0..1, how far real darkness has come in (eased with the night level). */
  update(world: World & Lightable, camera: THREE.Camera, strength: number) {
    this.grid = world.light.get(world);
    if (!sameBytes(this.grid, this.lastGrid)) {
      this.lastGrid.set(this.grid);
      lightMapValues(this.grid, this.size, this.values);
      for (let k = 0; k < this.values.length; k++) {
        const v = this.values[k];
        this.rgba[k * 4] = v;
        this.rgba[k * 4 + 1] = v;
        this.rgba[k * 4 + 2] = v;
        this.rgba[k * 4 + 3] = 255;
      }
      this.texture.needsUpdate = true;
    }
    const u = NIGHT_UNIFORMS;
    u.vdLightMap.value = this.texture;
    u.vdViewInverse.value.copy(camera.matrixWorld);
    const k = world.players[0];
    const on = k && k.state !== 'dead';
    u.vdLantern.value.set(on ? k.x : 0, on ? k.y : 0, on ? NIGHT.radius.lantern : 0, this.size);
    u.vdNight.value.set(strength, REAL_DARK.floor);
    setGlows(u.vdGlows.value, world.glows, on ? k : null);
  }

  /** Turns the darkness off again (the town is left; materials are shared across sessions). */
  dispose() {
    NIGHT_UNIFORMS.vdNight.value.set(0, REAL_DARK.floor);
    for (const g of NIGHT_UNIFORMS.vdGlows.value) g.set(0, 0, 0, 0);
    NIGHT_UNIFORMS.vdLightMap.value = blankTexture();
    this.texture.dispose();
  }
}

/**
 * Fills the glow slots with the living wisps (nearest `near` first when there are more than slots),
 * the rest cleared. Exported for tests.
 */
export function setGlows(slots: THREE.Vector4[], glows: readonly Unit[], near: { x: number; y: number } | null) {
  let list = glows.filter((m) => m.state !== 'dead');
  if (list.length > slots.length && near) list = list.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
  slots.forEach((s, i) => {
    const m = list[i];
    if (m) s.set(m.x, m.y, MONSTERS[m.kind as MonsterKind].light ?? 0, 0);
    else s.set(0, 0, 0, 0);
  });
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}

