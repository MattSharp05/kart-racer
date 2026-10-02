import { describe, expect, it } from 'vitest';
import { driveLaps } from './bench';
import { CollisionWorld, collisionFromObj, guessMaterials } from './collision';
import { syntheticCourse } from './course';
import { makeKart, SPIKE_TUNING, stepKart } from './kart';
import { parseObj } from './obj';

const course = syntheticCourse();
const obj = parseObj(course.obj);
const world = new CollisionWorld(collisionFromObj(obj, guessMaterials(obj.materials)));
describe('surface-frame kart on the synthetic anti-gravity course', () => {
  it('laps twice at 150cc top speed without falling off, through the roll and the 80° bank', () => {
    const { stats } = driveLaps(world, course, 2);
    expect(stats.laps).toBe(2);
    expect(stats.respawns).toBe(0);
    // Upside down on the roll's ceiling, at (or above) 150cc top speed the whole way round.
    expect(stats.minUpY).toBeLessThan(-0.99);
    expect(stats.minSpeedInRoll).toBeGreaterThan(SPIKE_TUNING.topSpeed * 0.97);
    expect(stats.airTicksAntigrav).toBe(0);
  });

  it('has no jitter at triangle edges: up turns smoothly and the ride height holds', () => {
    const { stats } = driveLaps(world, course, 1);
    // The roll turns up by ~3.4°/tick at most at 28 m/s; a face-normal snap at an edge would
    // show as a spike well above that.
    expect(stats.maxUpStepDeg).toBeLessThan(4);
    expect(stats.maxGapAntigrav).toBeLessThan(0.15);
  });

  it('falls off a plain-road wall but sticks to the same wall in anti-gravity', () => {
    // Banked turn D with anti-gravity turned off: the kart can't hold the 80° bank slowly.
    const slow = (antigrav: boolean) => {
      const i = course.samples.findIndex((s) => s.section === 'D') + 70;
      const s = course.samples[i]!;
      const kart = makeKart(s.c, s.t, s.u);
      kart.antigrav = antigrav;
      kart.grounded = true;
      for (let t = 0; t < 120; t++) {
        stepKart(world, kart, { throttle: 0, brake: 0, steer: 0, drift: false, item: false });
        kart.antigrav = antigrav && kart.antigrav;
      }
      return kart;
    };
    expect(slow(true).up[1]).toBeLessThan(0.3); // still on the wall
    const plain = slow(false);
    expect(plain.up[1]).toBeGreaterThan(0.9); // fell off and righted itself
    expect(plain.pos[1]).toBeLessThan(2);
  });
});
