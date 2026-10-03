// A small 3D stage for MK8 Mode's model scenarios (MK-101): the racer lineup, the motion demo and
// Lakitu's cues, before any MK8 race exists. It ticks at the sim's 60 Hz on real time, or holds
// still for tests and paused QA links (`step` advances it).
import * as THREE from 'three';
import { MAX_PIXEL_RATIO } from '../../render/scene';

const TICKS_PER_SECOND = 60;
const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Most ticks one frame catches up (a background tab doesn't fast-forward). */
const MAX_CATCH_UP = 6;
const SKY = 0x8fd3ff;
const GROUND = 0x6cbf4a;
const GROUND_SIZE = 200;

/** What a demo does each tick. */
export interface StageDemo {
  update(tick: number): void;
  /** The canvas's shape changed (width ÷ height): fit the camera. */
  resize?(aspect: number): void;
  /** After each render (labels follow their 3D points). */
  afterRender?(): void;
}

export class Mk8Stage {
  readonly canvas = document.createElement('canvas');
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  camera: THREE.Camera;
  /** Ticks since the demo started. */
  tick = 0;
  private demo: StageDemo | undefined;
  private frame = 0;
  private last = 0;
  private carry = 0;
  private aspect = 0;
  private readonly ground: THREE.Mesh;

  /** @param frozen Hold still (tests, `&paused=1`): only `step` advances. */
  constructor(private readonly frozen: boolean) {
    this.canvas.className = 'mk8-stage-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(SKY);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a7a3a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(6, 10, -8);
    this.scene.add(sun);
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
      new THREE.MeshLambertMaterial({ color: GROUND }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.name = 'ground';
    this.scene.add(this.ground);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  }

  /** Runs `demo` from tick 0, and keeps running it unless frozen. */
  start(demo: StageDemo): void {
    this.demo = demo;
    this.tick = 0;
    this.aspect = 0;
    demo.update(0);
    this.render();
    this.resume();
  }

  /** Stops ticking and drawing (the stage is out of sight); `resume` carries on. */
  pause(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /** Ticks and draws again after `pause` (never when frozen). */
  resume(): void {
    if (this.frozen || this.frame !== 0) return;
    this.last = performance.now();
    this.carry = 0;
    this.frame = requestAnimationFrame(this.loop);
  }

  /** Advances `ticks` ticks and draws. */
  step(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.demo?.update(++this.tick);
    this.render();
  }

  render(): void {
    this.resize();
    this.renderer.render(this.scene, this.camera);
    this.demo?.afterRender?.();
  }

  /** Draw calls `object` alone takes (everything else hidden for one render). */
  drawCallsOf(object: THREE.Object3D): number {
    const shown = this.scene.children.map((child) => [child, child.visible] as const);
    for (const [child] of shown) child.visible = child === object;
    this.renderer.render(this.scene, this.camera);
    const calls = this.renderer.info.render.calls;
    for (const [child, visible] of shown) child.visible = visible;
    this.render();
    return calls;
  }

  /** The canvas's size in CSS pixels (labels place themselves with it). */
  size(): { width: number; height: number } {
    return { width: this.canvas.clientWidth || 1, height: this.canvas.clientHeight || 1 };
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.demo = undefined;
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private readonly loop = (now: number) => {
    this.carry += Math.min(now - this.last, MAX_CATCH_UP * TICK_MS);
    this.last = now;
    const ticks = Math.floor(this.carry / TICK_MS);
    this.carry -= ticks * TICK_MS;
    if (ticks > 0) this.step(ticks);
    this.frame = requestAnimationFrame(this.loop);
  };

  private resize(): void {
    const { width, height } = this.size();
    const canvas = this.renderer.domElement;
    const ratio = this.renderer.getPixelRatio();
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio))
      this.renderer.setSize(width, height, false);
    const aspect = width / height;
    if (aspect === this.aspect) return;
    this.aspect = aspect;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    this.demo?.resize?.(aspect);
  }
}
