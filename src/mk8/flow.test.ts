import { afterEach, describe, expect, it } from 'vitest';
import { racers } from '../content/racers';
import { tracks } from '../content/tracks';
import { MK8_CUPS, MUSHROOM_COURSES } from './content/cups';
import { MK8_ITEM_SET } from './content/items/id';
import { DEFAULT_LOADOUT, raceSetup, STAND_IN_RACER } from './flow';

describe('MK8 race setup from the menus (MK-119)', () => {
  afterEach(() => {
    tracks.unregister('mk8-stadium');
    racers.unregister('mario');
  });

  it('races a course on its stand-in track until the course is registered, with the defaults', () => {
    expect(raceSetup({ mode: 'vs', course: 'canyon' })).toEqual({
      course: 'canyon',
      cup: 'mushroom',
      trackId: 'dune-canyon',
      engineClass: 150,
      loadout: DEFAULT_LOADOUT,
      playerKart: STAND_IN_RACER,
      itemSet: MK8_ITEM_SET,
    });
  });

  it('uses the chosen engine class and loadout, and the real course and racer once registered', () => {
    tracks.register({ ...tracks.get('sunny-circuit'), id: 'mk8-stadium' });
    racers.register({ ...racers.list()[0]!, id: 'mario' });
    const loadout = { racer: 'mario', body: 'pipe', tires: 'slick', glider: 'cloud' };
    const setup = raceSetup({ course: 'stadium', cup: 'mushroom', engineClass: 200, loadout });
    expect(setup).toMatchObject({ trackId: 'mk8-stadium', engineClass: 200, playerKart: 'mario' });
    expect(setup.loadout).toEqual(loadout);
  });

  it('keeps an unregistered racer in the loadout but drives the stand-in', () => {
    const loadout = { ...DEFAULT_LOADOUT, racer: 'bowser' };
    const setup = raceSetup({ course: 'ruins', loadout });
    expect(setup.loadout.racer).toBe('bowser');
    expect(setup.playerKart).toBe(STAND_IN_RACER);
  });

  it('refuses a race without a course or from a locked cup', () => {
    expect(() => raceSetup({ mode: 'grand-prix' })).toThrow(/no course/);
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
