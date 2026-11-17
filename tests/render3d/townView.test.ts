import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ModelLibrary } from '../../src/render3d/assets';
import { Particles } from '../../src/render3d/Particles';
import { TownView } from '../../src/render3d/TownView';
import { NO_FORT } from '../../src/render3d/upgradeFx';
import { generateTown } from '../../src/sim/map';
import { aWorld } from '../helpers/worldBuilder';

/** Kit models stand in as one textured (white) mesh each, marked as occluders like the real kit. */
const fakeLibrary = {
  clone: () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff });
    m.stencilWrite = true;
    return new THREE.Mesh(new THREE.BoxGeometry(), m);
  },
  instanced: () => new THREE.Group(),
} as unknown as ModelLibrary;

function townWithSlits() {
  const { world } = aWorld().withTownMap(generateTown(1)).build();
  const view = new TownView(fakeLibrary, world.map, new Particles());
  const fort = { ...NO_FORT, slits: 3, key: 'slits3' };
  const b = world.buildings[0];
  view.sync(world.buildings, 0, fort);
  return { view, world, b, fort };
}

/** Meshes of the arrow slits (dark, not the white stand-in kit). */
function slitMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.slit) out.push(m);
  });
  return out;
}

describe('TownView arrow slits', () => {
  it('are occluders, so units behind them get a silhouette', () => {
    const { view } = townWithSlits();
    const slits = slitMeshes(view.root);
    expect(slits.length).toBeGreaterThan(0);
    for (const s of slits) expect((s.material as THREE.Material).stencilWrite).toBe(true);
  });

  it('darken with damage from their own colour, and flash when the building is hit', () => {
    const { view, world, b, fort } = townWithSlits();
    const slit = slitMeshes(view.root).find((s) => s.parent && isIn(s, view, b.id))!;
    const mat = slit.material as THREE.MeshStandardMaterial;
    const intact = mat.color.clone();
    expect(intact.getHex()).not.toBe(0xffffff);
    b.hp = b.maxHp * 0.7;
    view.sync(world.buildings, 0, fort);
    expect(mat.color.r).toBeLessThan(intact.r);
    view.hit(b.id);
    expect(mat.emissive.getHex()).not.toBe(0);
  });
});

/** Whether a mesh belongs to building `id` (its group holds the kit meshes for that building). */
function isIn(o: THREE.Object3D, view: TownView, id: number): boolean {
  const groups = (view as unknown as { views: { group: THREE.Group | null }[] }).views;
  let p: THREE.Object3D | null = o;
  while (p && p !== groups[id].group) p = p.parent;
  return p !== null;
}
