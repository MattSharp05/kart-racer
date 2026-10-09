// MK8 race results (MK-121, the approved mockup's screen 9): the rows of the results screen in the
// sim's finishing order, MK8's Grand Prix points and the standings they make, and the choices the
// screen offers after a race in each mode. Pure (no DOM), so it is unit tested on plain states.
import { racers } from '../content/racers';
import { playerLabel } from '../input/slots';
import { raceResults } from '../sim/raceFlow';
import type { SimState } from '../sim/types';
import { MK8_CUPS, type Mk8Course } from './content/cups';
import type { Mk8RaceSetup } from './flow';
import type { Mk8GameMode } from './ui/screens/session';

/** MK8's Grand Prix points by finishing place, 1st to 12th (a race of 8 uses the first 8). */
export const GP_POINTS: readonly number[] = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

/** One row of the results: a kart's place, who it is and its race time. */
export interface Mk8ResultRow {
  kartId: number;
  /** Finishing place, 1 = first. */
  position: number;
  /** The kart's racer id (`mk8-mario`, or one of ours standing in). */
  racer: string;
  name: string;
  /** The local player's row (yellow); every local player's in local multiplayer (MK-148). */
  you: boolean;
  /** Which local player the row is (MK-148: "P2"), in a race with several. */
  player?: string;
  /** Race time, s; absent for a kart still racing. */
  time?: number;
}

/**
 * The results' rows in the sim's finishing order (`state.positions`), leader first. `local` is the
 * local player's kart, or (MK-148) every local player's by slot, P1 first.
 */
export function mk8ResultRows(state: SimState, local: number | readonly number[]): Mk8ResultRow[] {
  const players = typeof local === 'number' ? [local] : local;
  return raceResults(state).map((row) => {
    const slot = players.indexOf(row.kartId);
    const kart = state.karts[row.kartId];
    const racer = kart?.kartType ?? '';
    const known = racers.has(racer) ? racers.get(racer).name : racer;
    return {
      kartId: row.kartId,
      position: row.position,
      racer,
      name: kart?.name ?? known,
      you: slot >= 0,
      ...(slot >= 0 && players.length > 1 ? { player: playerLabel(slot) } : {}),
      ...(row.time !== undefined ? { time: row.time } : {}),
    };
  });
}

/** The points a finishing place earns in a Grand Prix (0 past the table). */
export function pointsFor(position: number): number {
  return GP_POINTS[position - 1] ?? 0;
}

/** A row of the Grand Prix standings: the race's row, the points it gained and the new total. */
export interface Mk8StandingRow extends Mk8ResultRow {
  gained: number;
  /** Points before this race. */
  before: number;
  total: number;
  /** Place in the standings, 1 = most points. */
  place: number;
}

/**
 * The standings after a race (`before`: each kart's points before it, none in a cup's first race):
 * most points first, a tie going to the better place in this race.
 */
export function gpStandings(
  rows: readonly Mk8ResultRow[],
  before: ReadonlyMap<number, number> = new Map(),
): Mk8StandingRow[] {
  return rows
    .map((row) => {
      const gained = pointsFor(row.position);
      const earlier = before.get(row.kartId) ?? 0;
      return { ...row, gained, before: earlier, total: earlier + gained, place: 0 };
    })
    .sort((a, b) => b.total - a.total || a.position - b.position)
    .map((row, i) => ({ ...row, place: i + 1 }));
}

/** What the results screen offers: the next race, the same race again, or MK8 Mode's menus. */
export type Mk8ResultChoice = 'next' | 'retry' | 'quit';

/** The choices after a race, by mode: a Grand Prix goes on (no retries), Time Trial retries. */
export function resultChoices(mode: Mk8GameMode, hasNext: boolean): Mk8ResultChoice[] {
  const next: Mk8ResultChoice[] = hasNext ? ['next'] : [];
  switch (mode) {
    case 'grand-prix':
      return [...next, 'quit'];
    case 'time-trial':
      return ['retry', 'quit'];
    default:
      return [...next, 'retry', 'quit'];
  }
}

/** The course after the race's one in its cup, or undefined after the cup's last. */
export function nextCourse(setup: Pick<Mk8RaceSetup, 'cup' | 'course'>): Mk8Course | undefined {
  const courses = MK8_CUPS.find((c) => c.id === setup.cup)?.courses ?? [];
  const at = courses.findIndex((c) => c.key === setup.course);
  return at < 0 ? undefined : courses[at + 1];
}

/** The race's number in its cup (1–4) and how many the cup has. */
export function raceOfCup(setup: Pick<Mk8RaceSetup, 'cup' | 'course'>): {
  race: number;
  of: number;
} {
  const courses = MK8_CUPS.find((c) => c.id === setup.cup)?.courses ?? [];
  return { race: courses.findIndex((c) => c.key === setup.course) + 1, of: courses.length };
}
