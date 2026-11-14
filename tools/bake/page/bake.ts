// Renders Kenney GLB models into isometric sprite sheets.
// Driven by tools/bake/run.mjs through Playwright: run.mjs calls window.bake(globals, spec).

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  DIRECTIONS,
  type BakeGlobals,
  type BakeResult,
  type BakeSpec,
  type CharacterSpec,
  type SheetMeta,
  type StaticSpec,
} from './types';

const SUPERSAMPLE = 2;
const MAX_SHEET_SIZE = 4096;
const ALPHA_THRESHOLD = 8;
const SPACING = 2;
const TRIM_PADDING = 2;

const loader = new GLTFLoader();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(SUPERSAMPLE);
document.body.appendChild(renderer.domElement);

function loadModel(path: string): Promise<GLTF> {
  return loader.loadAsync(`/assets-src/models/${path}.glb`);
}

/** Unit vectors on the ground plane for screen-right and screen-down. */
const GROUND_RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const GROUND_DOWN = new THREE.Vector3(1, 0, 1).normalize();

function makeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  // Light from upper-left of the screen, slightly in front, like the Sketch tiles.
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
  sun.position.copy(GROUND_DOWN.clone().multiplyScalar(0.6).sub(GROUND_RIGHT.clone().multiplyScalar(1)).add(new THREE.Vector3(0, 2, 0)));
  scene.add(sun);
  return scene;
}

function makeCamera(g: BakeGlobals, w: number, h: number, pivotX: number, pivotY: number) {
  const ppu = g.pixelsPerUnit;
  const cam = new THREE.OrthographicCamera(
    -pivotX / ppu, (w - pivotX) / ppu,
    pivotY / ppu, -(h - pivotY) / ppu,
    0.1, 200,
  );
  const e = g.elevation;
  const dist = 50;
  cam.position.set((Math.cos(e) / Math.SQRT2) * dist, Math.sin(e) * dist, (Math.cos(e) / Math.SQRT2) * dist);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  return cam;
}

/** Y rotation that makes a +Z-facing model appear to face screen angle `screenAngle` (y down). */
function facingRotation(screenAngle: number, elevation: number): number {
  const u = Math.cos(screenAngle);
  const v = Math.sin(screenAngle) / Math.sin(elevation);
  const g = GROUND_RIGHT.clone().multiplyScalar(u).add(GROUND_DOWN.clone().multiplyScalar(v)).normalize();
  return Math.atan2(g.x, g.z);
}

function renderFrame(scene: THREE.Scene, cam: THREE.Camera, w: number, h: number): HTMLCanvasElement {
  renderer.setSize(w, h, false);
  renderer.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(renderer.domElement, 0, 0, w, h);
  return out;
}

/** Returns a new canvas of the same size as `frame` with a solid outline behind it. */
function outlined(frame: HTMLCanvasElement, g: BakeGlobals): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = frame.width;
  out.height = frame.height;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  const { radius, color } = g.outline;
  if (radius > 0) {
    const sil = document.createElement('canvas');
    sil.width = frame.width;
    sil.height = frame.height;
    const s = sil.getContext('2d')!;
    s.drawImage(frame, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    s.fillRect(0, 0, sil.width, sil.height);
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.drawImage(sil, Math.cos(a) * radius, Math.sin(a) * radius);
    }
  }
  ctx.drawImage(frame, 0, 0);
  return out;
}

interface Rect { x: number; y: number; w: number; h: number }

/** Alpha bounds (alpha > ALPHA_THRESHOLD) of a frame, padded and clamped. Empty frames give a 1x1 rect. */
function frameBounds(f: HTMLCanvasElement): Rect {
  const w = f.width;
  const h = f.height;
  const d = f.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.max(0, minX - TRIM_PADDING);
  const y0 = Math.max(0, minY - TRIM_PADDING);
  const x1 = Math.min(w, maxX + 1 + TRIM_PADDING);
  const y1 = Math.min(h, maxY + 1 + TRIM_PADDING);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Shelf-packs rects (tallest first) into a sheet of the given width; returns positions and height. */
function shelfPack(sizes: { w: number; h: number }[], width: number) {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b].h - sizes[a].h);
  const pos: { x: number; y: number }[] = new Array(sizes.length);
  let x = 0, y = 0, rowH = 0;
  for (const i of order) {
    const w = sizes[i].w + SPACING;
    const h = sizes[i].h + SPACING;
    if (w > width) return undefined;
    if (x + w > width) { x = 0; y += rowH; rowH = 0; }
    pos[i] = { x, y };
    x += w;
    rowH = Math.max(rowH, h);
  }
  return { pos, height: y + rowH };
}

