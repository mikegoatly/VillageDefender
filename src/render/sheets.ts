import * as Phaser from 'phaser';

/** Metadata written by tools/bake (mirrors SheetMeta in tools/bake/page/types.ts). */
export interface SheetMeta {
  name: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  pivotX: number;
  pivotY: number;
  columns: number;
  frameCount: number;
  directions?: string[];
  anims?: Record<string, { frames: number; fps: number; loop: boolean; start: Record<string, number> }>;
  views?: number;
}

export const SPRITE_PATH = 'assets/sprites';

/** Queue the JSON for each baked sheet; call loadSheetImages from the JSON's filecomplete. */
export function preloadSheets(scene: Phaser.Scene, names: string[]) {
  for (const n of names) {
    scene.load.json(`${n}-meta`, `${SPRITE_PATH}/${n}.json`);
    scene.load.once(`filecomplete-json-${n}-meta`, (_key: string, _type: string, meta: SheetMeta) => {
      scene.load.spritesheet(n, `${SPRITE_PATH}/${meta.image}`, {
        frameWidth: meta.frameWidth,
        frameHeight: meta.frameHeight,
      });
    });
  }
}

export function sheetMeta(scene: Phaser.Scene, name: string): SheetMeta {
  return scene.cache.json.get(`${name}-meta`) as SheetMeta;
}

/** Creates Phaser animations named `<sheet>:<anim>:<dir>` for a character sheet. */
export function createCharacterAnims(scene: Phaser.Scene, name: string) {
  const meta = sheetMeta(scene, name);
  for (const [anim, info] of Object.entries(meta.anims ?? {})) {
    for (const dir of meta.directions ?? []) {
      const start = info.start[dir];
      scene.anims.create({
        key: `${name}:${anim}:${dir}`,
        frames: scene.anims.generateFrameNumbers(name, { start, end: start + info.frames - 1 }),
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
