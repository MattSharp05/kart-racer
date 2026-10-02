import { describe, expect, it } from 'vitest';
import { wrapAngle } from '../../sim/kart';
import { forwardFromHeading } from '../../sim/math';
import { forwardOnSurface } from './frame';
import { angleBetween, normalize, rotateAbout, type V3 } from './vec';

const Y: V3 = [0, 1, 0];

describe('question 4: existing tracks with up = +Y', () => {
  it('heading → forward through the surface rotation is bit-identical to the sim at up = +Y', () => {
    for (let i = 0; i < 20_000; i++) {
      const heading = wrapAngle(i * 0.000_731 * Math.PI - Math.PI);
      const sim = forwardFromHeading(heading);
      const surface = forwardOnSurface(heading, Y);
      // toBe is Object.is: equal bits (a −0 / +0 difference would fail too).
      expect(surface[0]).toBe(sim.x);
      expect(surface[1]).toBe(sim.y);
      expect(surface[2]).toBe(sim.z);
    }
  });

  it('integrating a forward vector (the spike kart) is not bit-identical to integrating heading', () => {
    let heading = 0;
    let forward: V3 = [0, 0, -1];
    const yaw = -0.013;
    for (let i = 0; i < 600; i++) {
      heading = wrapAngle(heading + yaw);
      forward = normalize(rotateAbout(forward, Y, yaw));
    }
    const sim = forwardFromHeading(heading);
    expect(forward[0]).not.toBe(sim.x); // same direction to ~1e-13, different bits
    expect(Math.abs(forward[0] - sim.x)).toBeLessThan(1e-9);
  });

  it('a heading-based frame flips upside down: two ups 0.1° apart near −Y', () => {
    const tilt = (0.05 * Math.PI) / 180;
    // Tilted off −Y towards +X and towards +Z: the shortest arcs turn about Z and about X.
    const a: V3 = [Math.sin(tilt), -Math.cos(tilt), 0];
    const b: V3 = [0, -Math.cos(tilt), Math.sin(tilt)];
    expect(angleBetween(a, b)).toBeLessThan((0.1 * Math.PI) / 180);
    // Same heading, nearly the same (upside-down) surface: forward points the opposite way.
    const fa = normalize(forwardOnSurface(0, a));
    const fb = normalize(forwardOnSurface(0, b));
    expect(angleBetween(fa, fb)).toBeGreaterThan(Math.PI * 0.99);
  });
});
