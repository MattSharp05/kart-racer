import { describe, expect, it } from 'vitest';
import { sunnyCircuit } from '../../content/tracks/sunny-circuit/sim';
import { autopilotInput } from '../autopilot';
import { step } from '../step';
import { trackGeometry } from '../track';
import { tuning } from '../tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from '../types';
import { createRace } from './createRace';
import { handToAi } from './takeover';

const geometry = trackGeometry(sunnyCircuit);

/** Kart 0 the host (local), kart 1 a remote player, the rest AI. */
function onlineRace(): SimState {
  return createRace({
    trackId: sunnyCircuit.id,
    racers: [
      { kartId: 'maple', controller: 'local', name: 'Host' },
      { kartId: 'pixie', controller: 'remote', name: 'Sam' },
      ...Array.from({ length: 6 }, () => ({
        kartId: 'boulder' as const,
        controller: 'ai' as const,
      })),
    ],
    engineClass: 100,
    itemsOn: false,
    seed: 5,
    laps: 1,
  });
}

/** Runs until the race is finished (or `maxTicks`), the host on the autopilot, kart 1 given nothing. */
function run(state: SimState, maxTicks: number): SimState {
  let s = state;
  for (let i = 0; i < maxTicks && s.phase !== 'finished'; i += 1) {
    const inputs: InputFrame[] = [];
    const host = s.karts[0];
    inputs[0] = host ? autopilotInput(host, geometry, 1) : NEUTRAL_INPUT;
    s = step(s, inputs).state;
  }
  return s;
}

describe('handToAi (MK-70)', () => {
  it('gives the kart to the AI with the fixed takeover driver, without touching the old state', () => {
    const before = onlineRace();
    const after = handToAi(before, 1);
    expect(before.karts[1]?.controller).toBe('remote');
    expect(before.karts[1]?.ai).toBeUndefined();
    expect(after.karts[1]?.controller).toBe('ai');
    expect(after.karts[1]?.ai).toMatchObject({
      skill: tuning.ai.takeoverSkill,
      lineOffset: tuning.ai.takeoverLineOffset,
      aggression: tuning.ai.takeoverAggression,
    });
    // Other karts and the RNG are unchanged: a client handing over at the same tick matches.
    expect(after.rngState).toBe(before.rngState);
    expect(after.karts[0]).toEqual(before.karts[0]);
  });

  it('leaves AI karts and unknown karts as they are', () => {
    const state = onlineRace();
    expect(handToAi(state, 3)).toBe(state);
    expect(handToAi(state, 42)).toBe(state);
  });

  it('drives the dropped kart round, and the race ends when the remaining person finishes', () => {
    // A remote kart nobody drives sits on the grid; handed to the AI mid-race, it races on.
    const start = run(onlineRace(), 60 * 10);
    const parked = start.karts[1]?.position;
    const handed = run(handToAi(start, 1), 60 * 5);
    const moved = handed.karts[1]!.position;
    expect(Math.hypot(moved.x - parked!.x, moved.z - parked!.z)).toBeGreaterThan(20);

    // Without the handover the race only ends when kart 1 finishes (never); with it, when the host does.
    const finished = run(handToAi(start, 1), 60 * 180);
    expect(finished.phase).toBe('finished');
    expect(finished.karts[0]?.race.finishTick).toBeDefined();
    const stuck = run(start, 60 * 120);
    expect(stuck.phase).toBe('racing');
  });

  it('is deterministic: the same handover at the same tick gives the same race', () => {
    const start = run(onlineRace(), 60 * 8);
    const a = run(handToAi(start, 1), 600);
    const b = run(handToAi(start, 1), 600);
    expect(a).toEqual(b);
  });
});
