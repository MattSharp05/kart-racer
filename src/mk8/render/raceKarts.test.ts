import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { racerViews } from '../../content/racers/render';
import { KartRenderer } from '../../render/karts';
import { createRace } from '../../sim/race/createRace';
import type { KartState, Loadout, SimState } from '../../sim/types';
import { MK8_RACERS } from '../content/racers';
import { registerMk8Content } from '../register';
import {
  KART_DRAW_CALL_BUDGET,
  MK8_RACE_VIEWS,
  drawCalls,
  lowModelPath,
  prepareRaceKarts,
  raceKartModel,
  resetRaceKarts,
  useRaceKartFiles,
  type RaceKartFiles,
} from './raceKarts';

// MK-136: races draw MK8 racers from the pack, here the synthetic fixture pack (its kart parts
// copy the real pack's quirks, `specs/karts.ts`).
const PACK = new URL('../../../tests/e2e/fixtures/mk8-pack/', import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL('manifest.json', PACK), 'utf8')) as {
  files: { path: string }[];
};

/** The fixture pack as the loader serves it; `lowCopies` adds a `-low` twin of every model. */
function fixtureFiles({ lowCopies = false, missing = false } = {}) {
  const loaded = new Map<string, ArrayBuffer>();
  const requested: string[] = [];
  const paths = MANIFEST.files.map((e) => e.path);
  const all = lowCopies
    ? [...paths, ...paths.filter((p) => p.endsWith('.glb')).map(lowModelPath)]
    : paths;
  const files: RaceKartFiles = {
    loadManifest: () =>
      missing
        ? Promise.reject(new Error('no pack'))
        : Promise.resolve({ files: all.map((path) => ({ path })) }),
    loadFiles: (wanted) => {
      for (const path of wanted) {
        requested.push(path);
        const bytes = readFileSync(new URL(path.replace(/-low\.glb$/, '.glb'), PACK));
        loaded.set(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      }
      return Promise.resolve();
    },
    file: (path) => loaded.get(path),
  };
  return { files, requested };
}

function race(loadout?: Loadout): SimState {
  return createRace({
    trackId: 'sunny-circuit',
    racers: MK8_RACERS.slice(0, 8).map((racer, i) => ({
      kartId: racer.id,
      controller: i === 0 ? 'local' : 'ai',
      ...(i === 0 && loadout ? { loadout } : {}),
    })),
    engineClass: 150,
    itemsOn: true,
    seed: 1,
  });
}

const modelOf = (kart: KartState) => {
  const model = raceKartModel(kart);
  if (model === undefined || model === 'loading') throw new Error(`no model: ${String(model)}`);
  return model;
};

describe('MK8 racers in races (MK-136)', () => {
  beforeAll(() => registerMk8Content());
  afterEach(() => resetRaceKarts());

  it('registers race views that draw the pack’s models for every MK8 racer', () => {
    expect(MK8_RACE_VIEWS.map((v) => v.id).sort()).toEqual(MK8_RACERS.map((r) => r.id).sort());
    for (const view of MK8_RACE_VIEWS) expect(racerViews.get(view.id).model).toBeDefined();
  });

  it('builds each kart of a preloaded race: the racer seated in its kart, within the draw budget', async () => {
    const state = race();
    const { files } = fixtureFiles();
    await prepareRaceKarts(files, state.karts);
    let total = 0;
    for (const kart of state.karts) {
      const model = modelOf(kart);
      expect(model.root.name).toBe(`mk8-kart:${kart.kartType}`);
      const calls = drawCalls(model.root);
      expect(calls).toBeLessThanOrEqual(KART_DRAW_CALL_BUDGET);
      total += calls;
      // Kart-sized: about as long as our karts, a driver on top.
      const size = new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3());
      expect(size.z).toBeGreaterThan(1.2);
      expect(size.z).toBeLessThan(3.5);
      expect(size.y).toBeGreaterThan(0.8);
    }
    expect(total).toBeLessThanOrEqual(8 * KART_DRAW_CALL_BUDGET);
  });

  it('gives every kart its own copy (two of the same racer move apart)', async () => {
    const [kart] = race().karts;
    const { files } = fixtureFiles();
    await prepareRaceKarts(files, [kart!]);
    const a = modelOf(kart!);
    const b = modelOf(kart!);
    a.root.position.set(10, 0, 0);
    a.root.updateMatrixWorld(true);
    b.root.updateMatrixWorld(true);
    const centre = (o: THREE.Object3D) =>
      new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    expect(centre(a.root).x - centre(b.root).x).toBeCloseTo(10, 3);
  });

  it('draws the player’s loadout and the AI’s default karts (Peach’s parasol)', async () => {
    const loadout: Loadout = {
      racer: 'mk8-bowser',
      body: 'b-dasher',
      tires: 'slick-tires',
      glider: 'cloud-glider',
    };
    const state = race(loadout);
    state.karts[0]!.kartType = 'mk8-bowser';
    const { files, requested } = fixtureFiles();
    await prepareRaceKarts(files, state.karts);
    expect(requested).toContain('models/karts/bodies/b-dasher.glb');
    expect(requested).toContain('models/karts/gliders/peach-parasol.glb');
    const player = modelOf(state.karts[0]!);
    expect(player.glider).toBeDefined();
    player.glider!.setOpenness(1);
    expect(player.glider!.openness).toBe(1);
  });

  it('asks for a kart’s files itself when the race didn’t preload them, drawing it once they are in', async () => {
    const [kart] = race().karts;
    const { files } = fixtureFiles();
    expect(raceKartModel(kart!)).toBeUndefined(); // no pack source yet: the stand-in for good
    resetRaceKarts();
    useRaceKartFiles(() => files);
    expect(raceKartModel(kart!)).toBe('loading');
    await prepareRaceKarts(files, [kart!]);
    expect(modelOf(kart!).root.name).toBe(`mk8-kart:${kart!.kartType}`);
  });

  it('stays a stand-in without a pack', async () => {
    const [kart] = race().karts;
    const { files } = fixtureFiles({ missing: true });
    await prepareRaceKarts(files, [kart!]);
    expect(raceKartModel(kart!)).toBeUndefined();
  });

  it('loads the pack’s -low models at &quality=low', async () => {
    const [kart] = race().karts;
    const { files, requested } = fixtureFiles({ lowCopies: true });
    await prepareRaceKarts(files, [kart!], true);
    expect(requested.length).toBeGreaterThan(0);
    for (const path of requested) expect(path).toMatch(/-low\.glb$/);
  });

  it('leans the driver into a turn (motion.ts) and holds still while paused', async () => {
    const state = race();
    const kart = state.karts[0]!;
    const { files } = fixtureFiles();
    await prepareRaceKarts(files, [kart]);
    const model = modelOf(kart);
    const pose = () => {
      const rolls: number[] = [];
      model.root.traverse((o) => rolls.push(o.rotation.z));
      return rolls;
    };
    const rest = pose();
    kart.speed = 25;
    model.animate!(kart, 1, 0, 150);
    expect(pose()).toEqual(rest);
    model.animate!(kart, 1, 30, 150);
    expect(pose().some((roll, i) => Math.abs(roll - rest[i]!) > 0.05)).toBe(true);
  });

  it('the renderer draws a stand-in while the model loads, then swaps the model in', async () => {
    const state = race();
    const { files } = fixtureFiles();
    useRaceKartFiles(() => files);
    const scene = new THREE.Scene();
    const karts = new KartRenderer(scene);
    karts.sync(state, state, 1);
    expect(karts.kart(0)?.name).not.toMatch(/^mk8-kart:/);
    await prepareRaceKarts(files, state.karts);
    karts.sync(state, state, 1);
    for (let i = 0; i < state.karts.length; i++)
      expect(karts.kart(i)?.name).toBe(`mk8-kart:${state.karts[i]!.kartType}`);
    expect(scene.children.filter((c) => c.name.startsWith('mk8-kart:'))).toHaveLength(8);
    expect(scene.children).toHaveLength(8);
  });
});
