// Copies the subset of Kenney assets the game uses into the repo.
// Kenney assets are CC0, so copies are committed; this script documents provenance
// and makes re-importing (or adding packs) repeatable.
//
// Usage: npm run import-assets            (uses default KENNEY_ROOT)
//        KENNEY_ROOT=... npm run import-assets

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root =
  process.env.KENNEY_ROOT ??
  'Kenney Game Assets';

if (!existsSync(root)) {
  console.error(`Kenney asset root not found: ${root}`);
  process.exit(1);
}

/** 2D tile packs → public/assets/tiles/<dest> (served to the game as-is). */
const tilePacks = [
  { src: '2D assets/Sketch Town/Tiles', dest: 'sketch-town' },
  { src: '2D assets/Sketch Town Expansion/Tiles', dest: 'sketch-town-expansion' },
  { src: '2D assets/Sketch Desert/Tiles', dest: 'sketch-desert' },
];

/** 3D models → assets-src/models/<dest> (bake input only, never served). */
const modelPacks = [
  {
    src: '3D assets/Mini Dungeon/Models/GLB format',
    dest: 'mini-dungeon',
    files: [
      'character-human', 'character-orc',
      'weapon-sword', 'weapon-spear', 'shield-round', 'shield-rectangle',
      'barrel', 'chest', 'coin', 'potion',
    ],
  },
  {
    src: '3D assets/Graveyard Kit/Models/GLB format',
    dest: 'graveyard',
    files: [
      'character-zombie', 'character-skeleton', 'character-ghost', 'character-vampire',
      'character-keeper',
    ],
  },
  {
    src: '3D assets/Mini Characters/Models/GLB format',
    dest: 'mini-characters',
    files: ['character-male-a', 'character-female-b'],
  },
  {
    src: '3D assets/Fantasy Town Kit/Models/GLB format',
    dest: 'fantasy-town',
    files: [
      'wall', 'wall-door', 'wall-window-shutters', 'wall-corner',
      'wall-wood', 'wall-wood-door', 'wall-wood-window-shutters', 'wall-wood-corner',
      'roof-gable', 'roof-gable-end', 'roof-point', 'roof-high-point', 'roof',
      'tree', 'tree-high', 'fence', 'road', 'chimney', 'lantern', 'stall-red',
    ],
  },
];

const tileOut = 'public/assets/tiles';
for (const p of tilePacks) {
  const dest = join(tileOut, p.dest);
  mkdirSync(dest, { recursive: true });
  cpSync(join(root, p.src), dest, { recursive: true });
  console.log(`tiles  ${p.dest}: ${readdirSync(dest).length} files`);
}

const modelOut = 'assets-src/models';
for (const p of modelPacks) {
  const dest = join(modelOut, p.dest);
  mkdirSync(dest, { recursive: true });
  for (const f of p.files) {
    cpSync(join(root, p.src, `${f}.glb`), join(dest, `${f}.glb`));
  }
  // GLBs reference Textures/colormap.png relative to themselves.
  cpSync(join(root, p.src, 'Textures'), join(dest, 'Textures'), { recursive: true });
  console.log(`models ${p.dest}: ${p.files.length} models`);
}