/** Outlines every frame, trims each to its own bounds and packs them into one atlas image + TexturePacker JSON. */
function makeAtlas(
  frames: HTMLCanvasElement[], names: string[], cellW: number, cellH: number, g: BakeGlobals, sheetName: string,
) {
  const outlinedFrames = frames.map((f) => outlined(f, g));
  const bounds = outlinedFrames.map(frameBounds);
  const total = bounds.reduce((sum, b) => sum + (b.w + SPACING) * (b.h + SPACING), 0);
  const maxW = Math.max(...bounds.map((b) => b.w + SPACING));

  let best: { width: number; height: number; pos: { x: number; y: number }[] } | undefined;
  const start = Math.max(maxW, Math.ceil(Math.sqrt(total) / 64) * 64);
  for (let width = start; width <= MAX_SHEET_SIZE; width += 64) {
    const r = shelfPack(bounds, width);
    if (!r || r.height > MAX_SHEET_SIZE) continue;
    if (!best || width * r.height < best.width * best.height) best = { width, height: r.height, pos: r.pos };
  }
  if (!best) throw new Error(`${sheetName}: ${frames.length} frames cannot be packed into ${MAX_SHEET_SIZE}x${MAX_SHEET_SIZE}`);

  // Shrink to the used extent.
  let usedW = 1, usedH = 1;
  bounds.forEach((b, i) => {
    usedW = Math.max(usedW, best!.pos[i].x + b.w);
    usedH = Math.max(usedH, best!.pos[i].y + b.h);
  });
  const sheet = document.createElement('canvas');
  sheet.width = usedW;
  sheet.height = usedH;
  const ctx = sheet.getContext('2d')!;
  const atlasFrames: Record<string, unknown> = {};
  outlinedFrames.forEach((f, i) => {
    const b = bounds[i];
    const p = best!.pos[i];
    ctx.drawImage(f, b.x, b.y, b.w, b.h, p.x, p.y, b.w, b.h);
    atlasFrames[names[i]] = {
      frame: { x: p.x, y: p.y, w: b.w, h: b.h },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: b.x, y: b.y, w: b.w, h: b.h },
      sourceSize: { w: cellW, h: cellH },
    };
  });
  return {
    png: sheet.toDataURL('image/png'),
    atlas: { frames: atlasFrames, meta: { image: `${sheetName}.png`, size: { w: usedW, h: usedH }, scale: '1' } },
  };
}

async function bakeCharacter(g: BakeGlobals, spec: CharacterSpec): Promise<BakeResult> {
  const { cellWidth: w, cellHeight: h, pivotX, pivotY } = g.character;
  const gltf = await loadModel(spec.model);
  const model = gltf.scene;
  if (spec.scale) model.scale.setScalar(spec.scale);

  for (const a of spec.attachments ?? []) {
    const bone = model.getObjectByName(a.bone);
    if (!bone) throw new Error(`${spec.name}: bone '${a.bone}' not found`);
    const part = (await loadModel(a.model)).scene;
    if (a.position) part.position.set(...a.position);
    if (a.rotation) part.rotation.set(...a.rotation);
    if (a.scale) part.scale.setScalar(a.scale);
    bone.add(part);
  }

  const scene = makeScene();
  scene.add(model);
  const cam = makeCamera(g, w, h, pivotX, pivotY);
  const mixer = new THREE.AnimationMixer(model);

  const frames: HTMLCanvasElement[] = [];
  const names: string[] = [];
  const anims: NonNullable<SheetMeta['anims']> = {};

  for (const anim of spec.anims) {
    const clip = gltf.animations.find((c) => c.name === anim.clip);
    if (!clip) throw new Error(`${spec.name}: clip '${anim.clip}' not found`);
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    DIRECTIONS.forEach((dir, di) => {
      model.rotation.y = facingRotation((di * Math.PI) / 4, g.elevation);
      for (let i = 0; i < anim.frames; i++) {
        const t = anim.loop
          ? (i / anim.frames) * clip.duration
          : (i / Math.max(1, anim.frames - 1)) * clip.duration * 0.999;
        mixer.setTime(t);
        frames.push(renderFrame(scene, cam, w, h));
        names.push(`${anim.name}/${dir}/${i}`);
      }
    });
    anims[anim.name] = { frames: anim.frames, fps: anim.fps, loop: anim.loop };
  }

  const sheet = makeAtlas(frames, names, w, h, g, spec.name);
  return {
    png: sheet.png,
    atlas: sheet.atlas,
    meta: {
      name: spec.name, image: `${spec.name}.png`,
      frameWidth: w, frameHeight: h, pivotX, pivotY,
      atlas: `${spec.name}.atlas.json`, pixelsPerUnit: g.pixelsPerUnit, frameCount: frames.length,
      directions: DIRECTIONS, anims,
    },
  };
}

