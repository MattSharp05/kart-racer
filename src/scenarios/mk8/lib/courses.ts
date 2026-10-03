// MK8 course scenarios (MK-105): free drive, a race from the countdown, the anti-gravity section and
// the final lap on Mario Kart Stadium, plus a race on the synthetic test ramp (no pack: CI's e2e).
// The course is registered by `main.ts` before setup (`src/mk8/scenarioCourses.ts`); without it
// the scenario shows "MK8 pack not installed", or the password box on the site before logging in.
import { tracks } from '../../../content/tracks';
import { MK8_ITEM_SET } from '../../../mk8/content/items/id';
import { KART_IDS } from '../../../sim/data/karts';
import { headingOf, scale, type Vec3 } from '../../../sim/math';
import type { MeshTrackDef } from '../../../sim/meshTrack';
import { createRace, raceSetupRng, type RacerSlot } from '../../../sim/race/createRace';
import { rngInt, rngPick } from '../../../sim/rng';
import { routeGeometry } from '../../../sim/route';
import { createSimState } from '../../../sim/state';
import { DT, tuning } from '../../../sim/tuning';
import type { KartState, SimState } from '../../../sim/types';
import { attractMode } from '../../menus';
import type { ScenarioSetup } from '../../registry';

/** The races' engine class and laps (MK8's usual 150cc, 3 laps). */
const ENGINE_CLASS = 150;
const LAPS = 3;
const COUNTDOWN_TICKS = Math.round(tuning.countdownSeconds / DT);
/** Speed a kart rolling into a scenario starts at, m/s. */
const FREE_SPEED = 20;

/**
 * How `main.ts` found the course pack for this page's course scenario: `locked` on the site before
 * the password (the scenario then asks for it), `missing` without a pack.
 */
export const mk8CourseLoad: { state: 'ready' | 'missing' | 'locked' } = { state: 'ready' };

/** The course scenario's setup, or the screen saying why it can't run here. */
export function onCourse(
  trackId: string,
  build: (track: MeshTrackDef, seed: number) => SimState,
): (seed: number) => ScenarioSetup {
  return (seed) => {
    if (!tracks.has(trackId)) {
      const locked = mk8CourseLoad.state === 'locked';
      return {
        state: attractMode(seed),
        screen: 'mk8',
        mk8Start: locked ? 'course-password' : 'not-installed',
      };
    }
    const def = tracks.get(trackId).def;
    if (def.kind !== 'mesh') throw new Error(`${trackId} isn't a mesh track`);
    return { state: build(def, seed) };
  };
}

/** A 150cc race with MK8's items from the countdown: you + 7 AI, you starting 5th–8th (seeded). */
export function courseRace(track: MeshTrackDef, seed: number, items = true): SimState {
  const rng = raceSetupRng(seed);
  const playerSlot = rngInt(rng, 4, 7);
  const others = Array.from({ length: 8 }, (_, i) => i).filter((i) => i !== playerSlot);
  const racers = Array.from({ length: 8 }, (_, i): RacerSlot =>
    i === 0
      ? { kartId: 'maple', controller: 'local', gridSlot: playerSlot }
      : { kartId: rngPick(rng, KART_IDS), controller: 'ai', gridSlot: others[i - 1] ?? i },
  );
  return createRace({
    trackId: track.id,
    racers,
    engineClass: ENGINE_CLASS,
    itemsOn: items,
    seed,
    laps: LAPS,
    rng,
    ...(items ? { itemSet: MK8_ITEM_SET } : {}),
  });
}

/** One kart (150cc, free drive, item boxes out) on the route at lap fraction `t`, at `speed`. */
export function courseFreeDrive(track: MeshTrackDef, seed: number, t: number, speed = 0): SimState {
  const frame = routeGeometry(track.route).frameAt(t);
  const state = createSimState({
    seed,
    trackId: track.id,
    engineClass: ENGINE_CLASS,
    itemSet: MK8_ITEM_SET,
    itemSlots: 2,
    karts: [
      { position: frame.position, heading: headingOf(frame.tangent, 0), up: frame.up, speed },
    ],
  });
  const [kart] = state.karts;
  if (kart) kart.velocity = scale(frame.tangent, speed);
  return state;
}

/** Free drive from the pole of the grid. */
export function courseFromGrid(track: MeshTrackDef, seed: number): SimState {
  return courseFreeDrive(track, seed, track.route.gridSlots[0]?.t ?? 0);
}

/** Free drive into the first anti-gravity zone: `lead` m before it, at speed. */
export function courseAntigrav(track: MeshTrackDef, seed: number, lead = 25): SimState {
  const zone = track.route.zones.find((z) => z.kind === 'antigrav');
  const geometry = routeGeometry(track.route);
  const t = (zone?.kind === 'antigrav' ? zone.from : 0) - lead / geometry.length;
  return courseFreeDrive(track, seed, t - Math.floor(t), FREE_SPEED);
}

/** Seconds of the lap times behind on the final lap. */
const FINAL_LAP_TIMES = [25.4, 24.8];
/** The field crossed the line into the final lap this long ago, s. */
const FINAL_LAP_SINCE = 1;
/** Rows of the rolling start past the line on the final lap, m apart. */
const ROW_SPACING = 7;

/**
 * The final lap: the race from `courseRace`, the whole field rolling 4–25 m past the finish line on
 * lap 3 of 3 (laps of 25.4 s and 24.8 s behind), you in the middle. Racing from the first tick.
 */
export function courseFinalLap(track: MeshTrackDef, seed: number): SimState {
  const state = courseRace(track, seed);
  const geometry = routeGeometry(track.route);
  const elapsed = FINAL_LAP_TIMES.reduce((a, b) => a + b, 0);
  state.phase = 'racing';
  state.race.goTick = -Math.round((elapsed + FINAL_LAP_SINCE) / DT);
  state.race.countdownStartTick = state.race.goTick - COUNTDOWN_TICKS;
  // Kart 0 (you) takes the middle of the field; the rest fill in around.
  const order = [3, 0, 1, 2, 4, 5, 6, 7].map((slot, i) => ({ kart: state.karts[i], slot }));
  for (const { kart, slot } of order) {
    if (!kart) continue;
    const row = Math.floor(slot / 2);
    const metres = 4 + row * ROW_SPACING + (slot % 2) * (ROW_SPACING / 2);
    place(kart, geometry.frameAt(metres / geometry.length, slot % 2 ? 3 : -3), FREE_SPEED);
    kart.race = {
      ...kart.race,
      lap: LAPS,
      nextCheckpoint: 1,
      lastT: metres / geometry.length,
      lapStartTick: -Math.round(FINAL_LAP_SINCE / DT),
      lapTimes: [...FINAL_LAP_TIMES],
    };
  }
  // Further along is further ahead.
  state.positions = order
    .map(({ slot }, id) => ({ id, slot }))
    .sort((a, b) => b.slot - a.slot)
    .map(({ id }) => id);
  return state;
}

function place(
  kart: KartState,
  frame: { position: Vec3; tangent: Vec3; up: Vec3 },
  speed: number,
): void {
  kart.position = frame.position;
  kart.up = frame.up;
  kart.forward = frame.tangent;
  kart.gravityDir = scale(frame.up, -1);
  kart.heading = headingOf(frame.tangent, kart.heading);
  kart.velocity = scale(frame.tangent, speed);
  kart.speed = speed;
}
