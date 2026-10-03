// MK8 Grand Prix (MK-130): a cup's races one after another for points. Pure (no DOM, no render):
// the state is plain JSON carried from race to race on the race setup (`Mk8RaceSetup.gp`), so it is
// unit tested on scripted races. Each entrant keeps one slot for the whole cup: kart id = entrant
// index in every race (0 is the player), so a race's `state.positions` are entrant indices.
import { rngFloat, seedRng, type RngHolder } from '../../sim/rng';
import type { EngineClass } from '../../sim/tuning';
import type { Loadout } from '../../sim/types';
import { mk8Course } from '../content/courses';
import { cupInfo, type Mk8CourseKey, type Mk8CupId } from '../content/cups';
import { defaultLoadout } from '../content/parts';
import { MK8_RACERS } from '../content/racers';
import { pointsFor } from '../results';

/** Karts in a Grand Prix race: the player and 7 AI. */
export const GP_FIELD = 8;

/** One racer of the cup: the same racer and kart in every race. */
export interface GpEntrant {
  racer: string;
  loadout: Loadout;
}

export interface Mk8GrandPrix {
  cup: Mk8CupId;
  engineClass: EngineClass;
  /** The cup's courses raced, in order: the ones not drivable yet are skipped (`gpCourses`). */
  courses: readonly Mk8CourseKey[];
  /** Index 0 is the player; the rest are the AI, the same ones all cup. */
  entrants: readonly GpEntrant[];
  /** Each race run so far: entrant indices in finishing order, winner first. */
  results: readonly (readonly number[])[];
}

/** A row of the cup's standings. */
export interface GpStanding {
  entrant: number;
  total: number;
  /** Finishing place in the last race (the tie-break), 1 = won; 0 before any race. */
  lastPlace: number;
  /** Place in the standings, 1 = most points. */
  place: number;
}

export type Trophy = 'gold' | 'silver' | 'bronze';

/**
 * The courses a Grand Prix of `cup` races: those with drivable content (MK-105's course folders),
 * in cup order. Courses not merged yet are skipped, so a cup runs from its first course on; a cup
 * with none drivable races every course on its stand-in track.
 */
export function gpCourses(
  cup: Mk8CupId,
  drivable: (pack: string) => boolean = (pack) => mk8Course(pack) !== undefined,
): Mk8CourseKey[] {
  const courses = cupInfo(cup).courses;
  const ready = courses.filter((c) => drivable(c.pack));
  return (ready.length > 0 ? ready : courses).map((c) => c.key);
}

/**
 * A new Grand Prix: the player's loadout and 7 other MK8 racers in their default karts, picked by
 * `seed` (the same seed, the same rivals).
 */
export function startGrandPrix(options: {
  cup: Mk8CupId;
  engineClass: EngineClass;
  player: Loadout;
  seed: number;
  courses?: readonly Mk8CourseKey[];
}): Mk8GrandPrix {
  const rng: RngHolder = { rngState: seedRng(options.seed) };
  const pool = [...MK8_RACERS]
    .map((r) => r.id)
    .filter((id) => id !== options.player.racer)
    .sort();
  // Fisher–Yates on the seeded stream.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rngFloat(rng) * (i + 1));
    [pool[i], pool[j]] = [pool[j] as string, pool[i] as string];
  }
  const rivals = pool.slice(0, GP_FIELD - 1).map((racer) => ({
    racer,
    loadout: defaultLoadout(racer),
  }));
  return {
    cup: options.cup,
    engineClass: options.engineClass,
    courses: [...(options.courses ?? gpCourses(options.cup))],
    entrants: [{ racer: options.player.racer, loadout: { ...options.player } }, ...rivals],
    results: [],
  };
}

/** The race being run (0-based): how many are done. */
export const raceIndex = (gp: Mk8GrandPrix): number => gp.results.length;

/** The course of the race being run, or undefined once every race is done. */
export const currentCourse = (gp: Mk8GrandPrix): Mk8CourseKey | undefined =>
  gp.courses[raceIndex(gp)];

/** Whether every race of the cup is done (the podium is next). */
export const gpOver = (gp: Mk8GrandPrix): boolean => raceIndex(gp) >= gp.courses.length;

/**
 * The cup after a race: `finishOrder` (entrant indices, winner first; `state.positions`) appended.
 * Entrants missing from it are put last, in index order.
 */
export function recordRace(gp: Mk8GrandPrix, finishOrder: readonly number[]): Mk8GrandPrix {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const i of finishOrder) {
    if (i >= 0 && i < gp.entrants.length && !seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  }
  gp.entrants.forEach((_, i) => {
    if (!seen.has(i)) order.push(i);
  });
  return { ...gp, results: [...gp.results, order] };
}

/** Each entrant's points over the races run (by entrant index). */
export function gpPoints(gp: Mk8GrandPrix, races = gp.results.length): number[] {
  const points = gp.entrants.map(() => 0);
  for (const order of gp.results.slice(0, races)) {
    order.forEach((entrant, place) => {
      points[entrant] = (points[entrant] ?? 0) + pointsFor(place + 1);
    });
  }
  return points;
}

/**
 * The standings after the races run: most points first, a tie going to the better place in the
 * last race (MK8's rule), then the entrant order.
 */
export function gpStandingsOf(gp: Mk8GrandPrix): GpStanding[] {
  const points = gpPoints(gp);
  const last = gp.results[gp.results.length - 1] ?? [];
  const lastPlace = (i: number) => last.indexOf(i) + 1;
  return gp.entrants
    .map((_, i) => ({ entrant: i, total: points[i] ?? 0, lastPlace: lastPlace(i), place: 0 }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        (a.lastPlace || Infinity) - (b.lastPlace || Infinity) ||
        a.entrant - b.entrant,
    )
    .map((row, i) => ({ ...row, place: i + 1 }));
}

/**
 * Grid slot of each entrant (by index; slot 0 is pole) for the race being run: the reverse of the
 * standings (MK8: the leader starts last). The first race, the AI in entrant order and the player
 * at the back.
 */
export function gridSlots(gp: Mk8GrandPrix): number[] {
  const n = gp.entrants.length;
  if (gp.results.length === 0) return gp.entrants.map((_, i) => (i === 0 ? n - 1 : i - 1));
  const slots = gp.entrants.map(() => 0);
  gpStandingsOf(gp).forEach((row) => {
    slots[row.entrant] = n - row.place;
  });
  return slots;
}

/** The trophy a final standings place wins (none past 3rd). */
export function trophyFor(place: number): Trophy | undefined {
  return (['gold', 'silver', 'bronze'] as const)[place - 1];
}

/** The player's final place in the standings. */
export function playerPlace(gp: Mk8GrandPrix): number {
  return gpStandingsOf(gp).find((row) => row.entrant === 0)?.place ?? gp.entrants.length;
}

/** A seed from the cup, class and player's racer (the same picks, the same rivals). */
export function gpSeed(cup: string, engineClass: number, racer: string): number {
  let h = 2166136261;
  for (const ch of `${cup}:${engineClass}:${racer}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
