// Loads the Kenney GLB models once and hands out clones. Shared across play sessions.

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_ROOT = `${import.meta.env.BASE_URL}assets/models`;

/**
 * Scenery writes stencil 1 where it is the nearest surface; units write 0. Occlusion
 * silhouettes draw only over stencil 1 (see UnitBatches).
 */
export function markOccluder(m: THREE.Material) {
  m.stencilWrite = true;
  m.stencilRef = 1;
  m.stencilZPass = THREE.ReplaceStencilOp;
}

export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly gltfs = new Map<string, GLTF>();

  async load(paths: string[]): Promise<void> {
    await Promise.all(paths.filter((p) => !this.gltfs.has(p)).map(async (p) => {
      const g = await this.loader.loadAsync(`${MODEL_ROOT}/${p}.glb`);
      const scenery = p.startsWith('fantasy-town/');
      g.scene.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
        const mesh = o as THREE.Mesh;
        if (scenery && mesh.isMesh) markOccluder(mesh.material as THREE.Material);
      });
      this.gltfs.set(p, g);
    }));
  }

  gltf(path: string): GLTF {
    const g = this.gltfs.get(path);
    if (!g) throw new Error(`model not loaded: ${path}`);
    return g;
  }

  /** A copy of the model's scene graph (geometry and materials are shared). */
  clone(path: string): THREE.Object3D {
    return this.gltf(path).scene.clone();
  }
}
