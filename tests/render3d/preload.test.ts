import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ModelLibrary } from '../../src/render3d/assets';
import { FrostView } from '../../src/render3d/FrostView';
import { preloadModels } from '../../src/render3d/preload';
import { aWorld } from '../helpers/worldBuilder';

/** A library holding only the preloaded models: like the real one, anything else is an error. */
function preloadedLibrary(): ModelLibrary {
  const loaded = new Set(preloadModels());
  return {
    clone: (path: string) => {
      if (!loaded.has(path)) throw new Error(`model not loaded: ${path}`);
      return new THREE.Group();
    },
  } as unknown as ModelLibrary;
}

describe('preloaded models', () => {
  it('cover the Frostpeak extras: a planted powder keg can be drawn', () => {
    const { world } = aWorld().noRookies().withMonster('powderKeg', 5, 5).build();
    const view = new FrostView(preloadedLibrary());
    expect(() => view.sync(world, 0.016)).not.toThrow();
    expect(view.root.children).toHaveLength(1);
  });
});
