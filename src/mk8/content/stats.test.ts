import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kartPhysics, loadoutPhysics } from '../../sim/kartStats';
import type { Loadout } from '../../sim/types';
import { MK8_BODIES, MK8_GLIDERS, MK8_TIRES, standardLoadout } from './parts';
import { MK8_RACERS } from './racers';
import {
  BODY_POINTS,
  GLIDER_POINTS,
  RACER_POINTS,
  TIRE_POINTS,
  isKnownLoadout,
  loadoutStats,
} from './stats';

const sources = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../tools/mk8/sources.json'), 'utf8'),
) as { models: { id: string; kind: string }[] };

describe('MK8 stat table (MK-102)', () => {
  it('has every racer and part, and every part has a pack model', () => {
    expect(Object.keys(RACER_POINTS).sort()).toEqual(MK8_RACERS.map((r) => r.id).sort());
    expect(Object.keys(BODY_POINTS).sort()).toEqual(MK8_BODIES.map((p) => p.id).sort());
    expect(Object.keys(TIRE_POINTS).sort()).toEqual(MK8_TIRES.map((p) => p.id).sort());
    expect(Object.keys(GLIDER_POINTS).sort()).toEqual(MK8_GLIDERS.map((p) => p.id).sort());
    expect(MK8_BODIES.length + MK8_TIRES.length + MK8_GLIDERS.length).toBe(13);
    const modelIds = new Map(sources.models.map((m) => [m.id, m.kind]));
    for (const part of MK8_BODIES) expect(modelIds.get(part.id)).toBe('body');
    for (const part of MK8_TIRES) expect(modelIds.get(part.id)).toBe('tire');
    for (const part of MK8_GLIDERS) expect(modelIds.get(part.id)).toBe('glider');
  });

  it("sums a loadout's points onto MK8's 0.75–5.75 scale", () => {
    // Mario in the standard kart, as MK8's kart builder shows it.
    expect(loadoutStats(standardLoadout('mk8-mario'))).toEqual({
      speed: 3.75,
      acceleration: 2.5,
      weight: 3.75,
      handling: 3.25,
      traction: 3.75,
      miniTurbo: 2.75,
    });
    // The fastest kart there is: 20 points of speed, the top of the scale.
    const fastest = { racer: 'mk8-bowser', body: 'b-dasher', tires: 'slick-tires' };
    expect(loadoutStats({ ...fastest, glider: 'paper-glider' }).speed).toBe(5.75);
    for (const racer of Object.keys(RACER_POINTS))
      for (const body of Object.keys(BODY_POINTS))
        for (const tires of Object.keys(TIRE_POINTS))
          for (const glider of Object.keys(GLIDER_POINTS))
            for (const value of Object.values(loadoutStats({ racer, body, tires, glider }))) {
              expect(value).toBeGreaterThanOrEqual(0.75);
              expect(value).toBeLessThanOrEqual(5.75);
            }
  });

  it('a heavy racer on B Dasher + Slick is faster but slower off the line than a light one on Pipe Frame + Slim', () => {
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
    // From the table: Bowser 10 + B Dasher 5 + Slick 4 + Paper 1 = 20 speed points; Toad 2 + 3 + 3 + 1.
    expect(loadoutStats(heavy)).toMatchObject({ speed: 5.75, acceleration: 1.5, weight: 5.25 });
    expect(loadoutStats(light)).toMatchObject({ speed: 3, acceleration: 3.25, weight: 2.25 });
    const h = loadoutPhysics(heavy, 150);
    const l = loadoutPhysics(light, 150);
    expect(h.topSpeed).toBeGreaterThan(l.topSpeed);
    expect(h.timeTo95).toBeGreaterThan(l.timeTo95);
    expect(h.weight).toBeGreaterThan(l.weight);
    expect(h.handling).toBeLessThan(l.handling);
  });

  it('unknown racers or parts are refused', () => {
    const good = standardLoadout('mk8-toad');
    expect(isKnownLoadout(good)).toBe(true);
    for (const bad of [
      { ...good, racer: 'toad' },
      { ...good, body: 'steel-driver' },
      { ...good, tires: 'roller-tires' },
      { ...good, glider: 'toString' },
    ]) {
      expect(isKnownLoadout(bad)).toBe(false);
      expect(() => loadoutStats(bad)).toThrow(/Unknown MK8/);
    }
  });
});

describe('loadout physics (MK-102)', () => {
  it("a loadout replaces the racer's own stats; without one nothing changes", () => {
    const plain = kartPhysics('maple', 150);
    expect(plain.grip).toBe(1);
    const loadout = standardLoadout('mk8-bowser');
    expect(kartPhysics('maple', 150, loadout)).toEqual(loadoutPhysics(loadout, 150));
    expect(kartPhysics('maple', 150, loadout)).not.toEqual(plain);
  });

  it('a neutral stat maps to the neutral physics; traction and mini-turbo scale grip and charge', () => {
    // Peach in the standard kart has speed 3.25 (= neutral): the class top speed exactly.
    const peach = loadoutPhysics(standardLoadout('mk8-peach'), 150);
    expect(peach.topSpeed).toBe(28);
    const monster = loadoutPhysics(
      { ...standardLoadout('mk8-peach'), tires: 'monster-tires' },
      150,
    );
    const slick = loadoutPhysics({ ...standardLoadout('mk8-peach'), tires: 'slick-tires' }, 150);
    expect(monster.grip).toBeGreaterThan(slick.grip);
    const pipe = loadoutPhysics({ ...standardLoadout('mk8-toad'), body: 'pipe-frame' }, 150);
    const mach = loadoutPhysics({ ...standardLoadout('mk8-toad'), body: 'mach-8' }, 150);
    expect(pipe.driftCharge).toBeGreaterThan(mach.driftCharge);
  });
});
