import { afterEach, describe, expect, it } from 'vitest';
import { racers } from '../../content/racers';
import { tracks } from '../../content/tracks';
import { createRace } from '../../sim/race/createRace';
import { MK8_COURSES } from '../content/courses';
import { MUSHROOM_COURSES } from '../content/cups';
import { defaultLoadout } from '../content/parts';
import { MK8_RACERS } from '../content/racers';
import { raceSetup, STAND_IN_RACER } from '../flow';
import { registerMk8Content } from '../register';
import {
  currentCourse,
  GP_FIELD,
  gpCourses,
  gpOver,
  gpPoints,
  gpStandingsOf,
  gridSlots,
  playerPlace,
  recordRace,
  startGrandPrix,
  trophyFor,
  type Mk8GrandPrix,
} from './grandPrix';
import { SCRIPTED_FIELD, SCRIPTED_RACES, scriptedGrandPrix } from './scripted';
import { FIELD } from '../../scenarios/mk8/raceScreens';
import { GP_RACE_2, GP_RACE_4 } from '../../scenarios/mk8/grandPrix';

const ALL = MUSHROOM_COURSES.map((c) => c.key);

function cup(): Mk8GrandPrix {
  return startGrandPrix({
    cup: 'mushroom',
    engineClass: 150,
    player: defaultLoadout('mk8-mario'),
    seed: 7,
    courses: ALL,
  });
}

describe('Grand Prix field (MK-130)', () => {
  it('is you plus 7 different MK8 racers in their default karts, the same for the same seed', () => {
    const gp = cup();
    expect(gp.entrants).toHaveLength(GP_FIELD);
    expect(gp.entrants[0]!.racer).toBe('mk8-mario');
    const ids = gp.entrants.map((e) => e.racer);
    expect(new Set(ids).size).toBe(GP_FIELD);
    const known = new Set(MK8_RACERS.map((r) => r.id));
    for (const e of gp.entrants.slice(1)) {
      expect(known.has(e.racer)).toBe(true);
      expect(e.loadout).toEqual(defaultLoadout(e.racer));
    }
    expect(cup().entrants).toEqual(gp.entrants);
  });

  it('skips courses with no drivable content, racing the rest in cup order', () => {
    expect(gpCourses('mushroom', (pack) => pack !== 'water-park')).toEqual([
      'stadium',
      'canyon',
      'ruins',
    ]);
    // By default, the courses with content (MK-105's Stadium first, the rest as they land).
    const drivable = new Set(MK8_COURSES.map((c) => c.packId));
    const expected = MUSHROOM_COURSES.filter((c) => drivable.has(c.pack)).map((c) => c.key);
    expect(gpCourses('mushroom')).toEqual(expected);
    expect(expected[0]).toBe('stadium');
    // None drivable: every course, on its stand-in.
    expect(gpCourses('mushroom', () => false)).toEqual(ALL);
  });
});

