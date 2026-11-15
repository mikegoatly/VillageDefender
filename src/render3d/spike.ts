// SPIKE (?look=3d): draws the live sim with the actual Kenney GLB models in three.js instead of
// baked sprites, to judge the look and measure the cost. Not production code:
// - models load from assets-src (copied into the build by vite.config.ts), nothing is instanced, no fx/HUD/audio/menus
// - buildings are assembled from Fantasy Town Kit pieces by a crude rule, not from map data
//
// Params: ?look=3d &seed= &town= &speed= &wave= &god=1 &stress=<monsters> &cs=<char scale> &shadows=0
//         &sil=0 (no occlusion silhouettes) &inst=0 (one object + animation mixer per unit instead of instanced batches)

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DT } from '../data/balance';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { TOWN_BY_ID, TOWNS } from '../data/towns';
import type { WeaponKind } from '../data/weapons';
import { InputManager } from '../input/InputManager';
import { Ground, SIDES, type Building, type TownMap } from '../sim/map';
import { World, type Unit } from '../sim/world';

/** Same camera elevation as the bake and the Sketch tiles, so sim ↔ screen maths is unchanged. */
const ELEVATION = Math.asin(110 / 232);
const MODEL_ROOT = `${import.meta.env.BASE_URL}assets-src/models`;

const CHARACTER_MODELS: Record<string, string> = {
  knight: 'mini-dungeon/character-human',
  orc: 'mini-dungeon/character-orc',
  zombie: 'graveyard/character-zombie',
  skeleton: 'graveyard/character-skeleton',
  ghost: 'graveyard/character-ghost',
  vampire: 'graveyard/character-vampire',
  swordsman: 'mini-arena/character-soldier',
  archer: 'mini-forest/character-archer',
};

interface Attachment { bone: string; model: string; position: [number, number, number]; rotation: [number, number, number]; scale?: number }
// Same offsets as tools/bake/specs.mjs (bind pose is a T-pose).
type Hand = Omit<Attachment, 'model'>;
const RIGHT: Hand = { bone: 'arm-right', position: [-0.27, 0, 0.02], rotation: [Math.PI / 2, 0, 0] };
const LEFT: Hand = { bone: 'arm-left', position: [0.24, 0, 0], rotation: [0, Math.PI / 2, 0] };
const SHIELD: Attachment = { ...LEFT, model: 'mini-dungeon/shield-round', scale: 0.8 };
const KNIGHT_WEAPONS: Record<WeaponKind, Attachment[]> = {
  sword: [{ ...RIGHT, model: 'mini-dungeon/weapon-sword' }, SHIELD],
  spear: [{ ...RIGHT, model: 'mini-dungeon/weapon-spear' }, SHIELD],
  hammer: [{ ...RIGHT, model: 'medieval-weapons/hammer-a', scale: 0.15 }],
  axes: [{ ...RIGHT, model: 'medieval-weapons/axe-single', scale: 0.14 }, SHIELD],
  flail: [{ ...RIGHT, model: 'medieval-weapons/club-a', scale: 0.13 }, SHIELD],
};
const ATTACHMENTS: Record<string, Attachment[]> = {
  orc: [{ ...RIGHT, model: 'mini-dungeon/weapon-spear' }],
  swordsman: [{ ...RIGHT, model: 'mini-arena/weapon-sword' }, { ...SHIELD, scale: 0.6 }],
  archer: [{ ...LEFT, model: 'mini-forest/weapon-bow' }],
};

const TOWN_MODELS = [
  'wall', 'wall-door', 'wall-window-shutters', 'wall-wood', 'wall-wood-door', 'wall-wood-window-shutters',
  'roof-gable', 'roof-point', 'roof-high-point', 'tree', 'stall-red',
].map((m) => `fantasy-town/${m}`);

const HALO_KNIGHT = 0xffd75e;
const HALO_ROOKIE = [0x7fb3e6, 0xb9d6f2, 0xffffff];

