// The Grand Prix podium (MK-130, the approved mockup's screen 10): the cup's top 3 in their karts
// on the steps (2nd left, 1st in the middle, 3rd right), the cup's trophy in front in the metal the
// player won, confetti falling, over the last course's award background. Models come from the pack
// (racers and karts as on the kart builder, `models/trophies/trophies.glb`); without a pack, or for
// a file it hasn't got, block stand-ins. Confetti is a pure function of the stage's tick, so a
// paused link or a test sees the same frame.
import * as THREE from 'three';
import { mk8RacerView } from '../content/racers/render';
import type { Trophy } from '../gp/grandPrix';
import type { Loadout } from '../../sim/types';
import { Mk8RacerModel, disposeTree, fitModel, parseGlb, racerModelPath } from './racerModel';
import { kartFiles } from './kartAssembly';
import { REST_MOTION } from './motion';
import type { Mk8Stage, StageDemo } from './stage';

/** The pipeline's trophy model (`tools/mk8/sources.json` → `trophies`). */
export const TROPHY_PATH = 'models/trophies/trophies.glb';
/** A node of the trophies model that is the Mushroom Cup's (the real names are unconfirmed). */
const MUSHROOM_NODE = /mushroom|kinoko/i;

export interface PodiumRacer {
  racer: string;
  loadout: Loadout;
}

/** Steps by standings place: x, height (m). 1st in the middle, 2nd left, 3rd right. */
export const STEPS: readonly { x: number; height: number }[] = [
  { x: 0, height: 1.2 },
  { x: -2.5, height: 0.8 },
  { x: 2.5, height: 0.45 },
];
const STEP_WIDTH = 2.3;
const STEP_DEPTH = 2.4;
const STEP_COLORS = [0xffd23f, 0xd9dde6, 0xd8894a];
const METAL: Record<Trophy, number> = { gold: 0xffc928, silver: 0xd6dbe4, bronze: 0xc9783a };
const TROPHY_HEIGHT = 1.1;
/** How far the side steps' racers turn towards the middle, rad per metre off centre. */
const TURN_IN = 0.08;
const TROPHY_POS = new THREE.Vector3(0, 0, 2.6);
const CAMERA_POS = new THREE.Vector3(0, 2.5, 8.6);
const CAMERA_TARGET = new THREE.Vector3(0, 1.0, 0);
const BACKGROUND = 0x2a4fb5;

const CONFETTI = 160;
const CONFETTI_TOP = 7;
const CONFETTI_FALL = 8;
const CONFETTI_WIDTH = 9;
const CONFETTI_COLORS = [0xff4d4d, 0xffd23f, 0x3fc3ff, 0x6be36b, 0xff7ad9, 0xffffff];
const TICKS_PER_SECOND = 60;

/** The files the podium would like (each loaded only if the pack has it). */
export function podiumFiles(racers: readonly PodiumRacer[]): string[] {
  return [
    ...new Set([
      ...racers.flatMap((r) => [racerModelPath(mk8RacerView(r.racer)), ...kartFiles(r.loadout)]),
      TROPHY_PATH,
    ]),
  ];
}

type FileSource = (path: string) => ArrayBuffer | undefined;

/** A deterministic 0–1 from an integer (confetti spread). */
function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Where confetti piece `i` is at `tick`: x, y, z and its spin. */
export function confettiAt(i: number, tick: number): [number, number, number, number] {
  const seconds = tick / TICKS_PER_SECOND;
  const speed = 0.7 + hash01(i * 3 + 1) * 0.8;
  const fall = (hash01(i * 3 + 2) * CONFETTI_FALL + seconds * speed) % CONFETTI_FALL;
  const sway = Math.sin(seconds * 2 + i) * 0.25;
  const x = (hash01(i * 3) - 0.5) * CONFETTI_WIDTH + sway;
  const z = (hash01(i * 7 + 5) - 0.5) * 4 + 1;
  return [x, CONFETTI_TOP - fall, z, seconds * (2 + hash01(i) * 4)];
}

/** A block racer in a block kart: no pack, or its files missing. */
function standInRacer(racer: string): THREE.Group {
  const hue = hash01(Array.from(racer).reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
  const color = new THREE.Color().setHSL(hue, 0.65, 0.5);
  const kart = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.4, 1.7),
    new THREE.MeshLambertMaterial({ color: 0x333a4d }),
  );
  kart.position.y = 0.35;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.5),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.set(0, 0.85, 0.1);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xffd9b3 }),
  );
  head.position.set(0, 1.4, 0.1);
  const group = new THREE.Group();
  group.name = `stand-in:${racer}`;
  group.add(kart, body, head);
  return group;
}

/** The cup trophy drawn in code: a cup on a stem and a base, two handles. */
function standInTrophy(metal: number): THREE.Group {
  // No environment map to reflect: mostly diffuse, with a little glow so the metal reads.
  const material = new THREE.MeshStandardMaterial({
    color: metal,
    metalness: 0.25,
    roughness: 0.35,
    emissive: metal,
    emissiveIntensity: 0.15,
  });
  const profile = [
    [0.0, 0.0],
    [0.38, 0.0],
    [0.38, 0.12],
    [0.12, 0.18],
    [0.08, 0.45],
    [0.12, 0.55],
    [0.42, 0.75],
    [0.45, 1.1],
    [0.4, 1.1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), material);
  const handles = [-1, 1].map((side) => {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 16), material);
    handle.position.set(side * 0.47, 0.88, 0);
    return handle;
  });
  const group = new THREE.Group();
  group.name = 'trophy:stand-in';
  group.add(cup, ...handles);
  return group;
}

