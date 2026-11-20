/// <reference types="node" />
// Designed monster bodies (render3d/bodies.ts): specs only use the rig's bones, and monsters don't
// borrow the models that friendlies and townsfolk are drawn with.

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../../src/data/monsters';
import { TOWNS } from '../../src/data/towns';
import { ROOKIES } from '../../src/data/rookies';
import { BODIES, BONES, dressBody, expandPieces, mirrorPiece, PALETTE, type BodyPiece, type BodySpec } from '../../src/render3d/bodies';
import { CHARACTER_MODELS, lookFor } from '../../src/render3d/characters';
import { aWorld } from '../helpers/worldBuilder';

/** Node names in a GLB (its JSON chunk), without a loader. */
function glbNodeNames(path: string): string[] {
  const buf = readFileSync(`public/assets/models/${path}.glb`);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString());
  return json.nodes.map((n: { name?: string }) => n.name ?? '');
}

/**
 * A bare rig in the rest pose, shaped like the Kenney Mini rig: one dummy mesh per bone (orc), or
 * with `bonesAreMeshes` the bones themselves are meshes (the graveyard models).
 */
function aRig(bonesAreMeshes = false): THREE.Object3D {
  const model = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number) => {
    const b = bonesAreMeshes ? new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)) : new THREE.Object3D();
    b.name = name;
    b.position.set(x, y, 0);
    if (!bonesAreMeshes) b.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)));
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

  it('every boss has a designed body of its own, bringing its own colours (no tint or pallor)', () => {
    const bosses = Object.entries(MONSTERS).filter(([, def]) => def.boss);
    expect(bosses.length).toBeGreaterThan(0);
    for (const [kind, def] of bosses) {
      expect(BODIES[def.sheet], kind).toBeDefined();
      const shared = Object.entries(MONSTERS).filter(([other, d]) => other !== kind && d.sheet === def.sheet).map(([other]) => other);
      expect(shared, kind).toEqual([]);
      expect(def.tint, kind).toBe(0xffffff);
      expect(def.pallor ?? 0, kind).toBe(0);
    }
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

  it('mirror adds a twin across x = 0 on the opposite bone, with Y and Z turns reversed', () => {
    const p = { bone: 'arm-left', shape: 'box', size: [0.1, 0.1, 0.1], at: [0.3, 0.29, 0.05], rot: [0.1, 0.2, 0.3], color: 1, mirror: true } satisfies BodyPiece as BodyPiece;
    expect(mirrorPiece(p)).toMatchObject({ bone: 'arm-right', at: [-0.3, 0.29, 0.05], rot: [0.1, -0.2, -0.3], mirror: false });
    expect(expandPieces([p, { ...p, mirror: false, bone: 'head' }])).toHaveLength(3);
  });

  it('glowing pieces get their own unlit mesh on the bone', () => {
    const rig = aRig();
    dressBody(rig, {
      note: 'eyes',
      pieces: [
        { bone: 'head', shape: 'box', size: [0.2, 0.2, 0.2], at: [0, 0.45, 0], color: 0x444444 },
        { bone: 'head', shape: 'box', size: [0.03, 0.03, 0.02], at: [0.05, 0.47, 0.1], color: 0xff3300, glow: true, mirror: true },
      ],
    });
    const head = rig.getObjectByName('head')!;
    const names = head.children.filter((o) => (o as THREE.Mesh).isMesh).map((o) => o.name).sort();
    expect(names).toEqual(['body-head', 'body-head-glow']);
    const glow = head.getObjectByName('body-head-glow') as THREE.Mesh;
    expect((glow.material as THREE.Material).type).toBe('MeshBasicMaterial');
    expect(glow.geometry.getAttribute('position').count).toBe(2 * 36);
  });

  it.each(TOWNS.filter((t) => t.looks).map((t) => [t.id, t.looks!] as const))('%s: every town look is a designed body on a known rig', (_, looks) => {
    for (const [kind, sheet] of Object.entries(looks)) {
      expect(MONSTERS[kind as keyof typeof MONSTERS], kind).toBeDefined();
      expect(BODIES[sheet!], sheet).toBeDefined();
      expect(CHARACTER_MODELS[sheet!], sheet).toBeDefined();
    }
  });

  it("a town look swaps the body and drops the kind's tint and pallor", () => {
    const { monsters: [orc] } = aWorld().withMonster('orc', 5, 5).build();
    const plain = lookFor(orc, 'sword');
    const swapped = lookFor(orc, 'sword', undefined, undefined, { orc: 'frogfolk' });
    expect(plain.sheet).toBe('orc');
    expect(swapped).toMatchObject({ sheet: 'frogfolk', tint: 0xffffff, pallor: 0, scale: plain.scale });
    expect(swapped.key).not.toBe(plain.key);
  });

  it('works on rigs whose bones are meshes themselves (graveyard models): bones stay, their meshes go', () => {
    const rig = aRig(true);
    dressBody(rig, { note: 'x', pieces: [{ bone: 'head', shape: 'rbox', size: [0.2, 0.2, 0.2], at: [0, 0.5, 0], color: PALETTE.green }] });
    const meshes: THREE.Mesh[] = [];
    rig.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.map((m) => m.name)).toEqual(['body-head']);
    for (const b of ['root', 'torso', 'head', 'arm-left', 'leg-right']) expect(rig.getObjectByName(b), b).toBeDefined();
    // Still nested: the head moves with the torso.
    expect(rig.getObjectByName('head')!.parent!.name).toBe('torso');
  });

  it('a piece on a bone the rig lacks is an error', () => {
    const rig = new THREE.Group();
    expect(() => dressBody(rig, { note: 'x', pieces: [{ bone: 'head', shape: 'box', size: [1, 1, 1], at: [0, 0, 0], color: 0 }] })).toThrow(/head/);
  });
});
