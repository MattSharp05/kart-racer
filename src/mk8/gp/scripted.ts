// Scripted Grand Prix (MK-130) for the `mk8-gp-*` scenarios on the test ramp: a 150cc Mushroom Cup
// over all 4 courses with Mario (you) and 7 rivals, its races' finishing orders fixed. A race
// scenario names one by its `mk8Start` hint; `raceScreens.ts` reads the cup from it.
import type { Mk8CourseKey } from '../content/cups';
import { MUSHROOM_COURSES } from '../content/cups';
import { defaultLoadout } from '../content/parts';
import { recordRace, type Mk8GrandPrix } from './grandPrix';

/**
 * The cup's racers, kart by kart (you first): the field of MK-121's results scenarios, which the
 * `mk8-gp-*` scenarios copy (the main bundle stays free of MK8 code; a unit test keeps them equal).
 */
export const SCRIPTED_FIELD = [
  'mk8-mario',
  'mk8-luigi',
  'mk8-peach',
  'mk8-daisy',
  'mk8-yoshi',
  'mk8-toad',
  'mk8-koopa-troopa',
  'mk8-bowser',
] as const;

/** Each race's finishing order (entrant = kart id, you are 0), races 1–4. */
export const SCRIPTED_RACES: readonly (readonly number[])[] = [
  [3, 5, 0, 1, 7, 2, 6, 4],
  // Ties after race 2 (25, 21, 15 and 11 points), each broken by this race's places.
  [0, 1, 3, 5, 2, 7, 4, 6],
  [5, 3, 0, 2, 1, 4, 7, 6],
  [0, 5, 3, 1, 2, 7, 6, 4],
];

/** The scenario hints: the race being run in each. */
export const SCRIPTED_GP = {
  /** Race 2 under way (race 1 done). */
  'gp-race2': 1,
  /** Race 2 finished: its standings (race 1's points before). */
  'gp-standings': 1,
  /** Race 4 finished: straight to the podium. */
  'gp-podium': 3,
} as const;

export type ScriptedGpHint = keyof typeof SCRIPTED_GP;

export const isScriptedGp = (hint: string | undefined): hint is ScriptedGpHint =>
  hint !== undefined && Object.hasOwn(SCRIPTED_GP, hint);

/** The cup with `done` scripted races run. */
export function scriptedGrandPrix(done: number): Mk8GrandPrix {
  let gp: Mk8GrandPrix = {
    cup: 'mushroom',
    engineClass: 150,
    courses: MUSHROOM_COURSES.map((c): Mk8CourseKey => c.key),
    entrants: SCRIPTED_FIELD.map((racer) => ({ racer, loadout: defaultLoadout(racer) })),
    results: [],
  };
  for (const order of SCRIPTED_RACES.slice(0, done)) gp = recordRace(gp, order);
  return gp;
}

/** The cup of a scenario hint, before its race. */
export const scriptedGpFor = (hint: ScriptedGpHint): Mk8GrandPrix =>
  scriptedGrandPrix(SCRIPTED_GP[hint]);
