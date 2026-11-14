// Bake configuration. Types: tools/bake/page/types.ts

/** @type {import('./page/types').BakeGlobals} */
export const globals = {
  // Sketch Town grid diamonds are 232x110 → sin(elevation) = 110/232.
  elevation: Math.asin(110 / 232),
  // Mini characters are ~0.76 units tall → ~80px on screen, against ~216px Sketch blocks.
  pixelsPerUnit: 120,
  outline: { radius: 3, color: [74, 44, 34] },
  character: { cellWidth: 160, cellHeight: 176, pivotX: 80, pivotY: 140 },
};

/** Standard animation set shared by every Kenney "Mini" rig character. */
const STANDARD_ANIMS = [
  { name: 'idle', clip: 'idle', frames: 4, fps: 4, loop: true },
  { name: 'walk', clip: 'walk', frames: 8, fps: 12, loop: true },
  { name: 'attack', clip: 'attack-melee-right', frames: 6, fps: 14, loop: false },
  { name: 'die', clip: 'die', frames: 6, fps: 10, loop: false },
];

// Bind pose is a T-pose: arm bones sit at x=±0.1 and the arms extend ~0.29 along ±X.
// Weapons have their grip at the origin with the blade along +Y; rotate it to point forward (+Z).
const RIGHT_HAND = { bone: 'arm-right', position: [-0.27, 0, 0.02], rotation: [Math.PI / 2, 0, 0] };
// Shields are thin along Z; turn the face outward (+X) on the left forearm.
const LEFT_HAND = { bone: 'arm-left', position: [0.24, 0, 0.0], rotation: [0, Math.PI / 2, 0] };

/** @type {import('./page/types').BakeSpec[]} */
export const specs = [
  {
    kind: 'character', name: 'knight', model: 'mini-dungeon/character-human',
    attachments: [
      { ...RIGHT_HAND, model: 'mini-dungeon/weapon-sword' },
      { ...LEFT_HAND, model: 'mini-dungeon/shield-round', scale: 0.8 },
    ],
    anims: STANDARD_ANIMS,
  },
  {
    kind: 'character', name: 'orc', model: 'mini-dungeon/character-orc',
    attachments: [{ ...RIGHT_HAND, model: 'mini-dungeon/weapon-spear' }],
    anims: STANDARD_ANIMS,
  },
  { kind: 'character', name: 'zombie', model: 'graveyard/character-zombie', anims: STANDARD_ANIMS },
  { kind: 'character', name: 'skeleton', model: 'graveyard/character-skeleton', anims: STANDARD_ANIMS },
  { kind: 'character', name: 'ghost', model: 'graveyard/character-ghost', anims: STANDARD_ANIMS },
  {
    kind: 'character', name: 'rookie', model: 'mini-characters/character-male-a',
    attachments: [{ ...RIGHT_HAND, model: 'mini-dungeon/weapon-sword' }],
    anims: STANDARD_ANIMS,
  },

  // --- Look-test alternative: Fantasy Town Kit buildings baked at the same angle/scale ---
  {
    kind: 'static', name: 'ft-house-stone', views: 1,
    cellWidth: 440, cellHeight: 400, pivotX: 220, pivotY: 290,
    parts: [
      // 2x2 cell house; Fantasy Town walls sit on the +X edge of their 1x1 cell.
      ...houseWalls(2, 2, 'fantasy-town/wall', 'fantasy-town/wall-door', 'fantasy-town/wall-window-shutters'),
      { model: 'fantasy-town/roof-gable', position: [-0.5, 1, -0.5] },
      { model: 'fantasy-town/roof-gable', position: [-0.5, 1, 0.5] },
      { model: 'fantasy-town/roof-gable', position: [0.5, 1, -0.5] },
      { model: 'fantasy-town/roof-gable', position: [0.5, 1, 0.5] },
    ],
  },
  {
    kind: 'static', name: 'ft-house-wood', views: 1,
    cellWidth: 240, cellHeight: 300, pivotX: 120, pivotY: 220,
    parts: [
      ...houseWalls(1, 1, 'fantasy-town/wall-wood', 'fantasy-town/wall-wood-door', 'fantasy-town/wall-wood-window-shutters'),
      { model: 'fantasy-town/roof-point', position: [0, 1, 0] },
    ],
  },
  {
    kind: 'static', name: 'ft-tree', views: 1,
    cellWidth: 200, cellHeight: 340, pivotX: 100, pivotY: 290,
    parts: [{ model: 'fantasy-town/tree-high' }],
  },
];

/**
 * Perimeter walls for a w x d cell house centred on the origin.
 * Doors face screen-down-right (+X side), windows elsewhere.
 */
function houseWalls(w, d, wall, door, window) {
  const parts = [];
  const ox = -(w - 1) / 2;
  const oz = -(d - 1) / 2;
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const x = ox + i;
      const z = oz + j;
      // rotationY: 0 → +X edge, PI/2 → -Z edge, PI → -X edge, -PI/2 → +Z edge
      if (i === w - 1) parts.push({ model: j === 0 ? door : window, position: [x, 0, z], rotationY: 0 });
      if (i === 0) parts.push({ model: wall, position: [x, 0, z], rotationY: Math.PI });
      if (j === d - 1) parts.push({ model: window, position: [x, 0, z], rotationY: -Math.PI / 2 });
      if (j === 0) parts.push({ model: wall, position: [x, 0, z], rotationY: Math.PI / 2 });
    }
  }
  return parts;
}