interface UnitView {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: string;
  lastStateTime: number;
  halo?: THREE.Mesh;
}

/** Pose tables are sampled at this rate; units pick the nearest frame (no blending). */
const POSE_FPS = 30;
const BATCH_CAPACITY = 512;

/** One animation baked to matrices: frames x parts x 16 floats, relative to the model root. */
interface PoseClip { frames: number; duration: number; loop: boolean; data: Float32Array }

/** Every unit of one model: one InstancedMesh per rigid body part, so a draw call per part. */
interface Batch { parts: THREE.InstancedMesh[]; ghosts: THREE.InstancedMesh[]; clips: Map<string, PoseClip>; count: number }

interface InstancedView { anim: string; t: number; lastStateTime: number; rot: number; halo?: THREE.Mesh }

interface BuildingView {
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  ruined: boolean;
}

export async function startSpike3d(parent: HTMLElement) {
  const q = new URLSearchParams(location.search);
  const num = (k: string, d: number) => Number(q.get(k) ?? d);
  const seed = num('seed', Math.floor(Math.random() * 1e6));
  const stress = num('stress', 0);
  const charScale = num('cs', 1.5);
  const shadows = q.get('shadows') !== '0';
  const instanced = q.get('inst') !== '0';
  const silhouettes = q.get('sil') !== '0';
  let speed = num('speed', 1);
  const town = TOWN_BY_ID[q.get('town') ?? ''] ?? TOWNS[0];

  const world = new World({
    seed, god: q.get('god') === '1' || stress > 0, startWave: num('wave', 1),
    townId: town.id, waves: town.waves, mapOptions: town.map,
  });

  // ---------------------------------------------------------------- renderer, camera, lights
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xd9bfa6);
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const camDir = new THREE.Vector3(Math.cos(ELEVATION) / Math.SQRT2, Math.sin(ELEVATION), Math.cos(ELEVATION) / Math.SQRT2);
  const target = fitTarget(world.map);

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
  // Upper-left of the screen, slightly in front (same as the bake).
  sun.position.set(target.x - 10, 28, target.z + 16);
  sun.target.position.set(target.x, 0, target.z);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -target.reach; sc.right = target.reach; sc.top = target.reach; sc.bottom = -target.reach;
  sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0015;
  scene.add(sun, sun.target);

  function resize() {
    const w = parent.clientWidth || innerWidth;
    const h = parent.clientHeight || innerHeight;
    renderer.setSize(w, h);
    const aspect = w / h;
    const halfH = Math.max(target.halfH, target.halfW / aspect);
    camera.left = -halfH * aspect; camera.right = halfH * aspect;
    camera.top = halfH; camera.bottom = -halfH;
    camera.position.set(target.x, 0, target.z).addScaledVector(camDir, 60);
    camera.lookAt(target.x, 0, target.z);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- assets
  /** Scenery writes stencil 1 where it is visible (see the silhouette materials below). */
  const markOccluder = (m: THREE.Material) => {
    m.stencilWrite = true;
    m.stencilRef = 1;
    m.stencilZPass = THREE.ReplaceStencilOp;
  };
  const loader = new GLTFLoader();
  const gltfs = new Map<string, GLTF>();
  const attachmentModels = [...Object.values(KNIGHT_WEAPONS), ...Object.values(ATTACHMENTS)].flat().map((a) => a.model);
  const paths = new Set([...Object.values(CHARACTER_MODELS), ...attachmentModels, ...TOWN_MODELS]);
  await Promise.all([...paths].map(async (p) => {
    const g = await loader.loadAsync(`${MODEL_ROOT}/${p}.glb`);
    g.scene.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && p.startsWith('fantasy-town/')) markOccluder(mesh.material as THREE.Material);
    });
    gltfs.set(p, g);
  }));
  const piece = (p: string) => gltfs.get(p)!.scene.clone();

  // ---------------------------------------------------------------- ground
  const map = world.map;
  const cells: [number, number, number][] = [];
  for (let j = 0; j < map.size; j++) {
    for (let i = 0; i < map.size; i++) {
      const g = map.ground[j * map.size + i];
      if (g !== Ground.None) cells.push([i, j, g]);
    }
  }
  const groundMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial(), cells.length,
  );
  groundMesh.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  cells.forEach(([i, j, g], n) => {
    m4.makeTranslation(i, g === Ground.Water ? -0.08 : 0, j);
    groundMesh.setMatrixAt(n, m4);
    const onPath = i === map.centre || j === map.centre;
    const base = g === Ground.Water ? 0x5fa8d8 : g === Ground.Bridge ? 0x9a6b44 : onPath ? 0xd8b98a : 0x8fc66a;
    // Checker shading so the grid still reads.
    col.setHex(base).multiplyScalar((i + j) % 2 ? 1 : 0.94);
    groundMesh.setColorAt(n, col);
  });
  scene.add(groundMesh);

  // ---------------------------------------------------------------- buildings and decor
  const buildingViews = map.buildings.map((b) => makeBuilding(b));
  for (const v of buildingViews) scene.add(v.group);

  function makeBuilding(b: Building): BuildingView {
    const group = new THREE.Group();
    const has = (i: number, j: number) => b.cells.some(([ci, cj]) => ci === i && cj === j);
    const tower = b.kind === 'tower';
    const wood = !tower && b.id % 2 === 1;
    const w = wood ? 'fantasy-town/wall-wood' : 'fantasy-town/wall';
    const levels = Math.max(1, Math.max(...b.blocks.map((bl) => bl.level)) - 1) + (tower ? 1 : 0);
    const frontI = Math.max(...b.cells.map(([i]) => i));
    let door = false;
    const put = (model: string, i: number, y: number, j: number, rotY = 0) => {
      const p = piece(model);
      p.position.set(i, y, j);
      p.rotation.y = rotY;
      group.add(p);
    };
    for (const [i, j] of b.cells) {
      for (let l = 0; l < levels; l++) {
        // Fantasy Town walls sit on the +X edge of their cell; +X and +Z faces look at the camera.
        if (!has(i + 1, j)) {
          const isDoor: boolean = !door && l === 0 && i === frontI;
          door ||= isDoor;
          put(isDoor ? `${w}-door` : tower ? w : `${w}-window-shutters`, i, l, j, 0);
        }
        if (!has(i, j + 1)) put(tower ? w : `${w}-window-shutters`, i, l, j, -Math.PI / 2);
        if (!has(i - 1, j)) put(w, i, l, j, Math.PI);
        if (!has(i, j - 1)) put(w, i, l, j, Math.PI / 2);
      }
      put(tower ? 'fantasy-town/roof-high-point' : b.cells.length === 1 ? 'fantasy-town/roof-point' : 'fantasy-town/roof-gable', i, levels, j);
    }
    // Own materials so the building can darken with damage.
    const cloned = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (!cloned.has(src)) cloned.set(src, src.clone());
      mesh.material = cloned.get(src)!;
    });
    return { group, materials: [...cloned.values()], ruined: false };
  }

  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color: 0x9a948c, flatShading: true }));
  rock.castShadow = true;
  markOccluder(rock.material);
  for (const d of map.decor) {
    const spin = ((d.i * 7 + d.j * 13) % 8) * (Math.PI / 4);
    let o: THREE.Object3D;
    if (d.tile.includes('tree')) {
      o = piece('fantasy-town/tree');
      o.scale.setScalar(0.9 + ((d.i * 3 + d.j) % 4) * 0.1);
    } else if (d.tile.includes('well')) o = piece('fantasy-town/stall-red');
    else {
      o = rock.clone();
      o.position.y = 0.15;
    }
    o.position.x = d.i;
    o.position.z = d.j;
    o.rotation.y = d.tile.includes('well') ? 0 : spin;
    scene.add(o);
  }

  // ---------------------------------------------------------------- units
  const views = new Map<number, UnitView>();
  const tinted = new Map<string, THREE.Material>();
  const haloGeo = new THREE.RingGeometry(0.3, 0.42, 28).rotateX(-Math.PI / 2);
  // Occlusion silhouettes (decision 9), pixel-exact via depth-fail + stencil:
  //   buildings/decor write stencil 1 where visible, units write 0 where visible, so stencil 1
  //   means "scenery is the nearest thing here". A silhouette draws only the part of a unit that
  //   is behind such a pixel, and bumps the stencil so each pixel is painted once.
  const silhouetteMaterial = (color: number) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.55, depthFunc: THREE.GreaterDepth, depthWrite: false,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilZPass: THREE.IncrementStencilOp,
  });
  const SILHOUETTE = { player: silhouetteMaterial(HALO_KNIGHT), enemy: silhouetteMaterial(0xe23b2e) };
  /** Allies win a pixel where an ally and a monster are both hidden. */
  const SILHOUETTE_ORDER = { player: 2, enemy: 3 };

  /** Shared per (source material, tint, alpha) so units of a kind batch state. */
  function materialFor(src: THREE.Material, tint: number, alpha: number): THREE.Material {
    const key = `${src.uuid}:${tint}:${alpha}`;
    let m = tinted.get(key);
    if (!m) {
      const c = (src as THREE.MeshStandardMaterial).clone();
      c.color.multiply(new THREE.Color(tint));
      if (alpha < 1) { c.transparent = true; c.opacity = alpha; }
      c.stencilWrite = true;
      c.stencilRef = 0;
      c.stencilZPass = THREE.ReplaceStencilOp;
      tinted.set(key, (m = c));
    }
    return m;
  }

  function attach(model: THREE.Object3D, attachments: Attachment[]) {
    for (const a of attachments) {
      const bone = model.getObjectByName(a.bone);
      if (!bone) continue;
      const part = piece(a.model);
      part.position.set(...a.position);
      part.rotation.set(...a.rotation);
      if (a.scale) part.scale.setScalar(a.scale);
      bone.add(part);
    }
  }

  const clipNames = (sheet: string): Record<string, string> => ({
    idle: 'idle', walk: 'walk', sprint: 'sprint', die: 'die',
    attack: sheet === 'archer' ? 'holding-both-shoot' : 'attack-melee-right',
  });
  const animFor = (u: Unit) =>
    u.state === 'dead' ? 'die' : u.state === 'attack' ? 'attack' : u.state === 'dodge' ? 'sprint' : u.moving ? 'walk' : 'idle';
  const sheetFor = (u: Unit) => (u.team === 'enemy' ? MONSTERS[u.kind as MonsterKind].sheet : u.kind);

  function makeHalo(u: Unit): THREE.Mesh {
    const knight = u.kind === 'knight';
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: knight ? HALO_KNIGHT : HALO_ROOKIE[u.rank], transparent: true, opacity: 0.8, depthWrite: false }));
    halo.position.y = 0.03;
    halo.scale.setScalar(knight ? 1.3 : 1);
    return halo;
  }

  // ---- instanced path: every Mini character is rigid parts (the skinned ones have one bone per
  // vertex and no triangle spanning two bones), so a pose is just one matrix per part.
  const batches = new Map<string, Batch>();
  const instViews = new Map<number, InstancedView>();

  function batchFor(sheet: string, alpha: number, team: Unit['team']): Batch {
    const key = `${sheet}:${alpha}`;
    let batch = batches.get(key);
    if (batch) return batch;
    const gltf = gltfs.get(CHARACTER_MODELS[sheet])!;
    const model = cloneSkinned(gltf.scene);
    attach(model, ATTACHMENTS[sheet] ?? []);
    model.updateMatrixWorld(true);

    const sources: { geometry: THREE.BufferGeometry; material: THREE.Material; pose: (out: THREE.Matrix4) => void }[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = materialFor(mesh.material as THREE.Material, 0xffffff, alpha);
      const skinned = mesh as THREE.SkinnedMesh;
      if (!skinned.isSkinnedMesh) {
        sources.push({ geometry: mesh.geometry, material, pose: (out) => out.copy(mesh.matrixWorld) });
        return;
      }
      // Split the skinned mesh into one index list per bone; vertex data is shared.
      const g = skinned.geometry;
      const joints = g.getAttribute('skinIndex');
      const weights = g.getAttribute('skinWeight');
      const boneOf = (vtx: number) => {
        let best = 0;
        for (let c = 1; c < 4; c++) if (weights.getComponent(vtx, c) > weights.getComponent(vtx, best)) best = c;
        return joints.getComponent(vtx, best);
      };
      const byBone = new Map<number, number[]>();
      const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      for (let t = 0; t < tris; t++) {
        const abc = [0, 1, 2].map((k) => (g.index ? g.index.getX(t * 3 + k) : t * 3 + k));
        const bone = boneOf(abc[0]);
        if (!byBone.has(bone)) byBone.set(bone, []);
        byBone.get(bone)!.push(...abc);
      }
      for (const [bone, index] of byBone) {
        const part = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv']) part.setAttribute(name, g.getAttribute(name));
        part.setIndex(index);
        sources.push({
          geometry: part, material,
          pose: (out) => out.multiplyMatrices(skinned.skeleton.bones[bone].matrixWorld, skinned.skeleton.boneInverses[bone]).multiply(skinned.bindMatrix),
        });
      }
    });

    // Bake each clip to a table of part matrices; no AnimationMixer runs after this.
    const mixer = new THREE.AnimationMixer(model);
    const clips = new Map<string, PoseClip>();
    const tmp = new THREE.Matrix4();
    for (const [name, clipName] of Object.entries(clipNames(sheet))) {
      const clip = gltf.animations.find((c) => c.name === clipName);
      if (!clip) continue;
      const loop = name !== 'die' && name !== 'attack';
      const frames = Math.ceil(clip.duration * POSE_FPS) + (loop ? 0 : 1);
      const data = new Float32Array(frames * sources.length * 16);
      const action = mixer.clipAction(clip);
      action.play();
      for (let f = 0; f < frames; f++) {
        mixer.setTime(Math.min(f / POSE_FPS, clip.duration * 0.999));
        model.updateMatrixWorld(true);
        sources.forEach((src, p) => {
          src.pose(tmp);
          tmp.toArray(data, (f * sources.length + p) * 16);
        });
      }
      action.stop();
      clips.set(name, { frames, duration: clip.duration, loop, data });
    }

    const parts = sources.map((src) => {
      const im = new THREE.InstancedMesh(src.geometry, src.material, BATCH_CAPACITY);
      im.castShadow = true;
      im.frustumCulled = false;
      im.count = 0;
      im.setColorAt(0, col.setHex(0xffffff));
      scene.add(im);
      return im;
    });
    // Silhouette twins share geometry and the instance matrix buffer: no extra CPU per unit.
    const ghosts = !silhouettes ? [] : parts.map((im) => {
      const ghost = new THREE.InstancedMesh(im.geometry, SILHOUETTE[team], BATCH_CAPACITY);
      ghost.instanceMatrix = im.instanceMatrix;
      ghost.frustumCulled = false;
      ghost.renderOrder = SILHOUETTE_ORDER[team];
      ghost.count = 0;
      scene.add(ghost);
      return ghost;
    });
    batches.set(key, (batch = { parts, ghosts, clips, count: 0 }));
    return batch;
  }

  const unitM = new THREE.Matrix4();
  const partM = new THREE.Matrix4();
  const outM = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function syncInstanced(u: Unit, dt: number) {
    const def = u.team === 'enemy' ? MONSTERS[u.kind as MonsterKind] : null;
    const batch = batchFor(sheetFor(u), def?.alpha ?? 1, u.team);
    let v = instViews.get(u.id);
    if (!v) {
      v = { anim: '', t: 0, lastStateTime: 0, rot: Math.atan2(u.facing.x, u.facing.y) };
      if (u.team === 'player') scene.add((v.halo = makeHalo(u)));
      instViews.set(u.id, v);
    }
    const anim = animFor(u);
    const restart = anim === 'attack' && u.stateTime < v.lastStateTime;
    v.lastStateTime = u.stateTime;
    if (anim !== v.anim || restart) {
      v.anim = anim;
      // Spread loop phases so a crowd doesn't march in step.
      v.t = anim === 'walk' || anim === 'idle' ? (u.id * 0.37) % 1 : 0;
    } else v.t += dt;
    const want = Math.atan2(u.facing.x, u.facing.y);
    v.rot += Math.atan2(Math.sin(want - v.rot), Math.cos(want - v.rot)) * Math.min(1, dt * 16);
    if (v.halo) {
      v.halo.position.set(u.x, 0.03, u.y);
      v.halo.visible = u.state !== 'dead';
      (v.halo.material as THREE.MeshBasicMaterial).color.setHex(HALO_ROOKIE[u.rank]);
    }

    const n = batch.count;
    if (n >= BATCH_CAPACITY) return;
    batch.count++;
    const clip = batch.clips.get(anim) ?? batch.clips.get('idle')!;
    const time = clip.loop ? v.t % clip.duration : v.t;
    const frame = Math.min(clip.frames - 1, Math.floor(time * POSE_FPS));
    const np = batch.parts.length;
    unitM.compose(pos.set(u.x, 0, u.y), quat.setFromAxisAngle(UP, v.rot), scl.setScalar(charScale * (def?.scale ?? 1) * (1 + 0.06 * u.rank)));
    col.setHex(def?.tint ?? 0xffffff);
    for (let p = 0; p < np; p++) {
      partM.fromArray(clip.data, (frame * np + p) * 16);
      outM.multiplyMatrices(unitM, partM);
      batch.parts[p].setMatrixAt(n, outM);
      batch.parts[p].setColorAt(n, col);
    }
  }

  function flushBatches() {
    for (const b of batches.values()) {
      for (const im of b.parts) {
        im.count = b.count;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
      for (const ghost of b.ghosts) ghost.count = b.count;
    }
  }

  // ---- per-object path: the knight always (stencil silhouette), everyone with ?inst=0.
  function viewFor(u: Unit): UnitView {
    let v = views.get(u.id);
    if (v) return v;
    const def = u.team === 'enemy' ? MONSTERS[u.kind as MonsterKind] : null;
    const sheet = sheetFor(u);
    const gltf = gltfs.get(CHARACTER_MODELS[sheet])!;
    const model = cloneSkinned(gltf.scene);
    const knight = u.kind === 'knight';
    attach(model, knight ? KNIGHT_WEAPONS[world.weapon] : ATTACHMENTS[sheet] ?? []);
    const meshes: THREE.Mesh[] = [];
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    for (const mesh of meshes) {
      mesh.material = materialFor(mesh.material as THREE.Material, def?.tint ?? 0xffffff, def?.alpha ?? 1);
      mesh.frustumCulled = false;
      if (!silhouettes) continue;
      const skinned = mesh as THREE.SkinnedMesh;
      let ghost: THREE.Mesh;
      if (skinned.isSkinnedMesh) {
        const g = new THREE.SkinnedMesh(mesh.geometry, SILHOUETTE[u.team]);
        g.bind(skinned.skeleton, skinned.bindMatrix);
        ghost = g;
      } else ghost = new THREE.Mesh(mesh.geometry, SILHOUETTE[u.team]);
      ghost.position.copy(mesh.position);
      ghost.quaternion.copy(mesh.quaternion);
      ghost.scale.copy(mesh.scale);
      ghost.renderOrder = SILHOUETTE_ORDER[u.team];
      ghost.frustumCulled = false;
      mesh.parent!.add(ghost);
    }
    const root = new THREE.Group();
    root.add(model);
    model.scale.setScalar(charScale * (def?.scale ?? 1));
    scene.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const [name, clipName] of Object.entries(clipNames(sheet))) {
      const clip = gltf.animations.find((c) => c.name === clipName);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      if (name === 'die' || name === 'attack') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions.set(name, action);
    }
    v = { root, mixer, actions, current: '', lastStateTime: 0 };
    if (u.team === 'player') root.add((v.halo = makeHalo(u)));
    root.rotation.y = Math.atan2(u.facing.x, u.facing.y);
    views.set(u.id, v);
    return v;
  }

  function syncUnits(dt: number) {
    const live = new Set<number>();
    for (const b of batches.values()) b.count = 0;
    for (const list of [world.players, world.rookies, world.monsters]) {
      for (const u of list) {
        live.add(u.id);
        if (instanced && u.kind !== 'knight') {
          syncInstanced(u, dt);
          continue;
        }
        const v = viewFor(u);
        v.root.position.set(u.x, 0, u.y);
        // Models face +Z; ground (x, y) is world (x, z). Turn smoothly — no 8-direction snapping.
        const want = Math.atan2(u.facing.x, u.facing.y);
        const diff = Math.atan2(Math.sin(want - v.root.rotation.y), Math.cos(want - v.root.rotation.y));
        v.root.rotation.y += diff * Math.min(1, dt * 16);

        const anim = animFor(u);
        const restart = anim === 'attack' && u.stateTime < v.lastStateTime;
        v.lastStateTime = u.stateTime;
        if (anim !== v.current || restart) {
          const next = v.actions.get(anim);
          const prev = v.actions.get(v.current);
          if (next) {
            next.reset().play();
            if (prev && prev !== next) next.crossFadeFrom(prev, 0.08, false);
            v.current = anim;
          }
        }
        if (v.halo) {
          v.halo.visible = u.state !== 'dead';
          if (u.kind !== 'knight') (v.halo.material as THREE.MeshBasicMaterial).color.setHex(HALO_ROOKIE[u.rank]);
        }
        v.mixer.update(dt);
      }
    }
    for (const [id, v] of views) {
      if (live.has(id)) continue;
      scene.remove(v.root);
      views.delete(id);
    }
    for (const [id, v] of instViews) {
      if (live.has(id)) continue;
      if (v.halo) scene.remove(v.halo);
      instViews.delete(id);
    }
    flushBatches();
  }

  const DAMAGED = new THREE.Color(0x8f6f60);
  function syncBuildings() {
    for (const b of world.buildings) {
      const v = buildingViews[b.id];
      if (!v || v.ruined) continue;
      const frac = Math.max(0, b.hp / b.maxHp);
      for (const m of v.materials) m.color.setHex(0xffffff).lerp(DAMAGED, 1 - frac);
      if (b.ruined) {
        // Placeholder ruin: the kit has broken-wall pieces; a real version would swap them in.
        v.ruined = true;
        v.group.scale.y = 0.22;
        for (const m of v.materials) m.color.setHex(0x6f5a50);
      }
    }
  }

  // ---------------------------------------------------------------- gems
  const MAX_GEMS = 1024;
  const gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0x4fe0a0 }), MAX_GEMS);
  gemMesh.frustumCulled = false;
  scene.add(gemMesh);
  function syncGems(time: number) {
    const n = Math.min(world.gems.length, MAX_GEMS);
    for (let k = 0; k < n; k++) {
      const g = world.gems[k];
      m4.makeRotationY(time * 3 + g.id).setPosition(g.x, 0.18 + Math.sin(time * 4 + g.id) * 0.04, g.y);
      gemMesh.setMatrixAt(k, m4);
    }
    gemMesh.count = n;
    gemMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- loop
  const input = new InputManager({ root: parent });
  const stats = document.createElement('pre');
  stats.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;font:12px/1.35 monospace;color:#fff;background:rgba(40,24,16,.7);border-radius:6px;pointer-events:none;z-index:10';
  document.body.appendChild(stats);

  function spawn(count: number) {
    const kinds: MonsterKind[] = ['zombie', 'orc', 'skeleton', 'zombie', 'ghost', 'vampire'];
    for (let k = 0; k < count; k++) world.debugSpawn(kinds[k % kinds.length], 1, SIDES[k % SIDES.length]);
  }
  if (stress > 0) spawn(stress);

  let last = performance.now();
  let accumulator = 0;
  let frameMs = 16.7;
  let cpuMs = 0;
  let simMs = 0;
  let lastInfo = { calls: 0, triangles: 0 };

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dtReal = Math.min((now - last) / 1000, 0.1);
    last = now;
    const t0 = performance.now();
    accumulator += dtReal * speed;
    let steps = 0;
    while (accumulator >= DT && steps < 8 * Math.max(1, speed)) {
      // No level-up UI in the spike: take the first card.
      if (world.progression.offers) world.chooseUpgrade(0);
      world.tick([input.poll()]);
      accumulator -= DT;
      steps++;
    }
    const t1 = performance.now();
    syncUnits(dtReal * speed);
    syncBuildings();
    syncGems(now / 1000);
    renderer.info.reset();
    renderer.render(scene, camera);
    lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    const t2 = performance.now();

    frameMs += (dtReal * 1000 - frameMs) * 0.05;
    simMs += (t1 - t0 - simMs) * 0.05;
    cpuMs += (t2 - t1 - cpuMs) * 0.05;
    stats.textContent =
      `3D spike  seed ${seed}\n${(1000 / frameMs).toFixed(0)} fps  (frame ${frameMs.toFixed(1)} ms)\n` +
      `sim ${simMs.toFixed(2)} ms  anim+draw ${cpuMs.toFixed(2)} ms (CPU side)\n` +
      `draw calls ${lastInfo.calls}  tris ${(lastInfo.triangles / 1000).toFixed(0)}k\n` +
      `units ${views.size + instViews.size} ${instanced ? 'instanced' : 'per-object'}  wave ${world.wave}/${world.totalWaves}  ${world.status}`;
  }
  requestAnimationFrame(frame);

  (window as unknown as { __vd: Record<string, unknown> }).__vd = {
    world: () => world,
    spawn,
    setSpeed: (s: number) => { speed = s; },
    renderer,
    stats: () => ({
      seed, fps: Math.round(1000 / frameMs), frameMs: +frameMs.toFixed(2), simMs: +simMs.toFixed(2), renderCpuMs: +cpuMs.toFixed(2),
      calls: lastInfo.calls, tris: lastInfo.triangles, units: views.size + instViews.size, instanced, wave: world.wave, status: world.status,
      buildings: `${world.standingBuildings()}/${world.buildings.length}`,
    }),
  };
}

/**
 * Ground point to aim the camera at and the half-extents (world units, camera space) that keep
 * the whole map in view (decision 1: fixed camera).
 */
function fitTarget(map: TownMap) {
  const sinE = Math.sin(ELEVATION);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const side of Object.values(map.edges)) {
    for (const [i, j] of side) {
      const sx = (i - j) / Math.SQRT2;
      const sy = ((i + j) / Math.SQRT2) * sinE;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
  }
  // Room for tall buildings/trees at the top edge and half a cell elsewhere.
  minY -= 2.2; maxY += 0.8; minX -= 0.9; maxX += 0.9;
  const cx = ((minX + maxX) / 2) * Math.SQRT2;
  const cy = (((minY + maxY) / 2) * Math.SQRT2) / sinE;
  return {
    x: (cx + cy) / 2, z: (cy - cx) / 2,
    halfW: (maxX - minX) / 2, halfH: (maxY - minY) / 2,
    reach: Math.max(maxX - minX, (maxY - minY) / sinE) / 2 + 3,
  };
}