describe('Grand Prix points and standings (MK-130)', () => {
  it('adds 15-12-10-9-8-7-6-5 over 4 scripted races', () => {
    let gp = cup();
    const totals: number[][] = [];
    for (const order of SCRIPTED_RACES) {
      expect(gpOver(gp)).toBe(false);
      gp = recordRace(gp, order);
      totals.push(gpPoints(gp));
    }
    expect(gpOver(gp)).toBe(true);
    expect(currentCourse(gp)).toBeUndefined();
    expect(totals[0]).toEqual([10, 9, 7, 15, 5, 12, 6, 8]);
    expect(totals[1]).toEqual([25, 21, 15, 25, 11, 21, 11, 15]);
    expect(totals[3]).toEqual([50, 38, 32, 47, 23, 48, 22, 28]);
    expect(gpStandingsOf(gp).map((r) => r.entrant)).toEqual([0, 5, 3, 1, 2, 7, 4, 6]);
    expect(playerPlace(gp)).toBe(1);
  });

  it('breaks a tie by the better place in the last race', () => {
    const gp = recordRace(recordRace(cup(), SCRIPTED_RACES[0]!), SCRIPTED_RACES[1]!);
    const rows = gpStandingsOf(gp);
    // 25 each: you won race 2, kart 3 was 3rd. 21: kart 1 2nd, kart 5 4th. 15: 2 (5th), 7 (6th).
    // 11: 4 (7th), 6 (8th).
    expect(rows.map((r) => [r.entrant, r.total])).toEqual([
      [0, 25],
      [3, 25],
      [1, 21],
      [5, 21],
      [2, 15],
      [7, 15],
      [4, 11],
      [6, 11],
    ]);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('puts karts missing from a finishing order last, and ignores strangers and repeats', () => {
    const gp = recordRace(cup(), [2, 2, 9, 0]);
    expect(gp.results[0]).toEqual([2, 0, 1, 3, 4, 5, 6, 7]);
  });

  it('awards gold, silver and bronze to the top 3 only', () => {
    expect([1, 2, 3, 4].map(trophyFor)).toEqual(['gold', 'silver', 'bronze', undefined]);
  });
});

describe('Grand Prix grid (MK-130)', () => {
  it('starts you at the back in race 1, then lines up the reverse of the standings', () => {
    let gp = cup();
    expect(gridSlots(gp)).toEqual([7, 0, 1, 2, 3, 4, 5, 6]);
    gp = recordRace(gp, SCRIPTED_RACES[0]!);
    // Standings 3, 5, 0, 1, 7, 2, 6, 4: the leader (3) starts last, the last (4) on pole.
    const slots = gridSlots(gp);
    expect(slots[3]).toBe(7);
    expect(slots[5]).toBe(6);
    expect(slots[0]).toBe(5);
    expect(slots[4]).toBe(0);
    expect(new Set(slots).size).toBe(GP_FIELD);
  });
});

describe('Grand Prix race setup (MK-130)', () => {
  afterEach(() => {
    tracks.unregister('mk8-stadium');
  });

  it('starts a cup on its first drivable course with the same rivals every race', () => {
    registerMk8Content();
    const setup = raceSetup({ mode: 'grand-prix', cup: 'mushroom', engineClass: 100 });
    expect(setup.course).toBe('stadium');
    expect(setup.gp?.courses).toEqual(gpCourses('mushroom'));
    expect(setup.field).toHaveLength(GP_FIELD);
    expect(setup.field?.[0]).toMatchObject({ controller: 'local', gridSlot: 7 });
    for (const [i, slot] of (setup.field ?? []).entries()) {
      if (i === 0) continue;
      expect(slot.controller).toBe('ai');
      expect(slot.kartId).toBe(setup.gp?.entrants[i]?.racer);
      expect(slot.loadout).toEqual(setup.gp?.entrants[i]?.loadout);
    }
    // The race is built with that field: kart i is entrant i.
    const state = createRace({
      trackId: 'sunny-circuit',
      racers: setup.field!,
      engineClass: 100,
      itemsOn: true,
      seed: 1,
    });
    expect(state.karts.map((k) => k.kartType)).toEqual(setup.field!.map((s) => s.kartId));
  });

  it('races the cup’s current course on the reverse grid', () => {
    const gp = recordRace(scriptedGrandPrix(0), SCRIPTED_RACES[0]!);
    const setup = raceSetup(
      { mode: 'grand-prix', cup: 'mushroom', course: 'stadium', engineClass: 150 },
      gp,
    );
    expect(setup.course).toBe('waterpark');
    expect(setup.trackId).toBe('neon-harbour');
    expect(setup.field?.map((s) => s.gridSlot)).toEqual(gridSlots(gp));
  });

  it('drives an AI racer that is not registered as the stand-in', () => {
    const gp = scriptedGrandPrix(0);
    const setup = raceSetup({ mode: 'grand-prix', cup: 'mushroom', engineClass: 150 }, gp);
    const unknown = setup.field?.find((s, i) => i > 0 && !racers.has(gp.entrants[i]!.racer));
    if (unknown) {
      expect(unknown.kartId).toBe(STAND_IN_RACER);
      expect(unknown.loadout).toBeUndefined();
    }
  });
});

describe('Scripted Grand Prix (MK-130 scenarios)', () => {
  it('has the scenarios’ field and finishing orders', () => {
    expect([...SCRIPTED_FIELD]).toEqual(FIELD);
    expect(SCRIPTED_RACES[1]).toEqual(GP_RACE_2);
    expect(SCRIPTED_RACES[3]).toEqual(GP_RACE_4);
    expect(scriptedGrandPrix(3).results).toHaveLength(3);
  });
});
