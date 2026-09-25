import { describe, expect, it } from 'vitest';
import { kartPhysics } from '../kartStats';
import { createSimState } from '../state';
import { step } from '../step';
import { DT } from '../tuning';
import { NEUTRAL_INPUT, type SimState } from '../types';
import { KART_IDS, kartDef, type KartId } from './karts';

const total = (id: KartId) => Object.values(kartDef(id).stats).reduce((a, b) => a + b, 0);

/** Seconds from rest to 95% of this kart's own top speed at 100cc. */
function timeTo95(kartType: KartId): number {
  const top = kartPhysics(kartType, 100).topSpeed;
  let s: SimState = createSimState({
    seed: 1,
    karts: [{ kartType, position: { x: 0, y: 0, z: 90 } }],
  });
  for (let t = 1; t < 600; t += 1) {
    s = step(s, [{ ...NEUTRAL_INPUT, throttle: 1 }]).state;
    if (s.karts[0]!.speed >= 0.95 * top) return t * DT;
  }
  return Infinity;
}

describe('kart roster', () => {
  it('has four karts with equal stat totals', () => {
    expect(KART_IDS).toHaveLength(4);
    const totals = KART_IDS.map(total);
    expect(new Set(totals).size).toBe(1);
  });

  it('keeps every stat between 1 and 5', () => {
    for (const id of KART_IDS) {
      for (const value of Object.values(kartDef(id).stats)) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(5);
      }
    }
  });

  it('top speed: Boulder (speed) > Maple (balanced) > Pixie (acceleration)', () => {
    const top = (id: KartId) => kartPhysics(id, 100).topSpeed;
    expect(top('boulder')).toBeGreaterThan(top('maple'));
    expect(top('maple')).toBeGreaterThan(top('pixie'));
  });

  it('Pixie reaches 95% of its top speed fastest', () => {
    const times = Object.fromEntries(KART_IDS.map((id) => [id, timeTo95(id)]));
    for (const id of KART_IDS) if (id !== 'pixie') expect(times.pixie).toBeLessThan(times[id]!);
  });

  it('Swoop turns tightest', () => {
    const handling = (id: KartId) => kartPhysics(id, 100).handling;
    for (const id of KART_IDS)
      if (id !== 'swoop') expect(handling('swoop')).toBeGreaterThan(handling(id));
  });

  it('a Boulder on the test pad really does out-run a Maple', () => {
    const run = (kartType: KartId) => {
      let s = createSimState({ seed: 1, karts: [{ kartType, position: { x: 0, y: 0, z: 95 } }] });
      for (let t = 0; t < Math.round(6 / DT); t += 1) {
        s = step(s, [{ ...NEUTRAL_INPUT, throttle: 1 }]).state;
      }
      return s.karts[0]!.speed;
    };
    expect(run('boulder')).toBeGreaterThan(run('maple'));
  });
});