/** The Mushroom Cup's node of the pack's trophies model, else the whole model. */
function packTrophy(scene: THREE.Group): THREE.Object3D {
  let found: THREE.Object3D | undefined;
  scene.traverse((o) => {
    if (!found && o !== scene && MUSHROOM_NODE.test(o.name)) found = o;
  });
  if (!found) return scene;
  found.removeFromParent();
  return found;
}

/** What the podium shows (the screen marks it on its element for tests). */
export interface PodiumInfo {
  racers: string[];
  /** `pack` when every racer and the trophy came from the pack, else `stand-in` for some. */
  models: 'pack' | 'stand-in';
  trophy: Trophy | undefined;
}

export class PodiumScene implements StageDemo {
  private readonly root = new THREE.Group();
  private readonly confetti: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly axis = new THREE.Vector3(1, 0.4, 0.2).normalize();
  private readonly models: Mk8RacerModel[] = [];
  private texture: THREE.Texture | undefined;
  readonly info: PodiumInfo;

  private constructor(
    private readonly stage: Mk8Stage,
    info: PodiumInfo,
  ) {
    this.info = info;
    this.root.name = 'podium';
    stage.scene.add(this.root);
    stage.scene.background = new THREE.Color(BACKGROUND);
    const ground = stage.scene.getObjectByName('ground');
    if (ground) ground.visible = false;
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.copy(CAMERA_POS);
    camera.lookAt(CAMERA_TARGET);
    stage.camera = camera;

    STEPS.forEach((step, i) => {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(STEP_WIDTH, step.height, STEP_DEPTH),
        new THREE.MeshLambertMaterial({ color: STEP_COLORS[i] }),
      );
      block.position.set(step.x, step.height / 2, 0);
      this.root.add(block);
    });

    const geometry = new THREE.PlaneGeometry(0.1, 0.16);
    this.confetti = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      CONFETTI,
    );
    this.confetti.name = 'confetti';
    const color = new THREE.Color();
    for (let i = 0; i < CONFETTI; i++) {
      this.confetti.setColorAt(i, color.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? 0));
    }
    this.confetti.frustumCulled = false;
    this.root.add(this.confetti);
  }

  /**
   * The podium for `racers` (standings order, up to 3) and the player's `trophy`, its models from
   * `file` where it has them. `background` is the award background's URL, if any.
   */
  static async build(
    stage: Mk8Stage,
    racers: readonly PodiumRacer[],
    trophy: Trophy | undefined,
    file: FileSource,
    background?: string,
  ): Promise<PodiumScene> {
    let allPack = true;
    const scene = new PodiumScene(stage, {
      racers: racers.map((r) => r.racer),
      models: 'pack',
      trophy,
    });
    const placed = await Promise.all(
      racers.slice(0, STEPS.length).map(async (r) => {
        try {
          return await scene.packRacer(r, file);
        } catch {
          allPack = false;
          return standInRacer(r.racer);
        }
      }),
    );
    placed.forEach((object, place) => {
      const step = STEPS[place];
      if (!step) return;
      object.position.set(step.x, step.height, 0);
      // Turned to the camera (the kart builder's yaw, seen from +Z), a little towards the middle.
      object.rotation.y = -step.x * TURN_IN;
      scene.root.add(object);
    });
    if (trophy) {
      let model: THREE.Object3D;
      const bytes = file(TROPHY_PATH);
      try {
        if (!bytes) throw new Error('no trophy model');
        model = fitModel(packTrophy(await parseGlb(bytes)), 'y', TROPHY_HEIGHT);
      } catch {
        allPack = false;
        model = standInTrophy(METAL[trophy]);
      }
      model.position.copy(TROPHY_POS);
      model.name = `trophy:${trophy}`;
      scene.root.add(model);
    }
    scene.info.models = allPack ? 'pack' : 'stand-in';
    if (background) scene.setBackground(background);
    return scene;
  }

  update(tick: number): void {
    for (let i = 0; i < CONFETTI; i++) {
      const [x, y, z, spin] = confettiAt(i, tick);
      this.pos.set(x, y, z);
      this.quat.setFromAxisAngle(this.axis, spin);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.confetti.setMatrixAt(i, this.matrix);
    }
    this.confetti.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const model of this.models) model.dispose();
    this.texture?.dispose();
    this.root.removeFromParent();
    disposeTree(this.root);
  }

  private async packRacer(r: PodiumRacer, file: FileSource): Promise<THREE.Object3D> {
    const paths = [racerModelPath(mk8RacerView(r.racer)), ...kartFiles(r.loadout)];
    const [racer, body, tire, glider] = await Promise.all(
      paths.map((path) => {
        const bytes = file(path);
        if (!bytes) throw new Error(`${path} isn't loaded`);
        return parseGlb(bytes);
      }),
    );
    if (!racer || !body || !tire) throw new Error('MK8 podium: a model is missing');
    const model = new Mk8RacerModel(
      mk8RacerView(r.racer),
      { racer, body, tire, ...(glider ? { glider } : {}) },
      r.loadout,
    );
    model.pose(REST_MOTION);
    this.models.push(model);
    return model.object;
  }

  /** The award background behind everything (the camera never moves, so a plain backdrop). */
  private setBackground(url: string): void {
    new THREE.TextureLoader().load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      this.texture = texture;
      this.stage.scene.background = texture;
      this.stage.render();
    });
  }
}
