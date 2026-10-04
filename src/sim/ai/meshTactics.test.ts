// The AI's MK8 tactics on mesh courses (MK-128), on the synthetic test ramp: drifting, coins,
// spin-boost bumps, lining up on the glide ramp and pitching the glider.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { testRampTrack, TEST_RAMP_LAYOUT as L } from '../../mk8/content/courses/test-ramp';
import { tOnA } from '../../mk8/content/courses/test-ramp/layout';
import { registerTestRamp } from '../../mk8/content/courses/test-ramp/register';
import { headingOf } from '../math';
import { routeGeometry } from '../route';
import { createSimState } from '../state';
import { tuning } from '../tuning';
import type { AiState, KartState, SimState } from '../types';
import { meshAiInput } from './meshDriver';
import { glidePitch, glideRampLine, meshTacticOffset, minWidthAhead } from './meshTactics';

beforeAll(registerTestRamp);

const track = () => testRampTrack();
const geometry = () => routeGeometry(track().route);
const ai = (): AiState => ({
  lineOffset: 0,
  skill: 1,
  aggression: 0,
  stuckTime: 0,
  recoverTime: 0,
});

/** Karts on the ramp's route at (lap fraction, lateral), facing along it, at `speed`. */
function race(spots: { t: number; lateral?: number; speed?: number }[]): SimState {
  const g = geometry();
  const state = createSimState({
    seed: 1,
    trackId: track().id,
    engineClass: 150,
    karts: spots.map(({ t, lateral = 0, speed = 0 }) => {
      const frame = g.frameAt(t, lateral);
      return {
        position: frame.position,
        heading: headingOf(frame.tangent, 0),
        up: frame.up,
        speed,
      };
    }),
  });
  state.karts.forEach((kart, i) => (kart.race.lastT = spots[i]!.t));
  return state;
}
const here = (kart: KartState) => geometry().project(kart.position, kart.race.lastT);

const saved = structuredClone(tuning.mk8.courseAi);
const savedDrift = tuning.ai.driftCurvature;
afterEach(() => {
  Object.assign(tuning.mk8.courseAi, saved);
  tuning.ai.driftCurvature = savedDrift;
});

describe('MK8 AI tactics (MK-128)', () => {
  it('goes for a coin just off its line ahead, not one too far off, and not with 10 coins', () => {
    const state = race([{ t: tOnA(30) }]);
    const kart = state.karts[0]!;
    // Line coins never move (their route places are cached by id): a new id for each place.
    const coinAt = (lateral: number) => ({
      id: 900 + lateral,
      position: geometry().frameAt(tOnA(45), lateral).position,
      respawnTimer: 0,
    });
    state.coins = [coinAt(2)];
    expect(meshTacticOffset(kart, ai(), state, geometry(), here(kart))).toBeCloseTo(2, 0);
    state.coins = [coinAt(5)];
    expect(meshTacticOffset(kart, ai(), state, geometry(), here(kart))).toBe(0);
    state.coins = [coinAt(2)];
    kart.coins = tuning.mk8.coins.max;
    expect(meshTacticOffset(kart, ai(), state, geometry(), here(kart))).toBe(0);
  });

  it('in anti-gravity, steers into a kart beside it for a spin boost (on a wide enough road)', () => {
    const state = race([
      { t: tOnA(50), lateral: -2 },
      { t: tOnA(50.5), lateral: 1.5 },
    ]);
    const [kart, other] = state.karts as [KartState, KartState];
    expect(meshTacticOffset(kart, ai(), state, geometry(), here(kart))).toBe(0);
    kart.antigrav = true;
    other.antigrav = true;
    expect(meshTacticOffset(kart, ai(), state, geometry(), here(kart))).toBeCloseTo(1.5, 0);
    // Not mid spin boost, and not on a strip narrower than `courseAi.minWidth`.
    kart.spinBoostTimer = 0.5;
    expect(meshTacticOffset(kart, ai(), state, geometry(), here(kart))).toBe(0);
    kart.spinBoostTimer = 0;
    tuning.mk8.courseAi.minWidth = 2 * L.roadHalfWidth + 1;
    expect(meshTacticOffset(kart, ai(), state, geometry(), here(kart))).toBe(0);
  });

  it('lines up on the glide ramp’s middle on the way to it, and only then', () => {
    const g = geometry();
    const s = (x: number) => tOnA(x) * g.length;
    expect(glideRampLine(g, track(), s(L.glide.from - 10))).toBe(0);
    expect(glideRampLine(g, track(), s((L.glide.from + L.glide.to) / 2))).toBe(0);
    expect(glideRampLine(g, track(), s(L.glide.from - tuning.mk8.courseAi.glideLead - 5))).toBe(
      undefined,
    );
    expect(glideRampLine(g, track(), s(L.gap.to + 5))).toBe(undefined);
  });

  it('on the glider, floats over the gap’s void and dives where there’s road below', () => {
    const over = (x: number) => {
      const kart = race([{ t: tOnA(x) }]).karts[0]!;
      kart.position = { ...kart.position, y: L.glide.rise + 2 };
      return glidePitch(kart, track());
    };
    expect(over((L.gap.from + L.gap.to) / 2)).toEqual({ throttle: 0, brake: 1 });
    expect(over(L.gap.to + 10)).toEqual({ throttle: 1, brake: 0 });
  });

  it('drifts into a tight corner at speed, as on spline tracks; never on a narrow strip', () => {
    tuning.ai.driftCurvature = 0.02;
    const drives = (minWidth: number) => {
      tuning.mk8.courseAi.minWidth = minWidth;
      const state = race([{ t: tOnA(L.straightTo - 8), speed: 25 }]);
      const kart = state.karts[0]!;
      return meshAiInput(kart, ai(), track(), 150, true, 0, state).drift;
    };
    expect(drives(8)).toBe(true);
    expect(drives(2 * L.roadHalfWidth + 1)).toBe(false);
  });

  it('measures the road’s narrowest width ahead', () => {
    expect(minWidthAhead(geometry(), 0, 30)).toBeCloseTo(2 * L.roadHalfWidth, 5);
  });
});
