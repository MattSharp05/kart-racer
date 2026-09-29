import { describe, expect, it } from 'vitest';
import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { KART_IDS } from '../sim/data/karts';
import { trackGeometry } from '../sim/track';
import { tuning } from '../sim/tuning';
import { sunnyLineup } from './menus';

describe('sunnyLineup', () => {
  const track = trackGeometry(sunnyCircuit);
  const state = sunnyLineup(1);

  it('parks every racer, in racer select order', () => {
    expect(state.karts.map((k) => k.kartType)).toEqual(KART_IDS);
  });

  it('keeps every kart on the road', () => {
    for (const kart of state.karts) {
      const { lateral, width } = track.project(kart.position);
      expect(Math.abs(lateral) + tuning.kartRadius).toBeLessThanOrEqual(width / 2);
    }
  });

  it('never overlaps two karts', () => {
    for (const [i, a] of state.karts.entries()) {
      for (const b of state.karts.slice(i + 1)) {
        const d = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
        expect(d).toBeGreaterThan(2 * tuning.kartRadius);
      }
    }
  });
});
