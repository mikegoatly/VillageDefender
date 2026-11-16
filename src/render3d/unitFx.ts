// Per-instance hit flash and opacity for instanced unit materials, via a small shader patch.
// Each unit batch shares one `instanceFx` attribute (x = flash 0..1 towards white, or -1..0 towards red, y = alpha).

import * as THREE from 'three';

export const FX_ATTRIBUTE = 'instanceFx';

/** Fragment code draining colour towards a cold grey by `pallor` (0 = none). */
function pallorCode(pallor: number): string {
  if (pallor <= 0) return '';
  const luma = 'dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11))';
  return `gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${luma}) * vec3(0.92, 1.0, 1.04) + 0.04, ${pallor.toFixed(3)});\n`;
}

/** Adds the instanceFx attribute to a standard material's shaders (call once per material). */
export function withUnitFx<T extends THREE.Material>(material: T, pallor = 0): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 ${FX_ATTRIBUTE};\nvarying vec2 vUnitFx;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvUnitFx = ${FX_ATTRIBUTE};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUnitFx;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${pallorCode(pallor)}gl_FragColor.rgb = mix(gl_FragColor.rgb, vUnitFx.x < 0.0 ? vec3(1.0, 0.1, 0.05) : vec3(1.0), abs(vUnitFx.x));\ngl_FragColor.a *= vUnitFx.y;`);
  };
  material.customProgramCacheKey = () => `vd-unit-fx-${pallor}`;
  return material;
}

/** Geometry that shares `src`'s vertex data but carries the batch's instanceFx attribute. */
export function withFxAttribute(src: THREE.BufferGeometry, fx: THREE.InstancedBufferAttribute): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name);
    if (a) g.setAttribute(name, a);
  }
  if (src.index) g.setIndex(src.index);
  g.setAttribute(FX_ATTRIBUTE, fx);
  return g;
}
