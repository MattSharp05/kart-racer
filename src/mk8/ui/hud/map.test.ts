import { beforeAll, describe, expect, it } from 'vitest';
import { registerTestRamp } from '../../content/courses/test-ramp/register';
import { TEST_RAMP_ID } from '../../content/courses/test-ramp';
import { registerMk8Content } from '../../register';
import scenarios from '../../../scenarios/mk8/hud';
import { tracks } from '../../../content/tracks';
import { routeGeometry } from '../../../sim/route';
import { step } from '../../../sim/step';
import { NEUTRAL_INPUT, type SimState } from '../../../sim/types';
import { headAt, kartProgress, mapProjection } from './map';

/** The minimap's size in the HUD, map units (one unit ≈ one mockup pixel). */
const SIZE = 190;
const PAD = 16;

beforeAll(() => {
  registerTestRamp();
  registerMk8Content();
});

function route() {
  const def = tracks.get(TEST_RAMP_ID).def;
  if (def.kind !== 'mesh') throw new Error('not a mesh track');
  return routeGeometry(def.route);
}

describe('the minimap projection (MK-127)', () => {
  it('fits the whole course inside the square, centred, with the padding', () => {
    const projection = mapProjection(TEST_RAMP_ID, SIZE, PAD)!;
    const points = Array.from({ length: 200 }, (_, i) => projection.at(i / 200));
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    for (const v of [...xs, ...ys]) {
      expect(v).toBeGreaterThanOrEqual(PAD - 0.5);
      expect(v).toBeLessThanOrEqual(SIZE - PAD + 0.5);
    }
    // The longer side spans the square (less the padding); the shorter is centred.
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    expect(Math.max(spanX, spanY)).toBeCloseTo(SIZE - PAD * 2, 0);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(SIZE / 2, 0);
    expect(projection.path.startsWith('M')).toBe(true);
  });

  it('is the course seen from above: +X right, −Z up', () => {
    const projection = mapProjection(TEST_RAMP_ID, SIZE, PAD)!;
    const [x0, y0] = projection.toMap(0, 0);
    const [x1] = projection.toMap(10, 0);
    const [, y1] = projection.toMap(0, -10);
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeLessThan(y0);
  });

  it('puts each racer’s head within 3 px of its route progress, through a race', () => {
    const projection = mapProjection(TEST_RAMP_ID, SIZE, PAD)!;
    const geometry = route();
    const found = scenarios.find((s) => s.name === 'mk8-hud-roulette')!;
    let state: SimState = found.setup(1).state;
    for (let i = 0; i < 240; i += 1) {
      state = step(
        state,
        state.karts.map(() => ({ ...NEUTRAL_INPUT, throttle: 1 })),
      ).state;
      if (i % 30 !== 0) continue;
      for (const kart of state.karts) {
        // Where the route says the kart is: its nearest centreline point.
        const t = geometry.project(kart.position, kart.race.lastT).t;
        const centre = geometry.frameAt(t).position;
        const [ex, ey] = projection.toMap(centre.x, centre.z);
        const [hx, hy] = headAt(projection, state.trackId, kart);
        expect(Math.hypot(hx - ex, hy - ey), `kart ${kart.id} tick ${state.tick}`).toBeLessThan(3);
      }
    }
  });

  it('places a kart the sim hasn’t tracked yet at its nearest centreline point', () => {
    const state = scenarios.find((s) => s.name === 'mk8-hud-roulette')!.setup(1).state;
    const kart = { ...state.karts[0]!, race: { ...state.karts[0]!.race, lastT: -1 } };
    const t = route().project(kart.position).t;
    expect(kartProgress(state.trackId, kart)).toBeCloseTo(t, 6);
  });

  it('has no map for a track without a centreline (the arena)', () => {
    const arena = tracks.list().find((t) => t.def.kind === 'arena');
    if (arena) expect(mapProjection(arena.id, SIZE, PAD)).toBeNull();
  });

  it('draws spline tracks too (MK8 items on our tracks)', () => {
    const spline = tracks.list().find((t) => t.def.kind === 'spline')!;
    expect(mapProjection(spline.id, SIZE, PAD)?.path.length).toBeGreaterThan(100);
  });
});
