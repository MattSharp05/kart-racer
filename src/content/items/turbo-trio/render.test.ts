import { describe, expect, it } from 'vitest';
import turboTrio from './render';

/** Rocket bodies in an icon (the outer ones orange, the middle one yellow). */
const rockets = (svg: string) => svg.match(/fill="#(ff8c1a|ffb703)"/g)?.length ?? 0;

describe('Turbo Trio view (MK-65 QA round 2)', () => {
  it('draws one rocket per boost left: 3, then 2, then 1', () => {
    expect(rockets(turboTrio.iconFor(3))).toBe(3);
    expect(rockets(turboTrio.iconFor(2))).toBe(2);
    expect(rockets(turboTrio.iconFor(1))).toBe(1);
    // The full icon (item boxes, roulette) is the three-rocket one.
    expect(turboTrio.iconFor(3)).toBe(turboTrio.icon);
  });
});
