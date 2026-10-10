import { describe, expect, it } from 'vitest';
import { createSimState } from '../sim/state';
import { DT } from '../sim/tuning';
import {
  GP_POINTS,
  gpStandings,
  mk8ResultRows,
  nextCourse,
  pointsFor,
  raceOfCup,
  resultChoices,
  type Mk8ResultRow,
} from './results';

/** A finished 4-kart race: kart 2 won, then 0 (you), 3, and 1 still racing. */
function finishedRace() {
  const state = createSimState({
    seed: 1,
    trackId: 'sunny-circuit',
    karts: [0, 1, 2, 3].map((i) => ({ position: { x: i * 3, y: 0, z: 0 }, heading: 0 })),
  });
  state.phase = 'finished';
  const finishAt = (kartId: number, seconds: number) => {
    const kart = state.karts[kartId];
    if (kart) kart.race.finishTick = state.race.goTick + Math.round(seconds / DT);
  };
  finishAt(2, 60);
  finishAt(0, 61.5);
  finishAt(3, 63);
  state.positions = [2, 0, 3, 1];
  return state;
}

const row = (kartId: number, position: number, you = false): Mk8ResultRow => ({
  kartId,
  position,
  racer: 'maple',
  name: `K${kartId}`,
  you,
});

describe('MK8 results (MK-121)', () => {
  it('lists the karts in the sim’s finishing order, your row marked, times of those finished', () => {
    const rows = mk8ResultRows(finishedRace(), 0);
    expect(rows.map((r) => [r.kartId, r.position, r.you])).toEqual([
      [2, 1, false],
      [0, 2, true],
      [3, 3, false],
      [1, 4, false],
    ]);
    expect(rows[0]?.time).toBeCloseTo(60, 5);
    expect(rows[1]?.time).toBeCloseTo(61.5, 5);
    expect(rows[3]?.time).toBeUndefined();
    // Names come from the racer (our racers here: MK8 racers register with MK8 Mode).
    expect(rows[0]?.name).toBeTruthy();
  });

  it('marks every local player’s row with their label in local multiplayer (MK-148)', () => {
    const rows = mk8ResultRows(finishedRace(), [0, 3]);
    expect(rows.map((r) => [r.kartId, r.you, r.player])).toEqual([
      [2, false, undefined],
      [0, true, 'P1'],
      [3, true, 'P2'],
      [1, false, undefined],
    ]);
    // One player: no labels, as before.
    expect(mk8ResultRows(finishedRace(), [0]).some((r) => r.player)).toBe(false);
  });

  it('gives MK8’s Grand Prix points: 15-12-10-9-8-7-6-5…, 0 past 12th', () => {
    expect(GP_POINTS.slice(0, 8)).toEqual([15, 12, 10, 9, 8, 7, 6, 5]);
    expect(pointsFor(1)).toBe(15);
    expect(pointsFor(8)).toBe(5);
    expect(pointsFor(13)).toBe(0);
  });

  it('adds the points to the totals and re-sorts the standings, ties to the better race place', () => {
    const rows = [row(4, 1), row(1, 2, true), row(2, 3), row(3, 4)];
    const before = new Map([
      [3, 20],
      [2, 2],
      [1, 0],
    ]);
    const standings = gpStandings(rows, before);
    expect(standings.map((s) => [s.kartId, s.gained, s.before, s.total, s.place])).toEqual([
      [3, 9, 20, 29, 1],
      [4, 15, 0, 15, 2],
      // 12 each: kart 1 came 2nd in the race, kart 2 3rd.
      [1, 12, 0, 12, 3],
      [2, 10, 2, 12, 4],
    ]);
    // A cup's first race: the standings are the race order.
    expect(gpStandings(rows).map((s) => s.kartId)).toEqual([4, 1, 2, 3]);
  });

  it('offers Next / Retry / Quit by mode', () => {
    expect(resultChoices('grand-prix', true)).toEqual(['next', 'quit']);
    expect(resultChoices('vs', true)).toEqual(['next', 'retry', 'quit']);
    expect(resultChoices('vs', false)).toEqual(['retry', 'quit']);
    expect(resultChoices('time-trial', true)).toEqual(['retry', 'quit']);
  });

  it('knows the next course of the cup and the race’s number in it', () => {
    expect(nextCourse({ cup: 'mushroom', course: 'stadium' })?.key).toBe('waterpark');
    expect(nextCourse({ cup: 'mushroom', course: 'ruins' })).toBeUndefined();
    expect(raceOfCup({ cup: 'mushroom', course: 'canyon' })).toEqual({ race: 3, of: 4 });
  });
});
