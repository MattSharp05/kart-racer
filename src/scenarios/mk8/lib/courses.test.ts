// MK8 course scenarios (MK-105), built on the synthetic test ramp (the real course needs the pack).
import { beforeAll, describe, expect, it } from 'vitest';
import { testRampTrack } from '../../../mk8/content/courses/test-ramp';
import { registerTestRamp } from '../../../mk8/content/courses/test-ramp/register';
import { registerMk8Content } from '../../../mk8/register';
import { routeGeometry } from '../../../sim/route';
import { DT } from '../../../sim/tuning';
import { courseAntigrav, courseFinalLap, courseFromGrid, courseRace } from './courses';

beforeAll(() => {
  registerTestRamp();
  registerMk8Content();
});

describe('MK8 course scenarios (MK-105)', () => {
  it('race: 8 karts from the countdown with MK8 items, the player on the grid’s back half', () => {
    const state = courseRace(testRampTrack(), 1);
    expect(state.phase).toBe('countdown');
    expect(state.karts).toHaveLength(8);
    expect(state.itemSet).toBe('mk8');
    expect(state.karts[0]?.controller).toBe('local');
    expect(state.karts.filter((k) => k.controller === 'ai')).toHaveLength(7);
  });

  it('free drive: one kart at pole, on the road’s up', () => {
    const track = testRampTrack();
    const state = courseFromGrid(track, 1);
    const pole = routeGeometry(track.route).frameAt(track.route.gridSlots[0]?.t ?? 0);
    expect(state.phase).toBe('free');
    expect(state.karts[0]?.position).toEqual(pole.position);
    expect(state.karts[0]?.up).toEqual(pole.up);
  });

  it('anti-gravity: rolling towards the first anti-gravity zone, 25 m short of it', () => {
    const track = testRampTrack();
    const geometry = routeGeometry(track.route);
    const zone = track.route.zones.find((z) => z.kind === 'antigrav');
    const state = courseAntigrav(track, 1);
    const kart = state.karts[0];
    if (!kart) throw new Error('no kart');
    expect(kart.speed).toBeGreaterThan(0);
    if (zone?.kind === 'antigrav') {
      const t = geometry.project(kart.position).t;
      expect((zone.from - t) * geometry.length).toBeCloseTo(25, 0);
    }
  });

  it('final lap: everyone just past the line on lap 3 of 3, the race clock agreeing with the laps', () => {
    const state = courseFinalLap(testRampTrack(), 1);
    expect(state.phase).toBe('racing');
    expect([...state.positions].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const kart of state.karts) {
      expect(kart.race.lap).toBe(state.race.laps);
      expect(kart.race.nextCheckpoint).toBe(1);
      const before = kart.race.lapTimes.reduce((a, b) => a + b, 0);
      expect((kart.race.lapStartTick - state.race.goTick) * DT).toBeCloseTo(before, 6);
    }
  });
});
