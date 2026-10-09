// MK8 Mode's model scenarios (MK-101) on the 3D stage: the 12 racers in a row, one racer driving a
// scripted lap of moves (lean, jump, hit, trick, shell behind), and Lakitu's three cues; MK-102
// adds the 6 kart bodies in a row, each on its own tires with its glider folded away. Each demo
// is a pure function of the stage's tick, so a paused link or a test sees the same frame.
import * as THREE from 'three';
import { mk8Body, mk8Glider, mk8Tires } from '../content/parts';
import { MK8_RACERS } from '../content/racers';
import { mk8RacerView } from '../content/racers/render';
import type { Mk8RacerView } from '../content/racers/view';
import {
  LAKITU_PATH,
  Lakitu,
  cueTicks,
  lakituPose,
  type LakituCue,
  type LakituPose,
} from './lakitu';
import { Mk8Kart, gliderModelPath, kartFiles, bodyModelPath, tireModelPath } from './kartAssembly';
import { REST_MOTION, stepMotion, type MotionInput, type MotionState } from './motion';
import {
  KART_BODY_PATH,
  KART_TIRE_PATH,
  Mk8RacerModel,
  disposeTree,
  parseGlb,
  racerModelPath,
} from './racerModel';
import type { Mk8Stage, StageDemo } from './stage';
import type { SeatReport } from './seatPose';

export type StageDemoId =
  | 'racers-lineup'
  | 'racer-motion'
  | 'lakitu-countdown'
  | 'lakitu-lap'
  | 'lakitu-respawn'
  | 'karts-lineup';

/** A kart on the stage without a driver (part ids). */
export interface KartSpec {
  body: string;
  tires: string;
  glider: string;
}

/** The karts lineup: every body once, the 4 tires and 3 gliders spread over them. */
const KART_LINEUP: readonly KartSpec[] = [
  { body: 'standard-kart', tires: 'standard-tires', glider: 'paper-glider' },
  { body: 'pipe-frame', tires: 'slim-tires', glider: 'cloud-glider' },
  { body: 'mach-8', tires: 'slick-tires', glider: 'peach-parasol' },
  { body: 'cat-cruiser', tires: 'monster-tires', glider: 'paper-glider' },
  { body: 'b-dasher', tires: 'slick-tires', glider: 'cloud-glider' },
  { body: 'sports-coupe', tires: 'standard-tires', glider: 'peach-parasol' },
];

/** The racers in roster order (Mario first). */
const ROSTER: readonly Mk8RacerView[] = [...MK8_RACERS]
  .sort((a, b) => a.order - b.order)
  .map((r) => mk8RacerView(r.id));
/** The racer the single-racer demos use: Mario. */
const SHOWN = ROSTER.slice(0, 1);

export const STAGE_DEMOS: Readonly<
  Record<
    StageDemoId,
    {
      title: string;
      racers: readonly Mk8RacerView[];
      lakitu: boolean;
      /** Empty karts (MK-102). */
      karts?: readonly KartSpec[];
    }
  >
> = {
  'racers-lineup': { title: 'Racers', racers: ROSTER, lakitu: false },
  'racer-motion': { title: 'Racer motion', racers: SHOWN, lakitu: false },
  'lakitu-countdown': { title: 'Lakitu: countdown', racers: SHOWN, lakitu: true },
  'lakitu-lap': { title: 'Lakitu: lap sign', racers: SHOWN, lakitu: true },
  'lakitu-respawn': { title: 'Lakitu: respawn', racers: SHOWN, lakitu: true },
  'karts-lineup': { title: 'Karts', racers: [], lakitu: false, karts: KART_LINEUP },
};

/** The pack files a demo needs. */
export function demoFiles(id: StageDemoId): string[] {
  const { racers, lakitu, karts = [] } = STAGE_DEMOS[id];
  return [
    ...new Set([
      ...(racers.length > 0 ? [KART_BODY_PATH, KART_TIRE_PATH] : []),
      ...racers.map(racerModelPath),
      ...karts.flatMap(kartFiles),
      ...(lakitu ? [LAKITU_PATH] : []),
    ]),
  ];
}

/** What tests read about each kart of the karts lineup. */
export interface KartInfo {
  body: string;
  tires: string;
  glider: string;
  gliderOpen: boolean;
  /** Wheel centres in the kart's frame, metres: front left, front right, rear left, rear right. */
  wheels: [number, number, number][];
}

