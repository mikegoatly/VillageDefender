// Copies the subset of Kenney assets the game uses into the repo.
// Kenney assets are CC0, so copies are committed; this script documents provenance
// and makes re-importing (or adding packs) repeatable.
//
// Usage: KENNEY_ROOT="<path to your Kenney Game Assets folder>" npm run import-assets

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.KENNEY_ROOT;

if (!root) {
  console.error('Set KENNEY_ROOT to your local Kenney Game Assets folder.');
  process.exit(1);
}
if (!existsSync(root)) {
  console.error(`Kenney asset root not found: ${root}`);
  process.exit(1);
}

/** 3D models → public/assets/models/<dest> (loaded by the game at runtime). */
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
      // Town props (role buildings, ruins).
      'cross', 'candle-multiple', 'debris', 'debris-wood',
      // Graveyard theme (Town 3) decor and scatter.
      'pine', 'pine-crooked', 'pine-fall', 'pine-fall-crooked',
      'gravestone-bevel', 'gravestone-broken', 'gravestone-cross', 'gravestone-cross-large',
      'gravestone-round', 'gravestone-wide', 'gravestone-decorative', 'gravestone-debris',
      'grave', 'coffin', 'fire-basket', 'lightpost-single', 'pillar-obelisk', 'pumpkin-carved',
      'crypt-small', 'iron-fence-border', 'hay-bale',
    ],
  },
  {
    src: '3D assets/Mini Characters/Models/GLB format',
    dest: 'mini-characters',
    files: ['character-male-a', 'character-female-b'],
  },
  {
    src: '3D assets/Mini Forest/Models/GLB format',
    dest: 'mini-forest',
    files: ['character-archer', 'weapon-bow', 'weapon-arrow', 'bridge', 'plant'],
  },
  {
    src: '3D assets/Mini Arena/Models/GLB format',
    dest: 'mini-arena',
    files: ['character-soldier', 'weapon-sword', 'weapon-spear', 'weapon-rack'],
  },
  {
    src: 'Early access/Medieval Weapons/Models/GLB format',
    dest: 'medieval-weapons',
    files: ['hammer-a', 'hammer-b', 'axe-single', 'axe-single-long', 'club-a'],
  },
  {
    src: '3D assets/Fantasy Town Kit/Models/GLB format',
    dest: 'fantasy-town',
    files: [
      'wall', 'wall-door', 'wall-window-shutters', 'wall-corner',
      'wall-wood', 'wall-wood-door', 'wall-wood-window-shutters', 'wall-wood-corner',
      'roof-gable', 'roof-gable-end', 'roof-point', 'roof-high-point', 'roof',
      'tree', 'tree-high', 'fence', 'road', 'chimney', 'lantern', 'stall-red',
      'wall-broken', 'wall-wood-broken', 'wall-half', 'wall-wood-half', 'roof-high-gable', 'banner-red',
    ],
  },
  {
    src: '3D assets/Castle Kit/Models/GLB format',
    dest: 'castle',
    files: ['flag', 'flag-pennant', 'tower-square-top', 'tower-square-top-roof'],
  },
  {
    src: '3D assets/Survival Kit/Models/GLB format',
    dest: 'survival',
    files: ['workbench-anvil', 'grass', 'grass-large', 'resource-planks'],
  },
];

const modelOut = 'public/assets/models';
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

/**
 * Audio (Kenney, CC0) → public/assets/audio/<id>-<n>.ogg plus manifest.json.
 * Each entry: logical sound id → [pack/subfolder, filename] sources, copied flat.
 */