async function bakeStatic(g: BakeGlobals, spec: StaticSpec): Promise<BakeResult> {
  const group = new THREE.Group();
  for (const p of spec.parts) {
    const m = (await loadModel(p.model)).scene;
    if (p.position) m.position.set(...p.position);
    if (p.rotationY) m.rotation.y = p.rotationY;
    if (p.scale) m.scale.setScalar(p.scale);
    group.add(m);
  }
  const scene = makeScene();
  scene.add(group);
  const { cellWidth: w, cellHeight: h, pivotX, pivotY } = spec;
  const cam = makeCamera(g, w, h, pivotX, pivotY);
  const frames: HTMLCanvasElement[] = [];
  const names: string[] = [];
  for (let v = 0; v < spec.views; v++) {
    group.rotation.y = (v * Math.PI) / 2;
    frames.push(renderFrame(scene, cam, w, h));
    names.push(`view/${v}`);
  }
  const sheet = makeAtlas(frames, names, w, h, g, spec.name);
  return {
    png: sheet.png,
    atlas: sheet.atlas,
    meta: {
      name: spec.name, image: `${spec.name}.png`,
      frameWidth: w, frameHeight: h, pivotX, pivotY,
      atlas: `${spec.name}.atlas.json`, pixelsPerUnit: g.pixelsPerUnit, frameCount: frames.length, views: spec.views,
    },
  };
}

async function bake(g: BakeGlobals, spec: BakeSpec): Promise<BakeResult> {
  return spec.kind === 'character' ? bakeCharacter(g, spec) : bakeStatic(g, spec);
}

/** Debug helper: world-space bounding box of a model, for tuning scale. */
async function measure(model: string) {
  const s = (await loadModel(model)).scene;
  const box = new THREE.Box3().setFromObject(s);
  return { min: box.min.toArray(), max: box.max.toArray() };
}

/** Debug helper: world position and mesh bounds of every node, for placing attachments. */
async function inspect(model: string) {
  const s = (await loadModel(model)).scene;
  s.updateMatrixWorld(true);
  const out: Record<string, unknown> = {};
  s.traverse((o) => {
    const p = new THREE.Vector3();
    o.getWorldPosition(p);
    const entry: Record<string, unknown> = { type: o.type, local: o.position.toArray().map((v) => +v.toFixed(3)), world: p.toArray().map((v) => +v.toFixed(3)) };
    if ((o as THREE.Mesh).isMesh) {
      const b = new THREE.Box3().setFromObject(o);
      entry.box = [b.min.toArray().map((v) => +v.toFixed(3)), b.max.toArray().map((v) => +v.toFixed(3))];
    }
    out[o.name || o.uuid.slice(0, 6)] = entry;
  });
  return out;
}

declare global {
  interface Window {
    bake: typeof bake;
    measure: typeof measure;
    inspect: typeof inspect;
    bakeReady: boolean;
  }
}
window.bake = bake;
window.measure = measure;
window.inspect = inspect;
window.bakeReady = true;
