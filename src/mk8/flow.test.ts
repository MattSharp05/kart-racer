import { afterEach, describe, expect, it } from 'vitest';
import { racers } from '../content/racers';
import { tracks } from '../content/tracks';
import { MK8_CUPS, MUSHROOM_COURSES } from './content/cups';
import { MK8_ITEM_SET } from './content/items/id';
import { DEFAULT_LOADOUT, raceSetup, STAND_IN_RACER } from './flow';

describe('MK8 race setup from the menus (MK-119)', () => {
  afterEach(() => {
    tracks.unregister('mk8-stadium');
    racers.unregister('mk8-test-racer');
  });

  it('races a course on its stand-in track until the course is registered, with the defaults', () => {
    // MK8 racers register when MK8 Mode opens (not in this test): our racer stands in for Mario.
    expect(racers.has(DEFAULT_LOADOUT.racer)).toBe(false);
    expect(raceSetup({ mode: 'vs', course: 'canyon' })).toEqual({
      course: 'canyon',
      cup: 'mushroom',
      trackId: 'dune-canyon',
      engineClass: 150,
      loadout: DEFAULT_LOADOUT,
      // MK-102: the default kart's parts are in MK8's stat table, so the race uses them.
      raceLoadout: DEFAULT_LOADOUT,
      playerKart: STAND_IN_RACER,
      itemSet: MK8_ITEM_SET,
      mode: 'vs',
    });
  });

  it('uses the chosen engine class and loadout, and the real course and racer once registered', () => {
    tracks.register({ ...tracks.get('sunny-circuit'), id: 'mk8-stadium' });
    racers.register({ ...racers.list()[0]!, id: 'mk8-test-racer' });
    const loadout = { racer: 'mk8-test-racer', body: 'pipe', tires: 'slick', glider: 'cloud' };
    const setup = raceSetup({ course: 'stadium', cup: 'mushroom', engineClass: 200, loadout });
    expect(setup).toMatchObject({
      trackId: 'mk8-stadium',
      engineClass: 200,
      playerKart: 'mk8-test-racer',
    });
    expect(setup.loadout).toEqual(loadout);
    // Parts the stat table doesn't know (MK-102): the kart races on its racer's own stats.
    expect(setup.raceLoadout).toBeUndefined();
  });

  it('keeps an unregistered racer in the loadout but drives the stand-in', () => {
    const loadout = { ...DEFAULT_LOADOUT, racer: 'mk8-not-there' };
    const setup = raceSetup({ course: 'ruins', loadout });
    expect(setup.loadout.racer).toBe('mk8-not-there');
    expect(setup.playerKart).toBe(STAND_IN_RACER);
  });

  it('refuses a race without a course or from a locked cup', () => {
    expect(() => raceSetup({ mode: 'vs' })).toThrow(/no course/);
    // MK-130: a Grand Prix picks its own course, the cup's first drivable one.
    expect(raceSetup({ mode: 'grand-prix' }).course).toBe('stadium');
    expect(() => raceSetup({ course: 'stadium', cup: 'star' })).toThrow(/locked/);
  });

  it('has the Mushroom Cup playable with 4 courses whose stand-ins are registered race tracks', () => {
    expect(MK8_CUPS.map((c) => [c.id, c.locked])).toEqual([
      ['mushroom', false],
      ['flower', true],
      ['star', true],
      ['special', true],
    ]);
    expect(MUSHROOM_COURSES.map((c) => c.key)).toEqual(['stadium', 'waterpark', 'canyon', 'ruins']);
    for (const course of MUSHROOM_COURSES) {
      const track = tracks.get(course.standIn);
      expect(track.testOnly, course.key).toBeFalsy();
      expect(track.def.kind, course.key).toBe('spline');
      const slots = track.def.kind === 'spline' ? (track.def.gridSlots?.length ?? 0) : 0;
      expect(slots, course.key).toBeGreaterThanOrEqual(8);
    }
  });
});
