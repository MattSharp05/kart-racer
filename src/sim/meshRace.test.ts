// Racing on a mesh track (MK-105): the grid, item boxes, laps and positions, and AI that gets
// round, on the synthetic `mk8-test-ramp` (no pack needed).
import { beforeAll, describe, expect, it } from 'vitest';
import { registerTestRamp } from '../mk8/content/courses/test-ramp/register';
import { TEST_RAMP_ID } from '../mk8/content/courses/test-ramp';
import { meshAutopilotInput } from './ai/meshDriver';
import { createRace } from './race/createRace';
import { step } from './step';
import { getTrack } from './track';
import type { InputFrame, SimEvent, SimState } from './types';

beforeAll(registerTestRamp);

const RACE_SECONDS_MAX = 240;
const TICKS_PER_SECOND = 60;

function race(seed: number, laps = 3): SimState {
  return createRace({
    trackId: TEST_RAMP_ID,
    seed,
    laps,
    engineClass: 150,
    itemsOn: true,
    racers: [
      { kartId: 'maple', controller: 'local' },
      ...Array.from({ length: 7 }, () => ({ kartId: 'maple' as const, controller: 'ai' as const })),
    ],
  });
}

/** Runs the race with the player on the autopilot until every kart finished (or time runs out). */
function run(state: SimState): { state: SimState; events: SimEvent[]; stuck: number } {
  const track = getTrack(state.trackId);
  if (track.kind !== 'mesh') throw new Error('not a mesh track');
  const events: SimEvent[] = [];
  const still = new Map<number, number>();
  let stuck = 0;
  for (let i = 0; i < RACE_SECONDS_MAX * TICKS_PER_SECOND; i += 1) {
    const player = state.karts[0];
    const inputs: InputFrame[] = player ? [meshAutopilotInput(player, track, state.engineClass)] : [];
    const result = step(state, inputs);
    state = result.state;
    events.push(...result.events);
    if (state.phase === 'racing')
      for (const kart of state.karts) {
        const t = Math.abs(kart.speed) < 1 && kart.respawnTimer === 0 ? (still.get(kart.id) ?? 0) + 1 : 0;
        still.set(kart.id, t);
        stuck = Math.max(stuck, t / TICKS_PER_SECOND);
      }
    if (state.karts.every((k) => k.race.finishTick !== undefined)) break;
  }
  return { state, events, stuck };
}

describe('mesh track races (test ramp)', () => {
  it('puts 8 karts on the route grid and item boxes on the route rows', () => {
    const state = race(1);
    expect(state.karts).toHaveLength(8);
    expect(state.karts.every((k) => k.up !== undefined)).toBe(true);
    expect(state.entities.filter((e) => e.kind === 'itemBox')).toHaveLength(8);
  });

  it('a player on the autopilot and 7 AI finish 3 laps; laps and positions count', () => {
    const { state, events, stuck } = run(race(3));
    const finishes = events.filter((e) => e.type === 'finish');
    expect(finishes).toHaveLength(8);
    expect(state.karts.every((k) => k.race.lap > 3)).toBe(true);
    expect(events.filter((e) => e.type === 'lap' && e.kartId === 0)).toHaveLength(4);
    expect([...state.positions].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(stuck).toBeLessThan(5);
  });
});
