// MK8 racers in races (MK-136): each kart drawn as its racer's pack model seated in its loadout's
// kart (`racerModel.ts`, `kartAssembly.ts`), posed by `motion.ts`, instead of the primitive
// stand-in (`content/racers/standIn.ts`). The race's models load with the race
// (`prepareRaceKarts`), each GLB parsed once into a template every kart clones; a kart whose files
// are still loading drives as its stand-in and the renderer swaps the model in when they arrive
// (`RacerView.model`). Without a pack (CI, previews, the site before the password) the stand-ins
// stay. `&quality=low` loads the pack's `-low` models (smaller textures) where it has them.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { RacerView } from '../../content/racers/render';
import { kartEffects, type KartModel, type KartShape } from '../../render/kartModels';
import { kartPhysics } from '../../sim/kartStats';
import { DT, type EngineClass } from '../../sim/tuning';
import type { KartState, Loadout } from '../../sim/types';
// racerModel before kartAssembly: they import each other (see kartPreview.ts).
import { Mk8RacerModel, parseGlb, racerModelPath } from './racerModel';
import { bodyModelPath, gliderModelPath, tireModelPath } from './kartAssembly';
import { MK8_BODIES, MK8_GLIDERS, MK8_TIRES, defaultLoadout } from '../content/parts';
import { mk8RacerView } from '../content/racers/render';
import { MK8_RACER_STAND_INS } from '../content/racers/standIn';
import { REST_MOTION, motionInput, stepMotion, type MotionState } from './motion';
import { PackLockedError, PackNotInstalledError } from '../loader';

/** Whether the page asked for low quality (`&quality=low`), read once. */
let lowPage: boolean | undefined;
const lowQualityPage = () =>
  (lowPage ??=
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('quality') === 'low');

/** Where race karts' pack files come from (the page's `Mk8Loader`). */
export interface RaceKartFiles {
  loadManifest(): Promise<{ files: readonly { path: string }[] }>;
  loadFiles(paths: readonly string[]): Promise<void>;
  file(path: string): ArrayBuffer | undefined;
}

/**
 * Draw calls one MK8 kart may take in a race, its racer included (TDD v3: 8 karts within the
 * course's budget). The real pack's racer and Standard Kart take 7.
 */
export const KART_DRAW_CALL_BUDGET = 8;

/** The pack's smaller model next to `path` (`-low`: smaller textures). */
export const lowModelPath = (path: string) => path.replace(/\.glb$/, '-low.glb');

/** The pack files a kart of `loadout` is drawn from (the glider's may be missing). */
interface KartPaths {
  racer: string;
  body: string;
  tire: string;
  glider?: string;
}

type Recipe =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; paths: KartPaths; loadout: Loadout };

let source: (() => RaceKartFiles) | undefined;
/** Each loadout's files (by `recipeKey`): loading, missing from the pack, or parsed. */
const recipes = new Map<string, Recipe>();
const loads = new Map<string, Promise<void>>();
/** Every parsed GLB, by pack path: karts clone these. */
const templates = new Map<string, Promise<THREE.Group>>();
const parsed = new Map<string, THREE.Group>();
/** How many of the latest builds the test hook remembers. */
const BUILT_KEPT = 64;
/** Racer ids of the latest models built (tests: `window.__mk8.raceKarts`). */
const built: string[] = [];

/** Where kart models load their files when a race needs one not loaded yet (MK8 Mode's loader). */
export function useRaceKartFiles(files: () => RaceKartFiles): void {
  source = files;
}

/** The loadout kart `kart` is drawn with: its own, or its racer's default kart (the AI's). */
export function raceLoadout(kart: Pick<KartState, 'kartType' | 'loadout'>): Loadout {
  const loadout = kart.loadout ?? defaultLoadout(kart.kartType);
  return { ...loadout, racer: kart.kartType };
}

const recipeKey = (l: Loadout, low: boolean) =>
  `${l.racer}|${l.body}|${l.tires}|${l.glider}${low ? '|low' : ''}`;

const known = (parts: readonly { id: string }[], id: string) => parts.some((p) => p.id === id);

/**
 * The pack files `loadout`'s kart needs, before choosing `-low` ones; undefined for a racer or part
 * MK8 Mode doesn't know.
 */
