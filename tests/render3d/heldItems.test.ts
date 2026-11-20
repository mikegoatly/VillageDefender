// Boss weapons (render3d/bodies/bosses.ts HELD_ITEMS) never pass through the head, hat, helm, horns
// or crown at any frame of the clips a boss plays (idle, walk, attack at 60 fps, straight from the GLB).

import { describe, expect, it } from 'vitest';
import { BODIES, expandPieces } from '../../src/render3d/bodies';
import { HELD_ITEMS } from '../../src/render3d/bodies/bosses';
import { CHARACTER_MODELS, clipNames } from '../../src/render3d/characters';
import { headHits } from '../helpers/rigPose';

describe('boss held items', () => {
  it.each(Object.keys(HELD_ITEMS))('%s: the weapon never passes through the head in idle, walk or attack', (sheet) => {
    const clips = clipNames(sheet);
    const { grip, pieces } = HELD_ITEMS[sheet];
    for (const p of pieces) expect(p.bone).toBe('arm-right');
    // Points in the fist (within 0.1 of the grip) are skipped: the rig itself brings the hand close to the head.
    expect(headHits(CHARACTER_MODELS[sheet], expandPieces(BODIES[sheet].pieces), pieces, [clips.idle, clips.walk, clips.attack], { at: grip, radius: 0.1 })).toEqual([]);
  });
});
