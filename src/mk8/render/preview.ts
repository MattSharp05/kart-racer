// The character select's 3D portrait (MK-117): the highlighted racer in the Standard Kart, turning
// slowly on a transparent canvas over the panel's gradient. Each racer's model is built once from
// the pack files and kept, so moving back to a racer swaps it in at once; `warm` builds and
// compiles the rest in the background so the first visit is quick too. Without WebGL, or before
// a racer's files are loaded, `show` resolves false and the screen keeps its 2D portrait.
import * as THREE from 'three';
import { MAX_PIXEL_RATIO } from '../../render/scene';
import type { Mk8RacerView } from '../content/racers/view';
import { REST_MOTION } from './motion';
import {
  KART_BODY_PATH,
  KART_TIRE_PATH,
  Mk8RacerModel,
  parseGlb,
  racerModelPath,
} from './racerModel';

/** The pack files one racer's portrait needs. */
export function previewFiles(view: Pick<Mk8RacerView, 'model'>): string[] {
  return [racerModelPath(view), KART_BODY_PATH, KART_TIRE_PATH];
}

const TICKS_PER_SECOND = 60;
const TICK_MS = 1000 / TICKS_PER_SECOND;
const MAX_CATCH_UP = 6;
/** Turntable speed, radians per second (a turn in ~10 s), and its first angle (front-left). */
const TURN_SPEED = 0.6;
const START_ANGLE = -0.6;
const CAMERA_FOV = 30;
const CAMERA_AT = new THREE.Vector3(0, 1.5, -5.4);
const CAMERA_TARGET = new THREE.Vector3(0, 0.62, 0);
/** The soft shadow disc under the kart: radius (m) and darkness. */
const SHADOW_RADIUS = 1.15;
const SHADOW_OPACITY = 0.18;

type FileSource = (path: string) => ArrayBuffer | undefined;

export interface PreviewOptions {
  file: FileSource;
  /** Hold still (tests, `&paused=1`): only `step` turns it. */
  frozen: boolean;
}

export class RacerPreview {
  readonly canvas = document.createElement('canvas');
  /** Ticks the turntable has turned. */
  tick = 0;
  private readonly renderer: THREE.WebGLRenderer | undefined;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50);
  private readonly turntable = new THREE.Group();
  private readonly shadow: THREE.Mesh;
  private readonly models = new Map<string, Promise<Mk8RacerModel | undefined>>();
  private readonly file: FileSource;
  private readonly frozen: boolean;
  private wanted: string | undefined;
  private drawn: Mk8RacerModel | undefined;
  private frame = 0;
  private last = 0;
  private carry = 0;
  private disposed = false;

  constructor(options: PreviewOptions) {
    this.file = options.file;
    this.frozen = options.frozen;
    this.canvas.className = 'mk8-preview-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    let renderer: THREE.WebGLRenderer | undefined;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
    } catch {
      renderer = undefined; // no WebGL: the screen keeps its 2D portrait
    }
    this.renderer = renderer;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899bb, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-4, 8, -6);
    this.scene.add(sun);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(SHADOW_RADIUS, 32),
      new THREE.MeshBasicMaterial({
        color: 0x0a2a6a,
        transparent: true,
        opacity: SHADOW_OPACITY,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.y = 0.62;
    this.shadow.visible = false;
    this.scene.add(this.shadow, this.turntable);
    this.camera.position.copy(CAMERA_AT);
    this.camera.lookAt(CAMERA_TARGET);
    this.turntable.rotation.y = START_ANGLE;
  }

  /** Whether this device can draw the portrait at all. */
  get available(): boolean {
    return this.renderer !== undefined;
  }

  /** The racer on the turntable now (undefined until one is drawn). */
  get shown(): string | undefined {
    return this.drawn?.view.id;
  }

  /**
   * Puts racer `view` on the turntable. Resolves true once it is drawn, false when it can't be
   * (no WebGL, its files aren't loaded, or another racer was asked for meanwhile).
   */
  async show(view: Mk8RacerView): Promise<boolean> {
    this.wanted = view.id;
    const model = await this.model(view);
    if (!model || this.disposed || this.wanted !== view.id) return false;
    if (this.drawn !== model) {
      if (this.drawn) this.drawn.object.visible = false;
      model.object.visible = true;
      this.drawn = model;
      this.shadow.visible = true;
    }
    this.render();
    this.run();
    return true;
  }

  /** Builds (and compiles) the portraits of `views` one after another, in the background. */
  async warm(views: readonly Mk8RacerView[]): Promise<void> {
    for (const view of views) {
      if (this.disposed) return;
      await this.model(view);
    }
  }

  /** Turns the turntable `ticks` ticks and draws. */
  step(ticks: number): void {
    this.tick += ticks;
    this.render();
  }

  render(): void {
    const renderer = this.renderer;
    if (!renderer || this.disposed) return;
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    const ratio = renderer.getPixelRatio();
    if (
      this.canvas.width !== Math.floor(width * ratio) ||
      this.canvas.height !== Math.floor(height * ratio)
    ) {
      renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    this.turntable.rotation.y = START_ANGLE + (this.tick * TURN_SPEED) / TICKS_PER_SECOND;
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    for (const model of this.models.values()) void model.then((m) => m?.dispose());
    this.models.clear();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.renderer?.dispose();
    this.canvas.remove();
  }

  /** Racer `view`'s model, built once; undefined without WebGL or before its files are loaded. */
  private model(view: Mk8RacerView): Promise<Mk8RacerModel | undefined> {
    const built = this.models.get(view.id);
    if (built) return built;
    const renderer = this.renderer;
    if (this.disposed) return Promise.resolve(undefined);
    const [racer, body, tire] = previewFiles(view).map((path) => this.file(path));
    if (!renderer || !racer || !body || !tire) return Promise.resolve(undefined);
    const promise = Promise.all([parseGlb(racer), parseGlb(body), parseGlb(tire)])
      .then(([racerScene, bodyScene, tireScene]) => {
        const model = new Mk8RacerModel(view, {
          racer: racerScene,
          body: bodyScene,
          tire: tireScene,
        });
        if (this.disposed) {
          model.dispose();
          return undefined;
        }
        model.pose(REST_MOTION);
        this.turntable.add(model.object);
        // Compile its shaders now, so its first frame on show doesn't stall.
        renderer.compile(this.scene, this.camera);
        model.object.visible = false;
        return model;
      })
      .catch(() => undefined);
    this.models.set(view.id, promise);
    return promise;
  }

  /** Turns again after its screen was hidden (the loop stops while the canvas isn't shown). */
  resume(): void {
    if (this.drawn) this.run();
  }

  /** Keeps the turntable turning on real time (unless frozen). */
  private run(): void {
    if (this.frozen || this.frame !== 0 || this.disposed) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  private readonly loop = (now: number) => {
    // A screen over this one hides it: stop until `resume`.
    if (this.canvas.offsetParent === null) {
      this.frame = 0;
      return;
    }
    this.carry += Math.min(now - this.last, MAX_CATCH_UP * TICK_MS);
    this.last = now;
    const ticks = Math.floor(this.carry / TICK_MS);
    this.carry -= ticks * TICK_MS;
    if (ticks > 0) this.step(ticks);
    this.frame = requestAnimationFrame(this.loop);
  };
}