const audioRoot = join(root, 'Audio');
const F = 'Foley Sounds/Audio';
const I = 'Impact Sounds/Audio';
const R1 = 'Retro Sounds 1/Audio';
const R2 = 'Retro Sounds 2/Audio';
const J = 'Music Jingles';
const sounds = {
  swing: [[`${F}/Woosh`, 'woosh1'], [`${F}/Woosh`, 'woosh2'], [`${F}/Woosh`, 'woosh3']],
  hit: [[`${F}/Swords`, 'hitHelmet1'], [`${F}/Swords`, 'hitHelmet2'], [`${F}/Swords`, 'hitHelmet3']],
  hitHeavy: [[I, 'impactPlate_heavy_000'], [I, 'impactPlate_heavy_001'], [I, 'impactPunch_heavy_000']],
  throw: [[`${F}/Woosh`, 'woosh4'], [`${F}/Woosh`, 'woosh5']],
  monsterDie: [[I, 'impactSoft_heavy_000'], [I, 'impactSoft_heavy_001'], [I, 'impactPunch_medium_001']],
  knightHurt: [[R2, 'hurt1'], [R2, 'hurt2']],
  knightDie: [[R2, 'lose1']],
  buildingHit: [[I, 'impactWood_heavy_000'], [I, 'impactWood_heavy_001'], [I, 'impactWood_heavy_002']],
  buildingCollapse: [[R2, 'explosion1'], [R2, 'explosion2'], [`${F}/Rocks`, 'stonesHit1']],
  gem: [[R2, 'coin1'], [R2, 'coin2']],
  levelUp: [[`${J}/Audio (Retro)`, 'jingles-retro_00']],
  upgradePick: [['Interface Sounds/Audio', 'confirmation_002']],
  uiClick: [['Interface Sounds/Audio', 'click_002'], ['Interface Sounds/Audio', 'click_003']],
  rookieJoin: [[`${J}/Audio (Steeldrum)`, 'jingles-steel_03']],
  rally: [[`${J}/Audio (Hit)`, 'jingles-hit_06']],
  arrow: [[`${F}/Woosh`, 'woosh7'], [`${F}/Woosh`, 'woosh8']],
  waveWarning: [[I, 'impactBell_heavy_000'], [I, 'impactBell_heavy_001']],
  bossArrive: [[R1, 'rumble1'], [R1, 'creature3']],
  bossSlamWarn: [[R1, 'rumble2']],
  bossSlam: [[R2, 'explosion3'], [I, 'impactMetal_heavy_001']],
  bossCharge: [[R1, 'creature4'], [R1, 'rumble3']],
  win: [[`${J}/Audio (Hit)`, 'jingles-hit_10']],
  lose: [[R2, 'gameover1']],
};
const music = {
  plan: ['Music Loops/Loops', 'Farm Frolics'],
  play: ['Music Loops/Loops', 'Mission Plausible'],
};

const audioOut = 'public/assets/audio';
mkdirSync(audioOut, { recursive: true });
const manifest = { sounds: {}, music: {} };
let audioCount = 0;
for (const [id, srcs] of Object.entries(sounds)) {
  manifest.sounds[id] = srcs.map(([dir, name], i) => {
    const out = `${id}-${i + 1}.ogg`;
    cpSync(join(audioRoot, dir, `${name}.ogg`), join(audioOut, out));
    audioCount++;
    return out;
  });
}
for (const [track, [dir, name]] of Object.entries(music)) {
  const out = `music-${track}.ogg`;
  cpSync(join(audioRoot, dir, `${name}.ogg`), join(audioOut, out));
  manifest.music[track] = out;
  audioCount++;
}
writeFileSync(join(audioOut, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`audio: ${audioCount} files`);

/**
 * Input prompt glyphs (Kenney Input Prompts, CC0) → public/assets/ui/prompts/<style>/<name>.svg.
 * Logical names follow the Gamepad API standard mapping positions (a = bottom face,
 * b = right, x = left, y = top), so Switch maps a→B etc. to show the matching physical label.
 */
const promptPacks = {
  xbox: {
    pack: 'Xbox Series',
    glyphs: {
      a: 'xbox_button_color_a', b: 'xbox_button_color_b', x: 'xbox_button_color_x', y: 'xbox_button_color_y',
      lb: 'xbox_lb', rb: 'xbox_rb', start: 'xbox_button_menu', back: 'xbox_button_view',
      dpad: 'xbox_dpad', stick: 'xbox_stick_l',
    },
  },
  ps: {
    pack: 'PlayStation Series',
    glyphs: {
      a: 'playstation_button_color_cross', b: 'playstation_button_color_circle',
      x: 'playstation_button_color_square', y: 'playstation_button_color_triangle',
      lb: 'playstation_trigger_l1', rb: 'playstation_trigger_r1',
      start: 'playstation5_button_options', back: 'playstation5_button_create',
      dpad: 'playstation_dpad', stick: 'playstation_stick_l',
    },
  },
  switch: {
    pack: 'Nintendo Switch',
    glyphs: {
      a: 'switch_button_b', b: 'switch_button_a', x: 'switch_button_y', y: 'switch_button_x',
      lb: 'switch_button_l', rb: 'switch_button_r', start: 'switch_button_plus', back: 'switch_button_minus',
      dpad: 'switch_dpad', stick: 'switch_stick_l',
    },
  },
};

let promptCount = 0;
for (const [style, { pack, glyphs }] of Object.entries(promptPacks)) {
  const dest = join('public/assets/ui/prompts', style);
  mkdirSync(dest, { recursive: true });
  for (const [name, file] of Object.entries(glyphs)) {
    cpSync(join(root, 'Icons/Input Prompts', pack, 'Vector', `${file}.svg`), join(dest, `${name}.svg`));
    promptCount++;
  }
}
console.log(`prompts: ${promptCount} files`);