/** What tests read and drive (`window.__mk8.stage`). */
export interface StageHooks {
  demo: StageDemoId;
  tick(): number;
  step(ticks: number): void;
  /** Racer ids on the stage, in order. */
  racers: string[];
  /** Draw calls of each racer with its kart, rendered alone. */
  drawCalls(): number[];
  /** Lakitu's current pose; null on demos without him. */
  lakitu(): LakituPose | null;
  /** The motion demo's racer pose; null elsewhere. */
  motion(): MotionState | null;
  /** The limbs bent into the seated pose, per racer (MK-101 round 2). */
  seats(): SeatReport[];
  /** Lakitu's arms bent forward; null on demos without him. */
  lakituArms(): SeatReport | null;
  /** The karts lineup's karts (MK-102); empty elsewhere. */
  karts(): KartInfo[];
  /** Draw calls of each empty kart, rendered alone. */
  kartDrawCalls(): number[];
  /**
   * Opens or folds every empty kart's glider (gliders are folded on the stage); a number unfolds
   * them part-way, 0–1 (MK-106).
   */
  openGliders(open: boolean | number): void;
}

type FileSource = (path: string) => ArrayBuffer | undefined;

async function glb(file: FileSource, path: string): Promise<THREE.Group> {
  const bytes = file(path);
  if (!bytes) throw new Error(`${path} isn't loaded`);
  return parseGlb(bytes);
}

async function racerModel(file: FileSource, view: Mk8RacerView): Promise<Mk8RacerModel> {
  const [racer, body, tire] = await Promise.all([
    glb(file, racerModelPath(view)),
    glb(file, KART_BODY_PATH),
    glb(file, KART_TIRE_PATH),
  ]);
  return new Mk8RacerModel(view, { racer, body, tire });
}

/** An empty kart of `spec`'s parts. */
async function emptyKart(file: FileSource, spec: KartSpec): Promise<Mk8Kart> {
  const [body, tire, glider] = await Promise.all([
    glb(file, bodyModelPath(spec.body)),
    glb(file, tireModelPath(spec.tires)),
    glb(file, gliderModelPath(spec.glider)),
  ]);
  return new Mk8Kart({
    body: mk8Body(spec.body),
    tires: mk8Tires(spec.tires),
    glider: mk8Glider(spec.glider),
    models: { body, tire, glider },
  });
}

/** Builds demo `id` on `stage` from the loaded pack files; labels go in `overlay`. */
export async function buildDemo(
  id: StageDemoId,
  stage: Mk8Stage,
  file: FileSource,
  overlay: HTMLElement,
): Promise<{ demo: StageDemo; hooks: StageHooks; dispose(): void }> {
  const { racers, lakitu: withLakitu, karts: kartSpecs = [] } = STAGE_DEMOS[id];
  const models = await Promise.all(racers.map((view) => racerModel(file, view)));
  for (const model of models) stage.scene.add(model.object);
  let lakitu: Lakitu | undefined;
  let karts: Mk8Kart[] = [];
  try {
    karts = await Promise.all(kartSpecs.map((spec) => emptyKart(file, spec)));
    if (withLakitu) lakitu = new Lakitu(await glb(file, LAKITU_PATH));
  } catch (e) {
    for (const model of models) model.dispose();
    for (const kart of karts) disposeTree(kart.object);
    throw e;
  }
  for (const kart of karts) stage.scene.add(kart.object);
  if (lakitu) stage.scene.add(lakitu.object);

  let motion: MotionState | null = null;
  const [first] = models;
  let demo: StageDemo;
  if (id === 'karts-lineup') demo = kartsLineup(stage, karts, overlay);
  else if (!first) throw new Error(`${id} shows no racer`);
  else if (id === 'racers-lineup') demo = lineup(stage, models, overlay);
  else if (id === 'racer-motion') demo = motionDemo(stage, first, overlay, (m) => (motion = m));
  else if (lakitu) demo = lakituDemo(stage, first, lakitu, id);
  else throw new Error(`${id} needs Lakitu`);
  const hooks: StageHooks = {
    demo: id,
    tick: () => stage.tick,
    step: (ticks) => stage.step(ticks),
    racers: models.map((m) => m.view.id),
    drawCalls: () => models.map((m) => stage.drawCallsOf(m.object)),
    lakitu: () => lakitu?.current ?? null,
    motion: () => motion,
    seats: () => models.map((m) => m.seat),
    lakituArms: () => lakitu?.arms ?? null,
    karts: () =>
      karts.map((kart, i) => ({
        ...(kartSpecs[i] ?? { body: '', tires: '', glider: '' }),
        gliderOpen: kart.gliderOpen,
        wheels: kart.wheels.map((w) => [w.x, w.y, w.z] as [number, number, number]),
      })),
    kartDrawCalls: () => karts.map((kart) => stage.drawCallsOf(kart.object)),
    openGliders: (open) => {
      for (const kart of karts)
        kart.setGliderOpenness(typeof open === 'number' ? open : open ? 1 : 0);
      stage.render();
    },
  };
  return {
    demo,
    hooks,
    dispose: () => {
      for (const model of models) model.dispose();
      for (const kart of karts) {
        kart.object.removeFromParent();
        disposeTree(kart.object);
      }
      lakitu?.dispose();
    },
  };
}

