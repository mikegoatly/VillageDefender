import * as Phaser from 'phaser';

/** Metadata written by tools/bake (mirrors SheetMeta in tools/bake/page/types.ts). */
export interface SheetMeta {
  name: string;
  image: string;
  /** Phaser JSON-hash atlas with per-frame trim. */
  atlas: string;
  /** Untrimmed working cell size; frames are rebuilt to this size by Phaser. */
  frameWidth: number;
  frameHeight: number;
  /** Ground origin inside the cell. */
  pivotX: number;
  pivotY: number;
  pixelsPerUnit: number;
  frameCount: number;
  directions?: string[];
  anims?: Record<string, { frames: number; fps: number; loop: boolean }>;
  views?: number;
}

export const SPRITE_PATH = 'assets/sprites';

/** Queue each baked sheet: meta JSON first, then its atlas once the meta is known. */
export function preloadSheets(scene: Phaser.Scene, names: string[]) {
  for (const n of names) {
    scene.load.json(`${n}-meta`, `${SPRITE_PATH}/${n}.json`);
    scene.load.once(`filecomplete-json-${n}-meta`, (_key: string, _type: string, meta: SheetMeta) => {
      scene.load.atlas(n, `${SPRITE_PATH}/${meta.image}`, `${SPRITE_PATH}/${meta.atlas}`);
    });
  }
}

export function sheetMeta(scene: Phaser.Scene, name: string): SheetMeta {
  return scene.cache.json.get(`${name}-meta`) as SheetMeta;
}

/** Origin that puts the sprite's position at the baked ground pivot. */
export function sheetOrigin(meta: SheetMeta): [number, number] {
  return [meta.pivotX / meta.frameWidth, meta.pivotY / meta.frameHeight];
}

/** Frame name of a static sheet's view. */
export function staticFrame(view = 0): string {
  return `view/${view}`;
}

/** Creates Phaser animations named `<sheet>:<anim>:<dir>` for a character sheet. */
export function createCharacterAnims(scene: Phaser.Scene, name: string) {
  const meta = sheetMeta(scene, name);
  for (const [anim, info] of Object.entries(meta.anims ?? {})) {
    for (const dir of meta.directions ?? []) {
      const key = `${name}:${anim}:${dir}`;
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: Array.from({ length: info.frames }, (_, i) => ({ key: name, frame: `${anim}/${dir}/${i}` })),
        frameRate: info.fps,
        repeat: info.loop ? -1 : 0,
      });
    }
  }
}

const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/** Nearest of the 8 baked facings for a screen-space vector (y down). */
export function directionFor(dx: number, dy: number): string {
  const a = Math.atan2(dy, dx);
  const i = Math.round(a / (Math.PI / 4));
  return DIRS[(i + 8) % 8];
}
