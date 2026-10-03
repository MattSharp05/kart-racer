// The kart builder's 3D preview (MK-118): the player's racer in the kart their parts make, turning
// slowly on a small stage of its own. Pack files load as parts change (the latest pick wins); with
// no pack (CI, previews, production without the password) the builder keeps its sprite strip.
import * as THREE from 'three';
import { mk8RacerView } from '../content/racers/render';
import type { Loadout } from '../../sim/types';
// racerModel before kartAssembly: they import each other, and racerModel's top level needs
// kartAssembly's path helpers evaluated first.
import { Mk8RacerModel, disposeTree, parseGlb, racerModelPath } from './racerModel';
import { kartFiles } from './kartAssembly';
import { REST_MOTION } from './motion';
import { Mk8Stage } from './stage';

/** Pack files on demand: what the preview loads its models through. */
export interface KartPreviewFiles {
  load(paths: readonly string[]): Promise<void>;
  file(path: string): ArrayBuffer | undefined;
}

/**
 * `idle` before the first loadout, `loading` while its files load, `ready` when its kart is shown,
 * `unavailable` when the pack (or one of its files) can't be had.
 */
export type KartPreviewStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/** One turn of the turntable, seconds. */
const TURN_SECONDS = 8;
const TICKS_PER_SECOND = 60;
/** Seen from the front left, a little above: the kart's nose and side. */
const START_YAW = Math.PI * 0.8;
const CAMERA = new THREE.Vector3(0, 1.7, -4.4);
const TARGET = new THREE.Vector3(0, 0.75, 0);
/** With the glider open the camera steps back to fit it. */
const GLIDER_PULL_BACK = 1.35;
const BACKGROUND = 0x0e1736;

/** The turntable's heading at `tick`. */
const yawAt = (tick: number) =>
  START_YAW + (tick / (TURN_SECONDS * TICKS_PER_SECOND)) * Math.PI * 2;

/** The racer model's files for `loadout`: racer, body, tires and glider. */
export function kartPreviewFiles(loadout: Loadout): string[] {
  return [racerModelPath(mk8RacerView(loadout.racer)), ...kartFiles(loadout)];
}

export class KartPreview {
  /** The preview's box: the stage's canvas goes in once a kart is ready. */
  readonly el = document.createElement('div');
  private stage: Mk8Stage | undefined;
  private model: Mk8RacerModel | undefined;
  private shown: Loadout | undefined;
  private gliderOpen = false;
  /** Bumped by every `show`: a slower earlier load never replaces a later pick. */
  private generation = 0;
  private disposed = false;

  /** @param frozen Hold the turntable still (tests, `&paused=1`). */
  constructor(
    private readonly files: KartPreviewFiles,
    private readonly frozen: boolean,
  ) {
    this.el.className = 'mk8-kb-preview';
    this.mark('idle');
  }

  get status(): KartPreviewStatus {
    return (this.el.dataset.status as KartPreviewStatus | undefined) ?? 'idle';
  }

  /** Shows `loadout`'s racer and kart once its files are loaded. */
  async show(loadout: Loadout): Promise<void> {
    const generation = ++this.generation;
    const wanted = { ...loadout };
    if (this.status !== 'ready') this.mark('loading');
    let paths: string[];
    try {
      paths = kartPreviewFiles(wanted);
      await this.files.load(paths);
    } catch {
      if (this.current(generation)) this.fail();
      return;
    }
    if (!this.current(generation)) return;
    let model: Mk8RacerModel;
    try {
      model = await this.build(wanted, paths);
    } catch {
      if (this.current(generation)) this.fail();
      return;
    }
    if (!this.current(generation)) {
      disposeTree(model.object);
      return;
    }
    this.swap(model, wanted);
  }

  /** Opens the glider (the Glider column has the focus) or folds it away. */
  setGliderOpen(open: boolean): void {
    this.gliderOpen = open;
    this.model?.kart.setGliderOpen(open);
    this.frame();
    this.stage?.render();
  }

  /** The loadout on show (tests read it from `data-loadout` too). */
  get loadout(): Loadout | undefined {
    return this.shown;
  }

  /** Stops the turntable while the builder is out of sight (a screen over it). */
  pause(): void {
    this.stage?.pause();
  }

  resume(): void {
    this.stage?.resume();
  }

  dispose(): void {
    this.disposed = true;
    this.model?.dispose();
    this.model = undefined;
    this.stage?.dispose();
    this.stage = undefined;
    this.el.remove();
  }

  /** The pick can't be shown: no old kart stays up in its place (the strip shows instead). */
  private fail(): void {
    this.model?.dispose();
    this.model = undefined;
    this.shown = undefined;
    delete this.el.dataset.loadout;
    this.stage?.render();
    this.mark('unavailable');
  }

  private current(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private async build(loadout: Loadout, paths: string[]): Promise<Mk8RacerModel> {
    const [racerPath = '', bodyPath = '', tirePath = '', gliderPath = ''] = paths;
    const glb = (path: string) => {
      const bytes = this.files.file(path);
      if (!bytes) throw new Error(`${path} isn't loaded`);
      return parseGlb(bytes);
    };
    const [racer, body, tire, glider] = await Promise.all(
      [racerPath, bodyPath, tirePath, gliderPath].map(glb),
    );
    if (!racer || !body || !tire || !glider) throw new Error('MK8 preview: a model is missing');
    const model = new Mk8RacerModel(
      mk8RacerView(loadout.racer),
      { racer, body, tire, glider },
      loadout,
    );
    model.pose(REST_MOTION);
    return model;
  }

  private swap(model: Mk8RacerModel, loadout: Loadout): void {
    const stage = this.ensureStage();
    this.model?.dispose();
    this.model = model;
    this.shown = loadout;
    model.kart.setGliderOpen(this.gliderOpen);
    model.object.rotation.y = yawAt(stage.tick);
    stage.scene.add(model.object);
    this.el.dataset.loadout = [loadout.racer, loadout.body, loadout.tires, loadout.glider].join(
      ' ',
    );
    this.mark('ready');
    this.frame();
    stage.render();
  }

  /** The stage, made on the first kart (no WebGL context until there is something to show). */
  private ensureStage(): Mk8Stage {
    if (this.stage) return this.stage;
    const stage = new Mk8Stage(this.frozen);
    stage.canvas.classList.add('mk8-kb-canvas');
    stage.scene.background = new THREE.Color(BACKGROUND);
    const ground = stage.scene.getObjectByName('ground');
    if (ground) ground.visible = false;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    stage.camera = camera;
    this.el.append(stage.canvas);
    stage.start({
      update: (tick) => {
        if (this.model) this.model.object.rotation.y = yawAt(tick);
      },
    });
    this.stage = stage;
    return stage;
  }

  /** Points the camera at the kart, further back with the glider open. */
  private frame(): void {
    const camera = this.stage?.camera;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const back = this.gliderOpen && this.model?.kart.hasGlider ? GLIDER_PULL_BACK : 1;
    camera.position.copy(CAMERA).multiplyScalar(back);
    camera.lookAt(TARGET.x, TARGET.y * back, TARGET.z);
  }

  private mark(status: KartPreviewStatus): void {
    this.el.dataset.status = status;
  }
}
