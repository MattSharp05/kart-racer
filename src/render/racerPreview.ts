import * as THREE from 'three';
import type { KartId } from '../sim/data/karts';
import { PrimitiveKartFactory } from './kartModels';
import { MAX_PIXEL_RATIO } from './scene';

/** Turntable speed, rad/s. */
const SPIN_RATE = 0.9;
/** The angle shown while the game is paused (a three-quarter front view), so frames are stable. */
const SHOWCASE_ANGLE = 2.5;
/** Longest frame the turntable advances by, s (a background tab doesn't jump the spin). */
const MAX_FRAME_SECONDS = 0.1;
/** Shortest time between two turntable frames, ms: 30 fps is smooth enough for a slow spin. */
const MIN_FRAME_MS = 1000 / 30;
const CAMERA_FOV = 32;
const CAMERA_POSITION = new THREE.Vector3(0, 2, 4.6);
const CAMERA_TARGET = new THREE.Vector3(0, 0.55, 0);

/** The one canvas and WebGL context every turntable on the page shares. */
interface Stage {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The preview drawing into it now. */
  owner: RacerPreview | undefined;
}

let stage: Stage | undefined;

/**
 * Made on first use and kept: browsers free a lost WebGL context only when they get round to it
 * (WebKit warned "too many active WebGL contexts" after ~16 racer select visits), so the turntable
 * reuses one small context for the page's lifetime instead of making one per screen.
 */
function sharedStage(): Stage {
  if (stage) return stage;
  const canvas = document.createElement('canvas');
  canvas.className = 'racer-preview';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a7a3a, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 8, 6);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50);
  camera.position.copy(CAMERA_POSITION);
  camera.lookAt(CAMERA_TARGET);
  stage = { canvas, renderer, scene, camera, owner: undefined };
  return stage;
}

/**
 * The racer select's turntable (MK-51): one kart spinning on a small canvas placed in `host`. The
 * screen creates it and calls `dispose()` when it goes away, which stops the spin, frees the kart
 * and takes the canvas off the page. Read-only over the content registries.
 */
export class RacerPreview {
  private readonly stage: Stage;
  private readonly factory = new PrimitiveKartFactory();
  private model: THREE.Group | undefined;
  private kart: KartId = '';
  private angle = SHOWCASE_ANGLE;
  private frame = 0;
  private last = 0;
  private drawn = { angle: Number.NaN, width: 0, height: 0, kart: '' };

  /** @param isPaused While true the kart holds the showcase angle (tests and paused QA links). */
  constructor(
    host: HTMLElement,
    private readonly isPaused: () => boolean = () => false,
  ) {
    this.stage = sharedStage();
    // A newer turntable takes the canvas over; the older one stops.
    this.stage.owner?.release();
    this.stage.owner = this;
    host.append(this.stage.canvas);
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Puts racer `kart` on the turntable. */
  show(kart: KartId): void {
    if (this.stage.owner !== this || kart === this.kart) return;
    this.kart = kart;
    this.clearModel();
    this.model = this.factory.create(kart).root;
    this.stage.scene.add(this.model);
    this.draw();
  }

  /** Stops the turntable, frees the kart and takes the canvas off the page. Safe to call twice. */
  dispose(): void {
    if (this.stage.owner !== this) return;
    this.release();
    this.stage.owner = undefined;
    this.stage.canvas.remove();
  }

  private release(): void {
    cancelAnimationFrame(this.frame);
    this.clearModel();
  }

  private readonly tick = (now: number): void => {
    if (this.stage.owner !== this) return;
    this.frame = requestAnimationFrame(this.tick);
    if (this.last && now - this.last < MIN_FRAME_MS) return;
    const seconds = this.last ? Math.min((now - this.last) / 1000, MAX_FRAME_SECONDS) : 0;
    this.last = now;
    this.angle = this.isPaused() ? SHOWCASE_ANGLE : this.angle + seconds * SPIN_RATE;
    this.draw();
  };

  /** Draws when something visible changed (angle, size or racer). */
  private draw(): void {
    const { canvas, renderer, scene, camera } = this.stage;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!this.model || width === 0 || height === 0) return;
    const drawn = this.drawn;
    const resized = drawn.width !== width || drawn.height !== height;
    if (!resized && drawn.angle === this.angle && drawn.kart === this.kart) return;
    if (resized) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    this.model.rotation.y = this.angle;
    renderer.render(scene, camera);
    this.drawn = { angle: this.angle, width, height, kart: this.kart };
  }

  private clearModel(): void {
    if (!this.model) return;
    this.stage.scene.remove(this.model);
    disposeTree(this.model);
    this.model = undefined;
  }
}

/** Frees the geometries and materials under `root` (shared ones are freed once; three allows it). */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    (node.geometry as THREE.BufferGeometry).dispose();
    const materials: THREE.Material[] = Array.isArray(node.material)
      ? node.material
      : [node.material];
    for (const material of materials) material.dispose();
  });
}
