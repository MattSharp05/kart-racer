import { describe, expect, it } from 'vitest';
import { sunnyRace } from '../../../scenarios/race';
import { createSimState } from '../../../sim/state';
import { step } from '../../../sim/step';
import type { Loadout } from '../../../sim/types';
import { MK8_RACERS } from '../racers';
import { RACER_POINTS, isKnownLoadout } from '../stats';
import {
  MK8_BODIES,
  STANDARD_PARTS,
  defaultLoadout,
  mk8Body,
  mk8Glider,
  mk8Tires,
  resolveLoadout,
  standardLoadout,
} from '.';
import { TEST_RAMP_ID } from '../courses/test-ramp';
import { registerTestRamp } from '../courses/test-ramp/register';
import { soloLapTimes } from './lapTimes';

describe('MK8 kart parts (MK-102)', () => {
  it('every racer has a default loadout the table knows', () => {
    for (const racer of MK8_RACERS) {
      const loadout = defaultLoadout(racer.id);
      expect(loadout.racer).toBe(racer.id);
      expect(isKnownLoadout(loadout)).toBe(true);
    }
    expect(defaultLoadout('mk8-mario')).toEqual({ racer: 'mk8-mario', ...STANDARD_PARTS });
    expect(defaultLoadout('mk8-peach').glider).toBe('peach-parasol');
  });

  it('looks parts up by id; wheel anchors sit inside the body', () => {
    expect(mk8Body('b-dasher').name).toBe('B Dasher');
    expect(mk8Tires('monster-tires').diameter).toBeGreaterThan(mk8Tires('slick-tires').diameter);
    expect(mk8Glider('cloud-glider').kind).toBe('glider');
    expect(() => mk8Body('slick-tires')).toThrow(/Unknown MK8 part/);
    for (const body of MK8_BODIES)
      for (const share of Object.values(body.wheels)) {
        expect(share).toBeGreaterThan(0.4);
        expect(share).toBeLessThanOrEqual(1);
      }
  });

  it('a saved loadout keeps its known parts; unknown ones fall back to the racer default', () => {
    expect(resolveLoadout('mk8-toad')).toEqual(defaultLoadout('mk8-toad'));
    expect(() => resolveLoadout('mk8-rosalina')).toThrow(/Unknown MK8 racer/);
    const saved = { racer: 'mk8-mario', body: 'b-dasher', tires: 'roller', glider: 7 };
    expect(resolveLoadout('mk8-peach', saved as unknown as Partial<Loadout>)).toEqual({
      racer: 'mk8-peach',
      body: 'b-dasher',
      tires: 'standard-tires',
      glider: 'peach-parasol',
    });
  });
});

/**
 * Speed after `seconds` of full throttle from rest on Sunny Circuit's straight, or (MK-99's
 * surface-frame physics) on the synthetic MK8 test ramp's first straight.
 */
function speedAfter(loadout: Loadout | undefined, seconds: number, onMesh = false): number {
  if (onMesh) registerTestRamp();
  let state = createSimState({
    seed: 1,
    trackId: onMesh ? TEST_RAMP_ID : 'sunny-circuit',
    karts: [
      {
        kartType: 'maple',
        ...(onMesh ? { position: { x: 0, y: 0, z: 0 }, heading: -Math.PI / 2 } : {}),
        ...(loadout ? { loadout } : {}),
      },
    ],
  });
  for (let i = 0; i < seconds * 60; i += 1)
    state = step(state, [{ throttle: 1, brake: 0, steer: 0, drift: false, item: false }]).state;
  return state.karts[0]!.speed;
}

describe('loadouts in a race (MK-102)', () => {
  const heavy: Loadout = {
    racer: 'mk8-bowser',
    body: 'b-dasher',
    tires: 'slick-tires',
    glider: 'paper-glider',
  };
  const light: Loadout = {
    racer: 'mk8-toad',
    body: 'pipe-frame',
    tires: 'slim-tires',
    glider: 'cloud-glider',
  };

  it('changing parts changes how the kart drives: the light kart pulls away, the heavy one tops out higher', () => {
    expect(speedAfter(light, 1)).toBeGreaterThan(speedAfter(heavy, 1));
    expect(speedAfter(heavy, 12)).toBeGreaterThan(speedAfter(light, 12));
    expect(speedAfter({ ...heavy, tires: 'standard-tires' }, 3)).not.toBe(speedAfter(heavy, 3));
  });

  it('loadouts drive mesh tracks too (MK-99 surface-frame physics)', () => {
    expect(speedAfter(light, 1, true)).toBeGreaterThan(speedAfter(heavy, 1, true));
    expect(speedAfter(heavy, 3, true)).not.toBe(speedAfter(light, 3, true));
  });

  it("the player's loadout rides on their race entry; the AI karts have none", () => {
    const state = sunnyRace(3, { karts: 8, ai: true, playerLoadout: light });
    expect(state.karts[0]!.loadout).toEqual(light);
    expect(state.karts.slice(1).every((k) => k.loadout === undefined)).toBe(true);
    expect(sunnyRace(3, { karts: 8, ai: true }).karts[0]!.loadout).toBeUndefined();
  });

  it('the loadout travels with the kart state and races are deterministic', () => {
    const state = createSimState({ seed: 3, karts: [{ loadout: light }, {}] });
    expect(state.karts[0]!.loadout).toEqual(light);
    expect(state.karts[0]!.loadout).not.toBe(light);
    expect('loadout' in state.karts[1]!).toBe(false);
    expect(speedAfter(light, 2)).toBe(speedAfter(light, 2));
  });

  it('weight classes in the standard kart lap Sunny Circuit within 8 % of each other', () => {
    // One solo AI lap per stat group (racers in a group share every stat), averaged per weight
    // class over its racers; the flying lap (lap 2), so the standing start doesn't count.
    const byGroup = new Map<string, number>();
    const classes = new Map<string, number[]>();
    for (const racer of MK8_RACERS) {
      const group = JSON.stringify(RACER_POINTS[racer.id]);
      const time = byGroup.get(group) ?? soloLapTimes(standardLoadout(racer.id))[1] ?? Infinity;
      byGroup.set(group, time);
      classes.set(racer.weightClass, [...(classes.get(racer.weightClass) ?? []), time]);
    }
    const means = [...classes.values()].map((t) => t.reduce((a, b) => a + b, 0) / t.length);
    expect(means).toHaveLength(3);
    for (const mean of means) expect(mean).toBeLessThan(60);
    expect(Math.max(...means) / Math.min(...means)).toBeLessThan(1.08);
  }, 30_000);
});
