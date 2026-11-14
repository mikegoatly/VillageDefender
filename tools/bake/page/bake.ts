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
  type Direction,
  type SheetMeta,
  type StaticSpec,
} from './types';

const SUPERSAMPLE = 2;
const MAX_SHEET_WIDTH = 4096;

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

/** Draws `frame` onto `ctx` at (x, y) with a solid outline behind it. */
function drawOutlined(ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, x: number, y: number, g: BakeGlobals) {
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
      ctx.drawImage(sil, x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    }
  }
  ctx.drawImage(frame, x, y);
}

function makeSheet(frames: HTMLCanvasElement[], w: number, h: number, g: BakeGlobals) {
  const columns = Math.max(1, Math.min(frames.length, Math.floor(MAX_SHEET_WIDTH / w)));
  const rows = Math.ceil(frames.length / columns);
  const sheet = document.createElement('canvas');
  sheet.width = columns * w;
  sheet.height = rows * h;
  const ctx = sheet.getContext('2d')!;
  frames.forEach((f, i) => drawOutlined(ctx, f, (i % columns) * w, Math.floor(i / columns) * h, g));
  return { png: sheet.toDataURL('image/png'), columns };
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
  const anims: NonNullable<SheetMeta['anims']> = {};

  for (const anim of spec.anims) {
    const clip = gltf.animations.find((c) => c.name === anim.clip);
    if (!clip) throw new Error(`${spec.name}: clip '${anim.clip}' not found`);
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    const start = {} as Record<Direction, number>;
    DIRECTIONS.forEach((dir, di) => {
      start[dir] = frames.length;
      model.rotation.y = facingRotation((di * Math.PI) / 4, g.elevation);
      for (let i = 0; i < anim.frames; i++) {
        const t = anim.loop
          ? (i / anim.frames) * clip.duration
          : (i / Math.max(1, anim.frames - 1)) * clip.duration * 0.999;
        mixer.setTime(t);
        frames.push(renderFrame(scene, cam, w, h));
      }
    });
    anims[anim.name] = { frames: anim.frames, fps: anim.fps, loop: anim.loop, start };
  }

  const { png, columns } = makeSheet(frames, w, h, g);
  return {
    png,
    meta: {
      name: spec.name, image: `${spec.name}.png`,
      frameWidth: w, frameHeight: h, pivotX, pivotY,
      columns, frameCount: frames.length,
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
  for (let v = 0; v < spec.views; v++) {
    group.rotation.y = (v * Math.PI) / 2;
    frames.push(renderFrame(scene, cam, w, h));
  }
  const { png, columns } = makeSheet(frames, w, h, g);
  return {
    png,
    meta: {
      name: spec.name, image: `${spec.name}.png`,
      frameWidth: w, frameHeight: h, pivotX, pivotY,
      columns, frameCount: frames.length, views: spec.views,
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
