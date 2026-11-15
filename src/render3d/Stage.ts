// The WebGL canvas, camera and lights. Lives for the whole app; each play session's renderer adds
// its own objects under `scene` and removes them when it is destroyed.

import * as THREE from 'three';
import type { Vec2 } from '../sim/types';
import { CAMERA_DIR, frustumFor, type View } from './camera';

export interface StageOptions {
  shadows: boolean;
  /** Cap on devicePixelRatio (lower = cheaper on phones). */
  maxPixelRatio: number;
}

export interface DrawInfo {
  calls: number;
  triangles: number;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
  private view: View | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly basePosition = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly shakeUp = new THREE.Vector3();
  private shakeLeft = 0;
  private shakeIntensity = 0;

  constructor(private readonly parent: HTMLElement, opts: StageOptions) {
    // Stencil is needed for the occlusion silhouettes.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, opts.maxPixelRatio));
    this.renderer.setClearColor(0xd9bfa6);
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.style.display = 'block';
    parent.prepend(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    // Upper-left of the screen and slightly in front, like the Sketch tiles and the bake.
    this.sun.castShadow = opts.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);

    addEventListener('resize', this.resize);
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Frames this ground area (a new town). */
  setView(view: View) {
    this.view = view;
    this.sun.position.set(view.x - 10, 28, view.z + 16);
    this.sun.target.position.set(view.x, 0, view.z);
    const sc = this.sun.shadow.camera;
    sc.left = -view.reach; sc.right = view.reach; sc.top = view.reach; sc.bottom = -view.reach;
    sc.near = 1; sc.far = 90;
    sc.updateProjectionMatrix();
    this.resize();
  }

  render(dt = 0): DrawInfo {
    this.applyShake(dt);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  /** Screen shake like Phaser's camera.shake: `intensity` is a fraction of the view size. */
  shake(ms: number, intensity: number) {
    this.shakeLeft = Math.max(this.shakeLeft, ms / 1000);
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  /** CSS pixel position (relative to the canvas) of a world point. */
  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = this.projected.set(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.canvas.clientWidth, y: ((1 - v.y) / 2) * this.canvas.clientHeight };
  }

  private applyShake(dt: number) {
    if (!this.view) return;
    const base = this.basePosition;
    if (this.shakeLeft <= 0) {
      if (this.shakeIntensity > 0) {
        this.shakeIntensity = 0;
        this.camera.position.copy(base);
      }
      return;
    }
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    const amp = this.shakeIntensity * (this.camera.top - this.camera.bottom);
    const right = this.projected.set(1, 0, -1).normalize();
    const up = this.shakeUp.crossVectors(CAMERA_DIR, right).normalize();
    this.camera.position.copy(base)
      .addScaledVector(right, (Math.random() * 2 - 1) * amp)
      .addScaledVector(up, (Math.random() * 2 - 1) * amp);
  }

  /** Screen pixels per world unit. */
  pixelsPerUnit(): number {
    return this.canvas.clientHeight / (this.camera.top - this.camera.bottom);
  }

  /** Ground point under a client-space position, or null if the ray misses the ground. */
  groundAt(clientX: number, clientY: number): Vec2 | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
    return hit ? { x: hit.x, y: hit.z } : null;
  }

  dispose() {
    removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.canvas.remove();
  }

  private readonly resize = () => {
    const w = this.parent.clientWidth || innerWidth;
    const h = this.parent.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    if (!this.view) return;
    const { halfW, halfH } = frustumFor(this.view, w / h);
    const c = this.camera;
    c.left = -halfW; c.right = halfW; c.top = halfH; c.bottom = -halfH;
    c.position.set(this.view.x, 0, this.view.z).addScaledVector(CAMERA_DIR, 60);
    c.lookAt(this.view.x, 0, this.view.z);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    this.basePosition.copy(c.position);
  };
}
