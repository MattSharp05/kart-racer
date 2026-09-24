import { describe, expect, it } from 'vitest';
import { scenarios } from '../../scenarios';
import { sunnyRace } from '../../scenarios/race';
import { autopilotInput } from '../autopilot';
import { sunnyCircuit } from '../data/tracks/sunnyCircuit';
import { raceProgress } from '../race';
import { step } from '../step';
import { trackGeometry } from '../track';
import { tuning } from '../tuning';
import { NEUTRAL_INPUT, type SimEvent, type SimState } from '../types';
import { rubberBandScale } from './rubberBand';

const geometry = trackGeometry(sunnyCircuit);
const setup = (name: string) => scenarios.get(name)!.setup(1).state;

/** AI race with the player parked in the grass on the infield side. */
function parkedRace(seed: number, rubberBand: boolean): SimState {
  const state = sunnyRace(seed, { karts: 8, ai: true });
  state.karts[0]!.position = geometry.pointAt(0.5, -geometry.wallOffset(16) + 1);
  state.race.rubberBand = rubberBand;
  return state;
}

function runRace(state: SimState, ticks: number) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const r = step(s, [NEUTRAL_INPUT]);
    s = r.state;
    events.push(...r.events);
    if (s.karts.slice(1).every((k) => k.race.finishTick !== undefined)) break;
  }
  return { state: s, events };
}

describe('AI drifting', () => {
  it('each AI earns at least one mini-turbo per lap at 100cc', () => {
    const { state, events } = runRace(parkedRace(1, false), 60 * 60 * 4);
    for (const kart of state.karts.slice(1)) {
      expect(kart.race.finishTick).toBeDefined();
      const turbos = events.filter((e) => e.type === 'miniTurbo' && e.kartId === kart.id);
      expect(turbos.length).toBeGreaterThanOrEqual(state.race.laps);
    }
  });

  it('ai-drift-corner: an AI gets a mini-turbo through the hairpin', () => {
    const { events } = runRace(setup('ai-drift-corner'), 60 * 8);
    expect(events.some((e) => e.type === 'miniTurbo' && e.kartId > 0)).toBe(true);
  });
});

describe('rubber-banding', () => {
  it('is +8% far behind the player, −10% far ahead, and 1.0 without a human player', () => {
    const behind = setup('race-player-far-ahead');
    expect(rubberBandScale(behind.karts[1]!, behind, geometry)).toBeCloseTo(
      1 + tuning.ai.rubberBandBoost,
      5,
    );
    const ahead = setup('race-player-far-behind');
    expect(rubberBandScale(ahead.karts[1]!, ahead, geometry)).toBeCloseTo(
      1 - tuning.ai.rubberBandBrake,
      5,
    );
    ahead.race.rubberBand = false;
    expect(rubberBandScale(ahead.karts[1]!, ahead, geometry)).toBe(1);
  });

  it('is exactly 1.0 within the final 200 m', () => {
    const state = setup('race-player-far-behind');
    const kart = state.karts[1]!;
    const t = 1 - 150 / geometry.length;
    kart.position = geometry.pointAt(t, 0);
    kart.race = { ...kart.race, lap: state.race.laps, lastT: t };
    expect(raceProgress(kart, t)).toBeGreaterThan(state.race.laps - 1);
    expect(rubberBandScale(kart, state, geometry)).toBe(1);
  });

  // With the player parked every AI is equally far ahead, so each gets the same −10% and the pack
  // can't close up. A driving player (the autopilot at 85%) is the meaningful case.
  it('with the player racing, the AI pack finishes closer together with it than without', () => {
    const spread = (rubberBand: boolean) => {
      let s = sunnyRace(3, { karts: 8, ai: true });
      s.race.rubberBand = rubberBand;
      for (let i = 0; i < 60 * 60 * 4; i += 1) {
        s = step(s, [autopilotInput(s.karts[0]!, geometry, 0.85)]).state;
        if (s.karts.slice(1).every((k) => k.race.finishTick !== undefined)) break;
      }
      const times = s.karts.slice(1).map((k) => k.race.finishTick ?? Infinity);
      return Math.max(...times) - Math.min(...times);
    };
    expect(spread(true)).toBeLessThan(spread(false));
  });
});