/** Lineup: the 12 in a row, turned a little towards the camera, names underneath. */
const LINEUP_SPACING = 2.1;
const LINEUP_TURN = 0.45;
const LINEUP_MARGIN = 1.4;
const LINEUP_CAMERA = new THREE.Vector3(0, 6, -22);
const LINEUP_TARGET = new THREE.Vector3(0, 0.6, 0);

function lineup(stage: Mk8Stage, models: Mk8RacerModel[], overlay: HTMLElement): StageDemo {
  for (const model of models) model.pose(REST_MOTION);
  return row(
    stage,
    overlay,
    LINEUP_SPACING,
    models.map((model) => ({
      object: model.object,
      label: MK8_RACERS.find((r) => r.id === model.view.id)?.name ?? model.view.id,
    })),
  );
}

/** Karts lineup (MK-102): the 6 bodies in a row, parts named underneath. */
const KART_SPACING = 2.8;

function kartsLineup(stage: Mk8Stage, karts: Mk8Kart[], overlay: HTMLElement): StageDemo {
  return row(
    stage,
    overlay,
    KART_SPACING,
    karts.map((kart) => ({
      object: kart.object,
      label: `${kart.parts.body.name} · ${kart.parts.tires.name}`,
    })),
  );
}

/** Objects in a row seen from the front (orthographic), each with a label underneath. */
function row(
  stage: Mk8Stage,
  overlay: HTMLElement,
  spacing: number,
  items: { object: THREE.Object3D; label: string }[],
): StageDemo {
  const halfRow = ((items.length - 1) * spacing) / 2;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.copy(LINEUP_CAMERA);
  camera.lookAt(LINEUP_TARGET);
  stage.camera = camera;
  const labels = items.map(({ object, label: text }, i) => {
    object.position.set(halfRow - i * spacing, 0, 0);
    // Karts face −Z, towards the camera; turned a little to show their sides.
    object.rotation.y = LINEUP_TURN;
    const label = document.createElement('span');
    label.className = 'mk8-stage-label';
    label.textContent = text;
    overlay.append(label);
    return label;
  });
  const point = new THREE.Vector3();
  return {
    update: () => {},
    resize: (aspect) => {
      const half = halfRow + LINEUP_MARGIN;
      camera.left = -half;
      camera.right = half;
      camera.top = half / aspect;
      camera.bottom = -half / aspect;
      camera.updateProjectionMatrix();
    },
    afterRender: () => {
      const { width, height } = stage.size();
      items.forEach(({ object }, i) => {
        point.copy(object.position).project(camera);
        const label = labels[i];
        if (!label) return;
        label.style.left = `${((point.x + 1) / 2) * width}px`;
        label.style.top = `${((1 - point.y) / 2) * height}px`;
      });
    },
  };
}