export function raceKartFiles(loadout: Loadout): KartPaths | undefined {
  if (!isMk8Racer(loadout.racer) || !known(MK8_BODIES, loadout.body)) return undefined;
  if (!known(MK8_TIRES, loadout.tires)) return undefined;
  return {
    racer: racerModelPath(mk8RacerView(loadout.racer)),
    body: bodyModelPath(loadout.body),
    tire: tireModelPath(loadout.tires),
    ...(known(MK8_GLIDERS, loadout.glider) ? { glider: gliderModelPath(loadout.glider) } : {}),
  };
}

/**
 * Loads and parses the models of every kart in `karts` (by default each MK8 racer in their
 * default kart), so the race draws them from its first frame. Never rejects: a kart the pack
 * can't draw (no pack, a locked one, a file missing) stays a stand-in.
 */
export async function prepareRaceKarts(
  files: RaceKartFiles,
  karts: readonly Pick<KartState, 'kartType' | 'loadout'>[],
  low = lowQualityPage(),
): Promise<void> {
  const wanted = karts.filter((k) => isMk8Racer(k.kartType)).map(raceLoadout);
  await Promise.all(wanted.map((loadout) => request(files, loadout, low)));
}

function isMk8Racer(id: string): boolean {
  return MK8_RACER_STAND_INS.some((v) => v.id === id);
}

function request(files: RaceKartFiles, loadout: Loadout, low: boolean): Promise<void> {
  const key = recipeKey(loadout, low);
  let load = loads.get(key);
  if (!load) {
    recipes.set(key, { status: 'loading' });
    load = loadRecipe(files, loadout, low).then(
      (recipe) => void recipes.set(key, recipe),
      (e: unknown) => {
        // The stand-in for now. No pack, or a locked one: for good (the password reloads the
        // page). Anything else (a dropped connection): the next race's `prepareRaceKarts` tries
        // again (never the per-frame lookup, which would retry every frame).
        recipes.set(key, { status: 'missing' });
        if (!(e instanceof PackNotInstalledError || e instanceof PackLockedError))
          loads.delete(key);
      },
    );
    loads.set(key, load);
  }
  return load;
}

async function loadRecipe(files: RaceKartFiles, loadout: Loadout, low: boolean): Promise<Recipe> {
  const manifest = await files.loadManifest();
  const has = new Set(manifest.files.map((e) => e.path));
  const wanted = raceKartFiles(loadout);
  if (!wanted) return { status: 'missing' };
  if (!has.has(wanted.racer) || !has.has(wanted.body) || !has.has(wanted.tire)) {
    return { status: 'missing' };
  }
  const pick = (path: string) => (low && has.has(lowModelPath(path)) ? lowModelPath(path) : path);
  const paths: KartPaths = {
    racer: pick(wanted.racer),
    body: pick(wanted.body),
    tire: pick(wanted.tire),
    ...(wanted.glider !== undefined && has.has(wanted.glider)
      ? { glider: pick(wanted.glider) }
      : {}),
  };
  const list = Object.values(paths);
  await files.loadFiles(list.filter((path) => !files.file(path) && !parsed.has(path)));
  await Promise.all(list.map((path) => template(files, path)));
  return { status: 'ready', paths, loadout };
}

function template(files: RaceKartFiles, path: string): Promise<THREE.Group> {
  let pending = templates.get(path);
  if (!pending) {
    const bytes = files.file(path);
    pending = bytes
      ? parseGlb(bytes).then((scene) => {
          parsed.set(path, scene);
          return scene;
        })
      : Promise.reject(new Error(`MK8 pack file not loaded: ${path}`));
    // A failed parse is tried again by the next load of the file.
    pending.catch(() => templates.delete(path));
    templates.set(path, pending);
  }
  return pending;
}

/** A fresh copy of a parsed model: own nodes and bones, shared geometry, materials, textures. */
function instance(path: string): THREE.Object3D {
  const scene = parsed.get(path);
  if (!scene) throw new Error(`MK8 model not parsed: ${path}`);
  return cloneSkinned(scene);
}

/**
 * Kart `kart`'s MK8 model when its files are parsed; `'loading'` while they load (started here
 * when nothing asked for them yet); `undefined` when the pack can't draw it.
 */
