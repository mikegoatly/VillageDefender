// Per-instance hit flash, opacity and darkness for instanced unit materials, via a small shader patch.
// Each unit batch shares one `instanceFx` attribute (x = flash 0..1 towards white, or -1..0 towards red,
// y = alpha, z = darkness 0..1: a monster out of the light at night, where only what glows still reads).

import * as THREE from 'three';
import { applyNightDark } from './nightDark';

export const FX_ATTRIBUTE = 'instanceFx';

/** Fragment code draining colour towards a cold grey by `pallor` (0 = none). */
function pallorCode(pallor: number): string {
  if (pallor <= 0) return '';
  const luma = 'dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11))';
  return `gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${luma}) * vec3(0.92, 1.0, 1.04) + 0.04, ${pallor.toFixed(3)});\n`;
}

/**
 * Fragment code gilding colour by `gild` (0 = none): keeps the shading but swaps the hue for a
 * bright gold. A plain tint multiplies, so on dark armour it would only get muddier.
 */
function gildCode(gild: number): string {
  if (gild <= 0) return '';
  const luma = 'dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11))';
  return `gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${luma}) * vec3(2.2, 1.25, 0.25) + vec3(0.1, 0.03, 0.0), ${gild.toFixed(3)});\n`;
}

/** How much of a fully darkened monster's lit colour is left; what glows (emissive) is kept. */
export const DARK_KEEP = 0.05;
/** instanceFx.z for friendly units: never darkened, by the unit darkness or the night light map. */
export const FX_FRIENDLY = -1;

/**
 * Fragment code darkening a lit material by the unit's darkness (instanceFx.z, 0..1): only DARK_KEEP of
 * its colour is left, plus its own emissive glow. Unlit (MeshBasic) pieces are glow pieces: untouched.
 */
function darkCode(material: THREE.Material): string {
  if ((material as THREE.MeshBasicMaterial).isMeshBasicMaterial) return '';
  return `gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * ${DARK_KEEP.toFixed(3)} + totalEmissiveRadiance, clamp(vUnitFx.z, 0.0, 1.0));\n`;
}

export interface UnitFxOptions {
  pallor?: number;
  gild?: number;
  /**
   * Night eyes (render3d/nightEyes.ts): visible only as far as the unit is dark (alpha × instanceFx.z),
   * or always with `eyesAlways` (`&eyes=1`, for lining the eyes up with the painted ones).
   */
  eyes?: boolean;
  eyesAlways?: boolean;
}

/**
 * Adds the instanceFx attribute to a unit material's shaders (call once per material), plus the night
 * light map (render3d/nightDark.ts), which friendly units are exempt from.
 */
export function withUnitFx<T extends THREE.Material>(material: T, o: UnitFxOptions = {}): T {
  const { pallor = 0, gild = 0, eyes = false, eyesAlways = false } = o;
  const dark = eyes ? '' : darkCode(material);
  const eyeAlpha = eyes && !eyesAlways ? 'gl_FragColor.a *= clamp(vUnitFx.z, 0.0, 1.0);\n' : '';
  material.onBeforeCompile = (shader) => {
    applyNightDark(shader, `vUnitFx.z < ${(FX_FRIENDLY / 2).toFixed(1)}`);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 ${FX_ATTRIBUTE};\nvarying vec3 vUnitFx;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvUnitFx = ${FX_ATTRIBUTE};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUnitFx;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${pallorCode(pallor)}${gildCode(gild)}${dark}gl_FragColor.rgb = mix(gl_FragColor.rgb, vUnitFx.x < 0.0 ? vec3(1.0, 0.1, 0.05) : vec3(1.0), abs(vUnitFx.x));\ngl_FragColor.a *= vUnitFx.y;\n${eyeAlpha}`);
  };
  material.customProgramCacheKey = () => `vd-unit-fx-${pallor}-${gild}-${dark ? 'd' : ''}-${eyeAlpha ? 'e' : ''}`;
  return material;
}

/**
 * Occlusion silhouettes for monsters: faded out as far as the monster is dark (a monster in the dark
 * shows only its eyes, never a red outline through a wall). Friendly silhouettes are left as they are.
 */
export function withDarkSilhouette<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 ${FX_ATTRIBUTE};\nvarying float vUnitDark;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvUnitDark = clamp(${FX_ATTRIBUTE}.z, 0.0, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUnitDark;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= 1.0 - vUnitDark;');
  };
  material.customProgramCacheKey = () => 'vd-dark-silhouette';
  return material;
}

/** Geometry that shares `src`'s vertex data but carries the batch's instanceFx attribute. */
export function withFxAttribute(src: THREE.BufferGeometry, fx: THREE.InstancedBufferAttribute): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = src.getAttribute(name);
    if (a) g.setAttribute(name, a);
  }
  if (src.index) g.setIndex(src.index);
  g.setAttribute(FX_ATTRIBUTE, fx);
  return g;
}
