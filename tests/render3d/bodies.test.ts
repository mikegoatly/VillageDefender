/// <reference types="node" />
// Designed monster bodies (render3d/bodies.ts): specs only use the rig's bones, and monsters don't
// borrow the models that friendlies and townsfolk are drawn with.

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../../src/data/monsters';
import { ROOKIES } from '../../src/data/rookies';
import { BODIES, BONES, dressBody, type BodySpec } from '../../src/render3d/bodies';
import { CHARACTER_MODELS } from '../../src/render3d/characters';

/** Node names in a GLB (its JSON chunk), without a loader. */
function glbNodeNames(path: string): string[] {
  const buf = readFileSync(`public/assets/models/${path}.glb`);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString());
  return json.nodes.map((n: { name?: string }) => n.name ?? '');
}

/** A bare rig in the rest pose, shaped like the Kenney Mini rig (one dummy mesh per bone). */
function aRig(): THREE.Object3D {
  const model = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number) => {
    const b = new THREE.Object3D();
    b.name = name;
    b.position.set(x, y, 0);
    b.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)));
    parent.add(b);
    return b;
  };
  const root = bone('root', model, 0, 0);
  bone('leg-left', root, 0.084, 0.176);
  bone('leg-right', root, -0.084, 0.176);
  const torso = bone('torso', root, 0, 0.176);
  bone('arm-left', torso, 0.1, 0.112);
  bone('arm-right', torso, -0.1, 0.112);
  bone('head', torso, 0, 0.167);
  return model;
}

/** Models friendlies and townsfolk are drawn with; monsters need a body of their own to use them. */
const FRIENDLY_SHEETS = ['knight', ...Object.values(ROOKIES).map((r) => r.sheet), 'recruitSwordsman', 'recruitArcher', 'villager'];
const FRIENDLY_MODELS = new Set(FRIENDLY_SHEETS.map((s) => CHARACTER_MODELS[s]));
/** Monsters still drawn as townsfolk, waiting for a designed body (remove as each one is done). */
const PENDING_BODIES: string[] = [];

describe('monster bodies', () => {
  it.each(Object.entries(BODIES))('%s: every piece sits on a rig bone, inside a sensible box', (sheet, spec) => {
    expect(FRIENDLY_SHEETS).not.toContain(sheet);
    const nodes = glbNodeNames(CHARACTER_MODELS[sheet]);
    for (const p of spec.pieces) {
      expect(BONES).toContain(p.bone);
      expect(nodes).toContain(p.bone);
      for (const s of p.size) expect(s).toBeGreaterThan(0);
      expect(Math.abs(p.at[0])).toBeLessThan(0.8);
      expect(p.at[1]).toBeGreaterThan(-0.1);
      expect(p.at[1]).toBeLessThan(1.2);
      expect(Math.abs(p.at[2])).toBeLessThan(0.8);
    }
  });

  it('no monster is drawn with a friendly or townsfolk model unless it has a designed body', () => {
    const borrowed = Object.entries(MONSTERS)
      .filter(([, def]) => !def.inert && !BODIES[def.sheet] && !PENDING_BODIES.includes(def.sheet))
      .filter(([, def]) => FRIENDLY_MODELS.has(CHARACTER_MODELS[def.sheet]) || CHARACTER_MODELS[def.sheet].startsWith('mini-characters/'))
      .map(([kind]) => kind);
    expect(borrowed).toEqual([]);
  });

  it('dressing a rig drops its meshes and hangs one merged, coloured mesh per used bone, placed in model space', () => {
    const spec: BodySpec = {
      note: 'test',
      pieces: [
        { bone: 'head', shape: 'box', size: [0.2, 0.2, 0.2], at: [0, 0.5, 0], color: 0xff0000 },
        { bone: 'head', shape: 'cone', size: [0.1, 0.1, 0.1], at: [0, 0.65, 0], color: 0x00ff00 },
        { bone: 'arm-left', shape: 'cylinder', size: [0.06, 0.2, 0.06], at: [0.25, 0.29, 0], rot: [0, 0, Math.PI / 2], color: 0x0000ff, sides: 6 },
      ],
    };
    const rig = aRig();
    dressBody(rig, spec);
    const meshes: THREE.Mesh[] = [];
    rig.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.map((m) => m.parent!.name).sort()).toEqual(['arm-left', 'head']);
    // The head box is centred at model y 0.5; the head bone rests at 0.176 + 0.167.
    const head = meshes.find((m) => m.parent!.name === 'head')!;
    head.geometry.computeBoundingBox();
    const box = head.geometry.boundingBox!;
    expect((box.min.y + 0.1 + 0.176 + 0.167)).toBeCloseTo(0.5, 5);
    expect(head.geometry.getAttribute('color')).toBeDefined();
    // Moving with the bone: world position of the head piece follows the head node.
    rig.updateMatrixWorld(true);
    const centre = new THREE.Vector3(0, (box.min.y + 0.2 + box.min.y) / 2, 0).applyMatrix4(head.matrixWorld);
    expect(centre.y).toBeCloseTo(0.5, 5);
  });

  it('a piece on a bone the rig lacks is an error', () => {
    const rig = new THREE.Group();
    expect(() => dressBody(rig, { note: 'x', pieces: [{ bone: 'head', shape: 'box', size: [1, 1, 1], at: [0, 0, 0], color: 0 }] })).toThrow(/head/);
  });
});