export function raceKartModel(kart: KartState): KartModel | 'loading' | undefined {
  const loadout = raceLoadout(kart);
  const low = lowQualityPage();
  const key = recipeKey(loadout, low);
  if (!recipes.has(key)) {
    const files = source?.();
    if (!files) return undefined;
    void request(files, loadout, low);
  }
  const recipe = recipes.get(key);
  if (recipe?.status === 'loading') return 'loading';
  if (recipe?.status !== 'ready') return undefined;
  return buildKartModel(recipe.loadout, recipe.paths);
}

/** How far the boost flame and sparks sit behind the rear tires, m. */
const EFFECTS_BEHIND = 0.1;
/** Height of the flame above the kart's ride height, m. */
const FLAME_HEIGHT = 0.2;

/** Kart `loadout` as a race model: the MK8 racer model wrapped in the handles the renderer drives. */
export function buildKartModel(loadout: Loadout, paths: KartPaths): KartModel {
  const view = mk8RacerView(loadout.racer);
  const racer = new Mk8RacerModel(
    view,
    {
      racer: instance(paths.racer),
      body: instance(paths.body),
      tire: instance(paths.tire),
      ...(paths.glider !== undefined ? { glider: instance(paths.glider) } : {}),
    },
    {
      body: loadout.body,
      tires: loadout.tires,
      ...(paths.glider !== undefined ? { glider: loadout.glider } : {}),
    },
  );
  const root = new THREE.Group();
  root.name = `mk8-kart:${view.id}`;
  const body = new THREE.Group();
  root.add(body);
  body.add(racer.object);
  built.push(view.id);
  if (built.length > BUILT_KEPT) built.shift();

  const kart = racer.kart;
  const [frontLeft, , , rearRight] = kart.wheels;
  const radius = kart.rideHeight;
  const rearZ = rearRight?.z ?? 0;
  const shape: KartShape = {
    chassis: [Math.abs(rearRight?.x ?? 0) * 2, radius, (rearZ + radius + EFFECTS_BEHIND) * 2],
    chassisY: radius + FLAME_HEIGHT,
    frontRadius: radius,
    rearRadius: radius,
    frontZ: frontLeft?.z ?? 0,
    rearZ,
    wheelX: Math.abs(rearRight?.x ?? 0),
    driverY: radius,
    driverZ: 0,
  };

  let motion: MotionState = REST_MOTION;
  let topSpeed: number | undefined;
  return {
    root,
    body,
    // The four tires are one merged mesh (one draw call): they don't roll or steer.
    wheels: [],
    frontWheels: [],
    ...kartEffects(root, body, shape),
    animate(state: KartState, steer: number, ticks: number, engineClass: EngineClass): void {
      if (ticks <= 0) return;
      topSpeed ??= kartPhysics(state.kartType, engineClass, state.loadout).topSpeed;
      motion = stepMotion(motion, motionInput(state, { steer }, topSpeed), ticks * DT);
      // The race's renderer already spins the kart for a spin-out and bobs and squashes its body
      // (`render/effects.ts`): the racer adds its lean, look-back and trick roll.
      racer.pose({ ...motion, spin: 0, bob: 0, squash: 0 });
    },
    ...(kart.hasGlider
      ? {
          glider: {
            get openness() {
              return kart.gliderOpenness;
            },
            setOpenness: (openness: number) => kart.setGliderOpenness(openness),
          },
        }
      : {}),
  };
}

/** Draw calls `root` takes: one per visible mesh per material. */
export function drawCalls(root: THREE.Object3D): number {
  let calls = 0;
  root.traverseVisible((o) => {
    if (o instanceof THREE.Mesh) calls += Array.isArray(o.material) ? o.material.length : 1;
  });
  return calls;
}

/** MK8 racers' race views: the stand-ins, drawing the pack's models when it has them. */
export const MK8_RACE_VIEWS: readonly RacerView[] = MK8_RACER_STAND_INS.map((view) => ({
  ...view,
  model: raceKartModel,
}));

/** Test hooks: the racers whose race models were built, in order. */
export function raceKartHooks(): { built: () => string[] } {
  return { built: () => [...built] };
}

/** Forgets every load and template (tests). */
export function resetRaceKarts(): void {
  recipes.clear();
  loads.clear();
  templates.clear();
  parsed.clear();
  built.length = 0;
  source = undefined;
  lowPage = undefined;
}