/** Motion demo: a script of moves, looping. Each step is [seconds, caption, input]. */
const MOTION_SCRIPT: readonly [number, string, (t: number) => Partial<MotionInput>][] & {
  0: [number, string, (t: number) => Partial<MotionInput>];
} = [
  [3, 'Steering: leans into the turns', (t) => ({ steer: Math.sin(t * Math.PI) })],
  [1, 'Straight: no lean', () => ({})],
  [0.6, 'Jump…', () => ({ grounded: false, verticalSpeed: -9 })],
  [1.2, '…landing: squash and bob', () => ({})],
  [1.6, 'Hit: spin', () => ({ spinning: true })],
  [1, 'Recovered', () => ({})],
  [0.7, 'Ramp trick', () => ({ grounded: false, trick: true, verticalSpeed: -6 })],
  [1, 'Landed', () => ({})],
  [2, 'Shell behind: looks back', () => ({ shellBehind: true })],
  [1, 'Looks ahead again', () => ({})],
];
const MOTION_CAMERA = new THREE.Vector3(3.4, 2.2, -4.2);
const MOTION_TARGET = new THREE.Vector3(0, 0.75, 0);
const DRIVING: MotionInput = {
  steer: 0,
  speedShare: 1,
  grounded: true,
  verticalSpeed: 0,
  spinning: false,
  trick: false,
  shellBehind: false,
};

/** The script step at `seconds` into the loop, and seconds into that step. */
function scriptAt(seconds: number) {
  const loop = MOTION_SCRIPT.reduce((sum, [s]) => sum + s, 0);
  let t = seconds % loop;
  let last = MOTION_SCRIPT[0];
  for (const step of MOTION_SCRIPT) {
    if (t < step[0]) return { step, t };
    t -= step[0];
    last = step;
  }
  // Only reached by rounding at the loop's end.
  return { step: last, t };
}

function motionDemo(
  stage: Mk8Stage,
  model: Mk8RacerModel,
  overlay: HTMLElement,
  report: (m: MotionState) => void,
): StageDemo {
  const camera = stage.camera as THREE.PerspectiveCamera;
  camera.position.copy(MOTION_CAMERA);
  camera.lookAt(MOTION_TARGET);
  const caption = document.createElement('p');
  caption.className = 'mk8-stage-caption';
  overlay.append(caption);
  let state: MotionState = REST_MOTION;
  return {
    update: (tick) => {
      if (tick === 0) state = REST_MOTION;
      const { step, t } = scriptAt(tick / 60);
      const [, text, input] = step;
      state = stepMotion(state, { ...DRIVING, ...input(t) }, 1 / 60);
      model.pose(state);
      caption.textContent = text;
      report(state);
    },
  };
}

/** Lakitu demos: the kart from behind, the cue looping with a short gap. */
const LAKITU_CAMERA = new THREE.Vector3(-1.2, 2.4, 5.2);
const LAKITU_TARGET = new THREE.Vector3(0.6, 1.8, -4);
/** Respawn: further back and looking up, to see him over the kart. */
const FISHING_CAMERA = new THREE.Vector3(-3, 2.2, 8);
const FISHING_TARGET = new THREE.Vector3(0, 2.8, 0);
const CUE_GAP_TICKS = 30;

function lakituDemo(
  stage: Mk8Stage,
  model: Mk8RacerModel,
  lakitu: Lakitu,
  id: Exclude<StageDemoId, 'racers-lineup' | 'racer-motion'>,
): StageDemo {
  const kind = id === 'lakitu-countdown' ? 'countdown' : id === 'lakitu-lap' ? 'lap' : 'fishing';
  const camera = stage.camera as THREE.PerspectiveCamera;
  camera.position.copy(kind === 'fishing' ? FISHING_CAMERA : LAKITU_CAMERA);
  camera.lookAt(kind === 'fishing' ? FISHING_TARGET : LAKITU_TARGET);
  model.pose(REST_MOTION);
  const period = cueTicks(kind) + CUE_GAP_TICKS;
  const cueAt = (tick: number): LakituCue => {
    const round = Math.floor(tick / period);
    const t = tick % period;
    if (kind === 'lap') return { kind, tick: t, lap: 2, final: round % 2 === 1 };
    return { kind, tick: t };
  };
  const kart = new THREE.Vector3();
  return {
    update: (tick) => {
      const pose = lakituPose(cueAt(tick));
      // While hooked, the kart swings up on the line (the sim's carry is drawn in a race).
      model.object.position.y = pose.lift;
      kart.copy(model.object.position).setY(0);
      lakitu.update(pose, kart, 0);
    },
  };
}
