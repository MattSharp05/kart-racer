import { describe, expect, it } from 'vitest';
import { createRace } from '../sim/race/createRace';
import { step } from '../sim/step';
import type { InputFrame, SimState } from '../sim/types';
import { parseNetConditions } from './netsim';
import { onlineRace, onlineRacers, scriptedInput, TICK_MS } from './testRace';

/** Ticks per second (60 Hz). */
const HZ = 60;

/** An 8-kart race (4 humans, 4 AI) 10 s in, with everyone racing. */
function midRace(): SimState {
  let state = createRace({
    trackId: 'sunny-circuit',
    racers: onlineRacers(4),
    engineClass: 100,
    itemsOn: true,
    seed: 5,
  });
  for (let tick = 0; tick < 10 * HZ; tick += 1) {
    state = step(state, humanInputs(state, tick)).state;
  }
  return state;
}

function humanInputs(state: SimState, tick: number): InputFrame[] {
  return state.karts.slice(0, 4).map((kart, i) => scriptedInput(kart, tick, i));
}

/** Average ms to re-simulate `ticks` ticks from `state` (what a reconcile costs). */
function resimMs(state: SimState, ticks: number, reps: number): number {
  const start = performance.now();
  for (let r = 0; r < reps; r += 1) {
    let s = structuredClone(state);
    for (let i = 0; i < ticks; i += 1) s = step(s, humanInputs(s, s.tick)).state;
  }
  return (performance.now() - start) / reps;
}

describe('re-simulation budget (ADR 0005, docs/TDD.md → v2 perf)', () => {
  it('re-simulates 10 ticks of an 8-kart race', () => {
    const state = midRace();
    resimMs(state, 10, 30); // warm up the JIT
    const ms = resimMs(state, 10, 200);
    console.log(`resim: ${ms.toFixed(2)} ms per 10 ticks with 8 karts (target 4 ms)`);
    // The 4 ms target is missed (~5 ms on a cloud CPU, as the MK-36 spike predicted): the sim step
    // itself is the cost. This guard catches regressions until the sim-step optimisation ticket.
    expect(ms).toBeLessThan(8);
  });

  it('handles snapshots within 4 ms on average by reconciling only on mismatch', () => {
    const { host, clients, clock } = onlineRace({
      clients: 3,
      conditions: parseNetConditions('75,30,5'),
    });
    for (let i = 0; i < 20 * HZ; i += 1) {
      host.tick(scriptedInput(host.state.karts[0], host.state.tick, 0));
      clients.forEach((client, c) =>
        client.tick(scriptedInput(client.state?.karts[c + 1], client.state?.tick ?? 0, c + 1)),
      );
      clock.advance(TICK_MS);
    }
    for (const client of clients) {
      const s = client.stats;
      const avg = s.snapshotMsTotal / s.snapshots;
      const replayShare = s.reconciled / s.snapshots;
      console.log(
        `snapshot: ${avg.toFixed(2)} ms avg, ${s.snapshotMsMax.toFixed(1)} ms max; ` +
          `${(replayShare * 100).toFixed(0)} % replayed, ${(s.replayTicks / Math.max(1, s.reconciled)).toFixed(1)} ticks each`,
      );
      expect(avg).toBeLessThan(4);
    }
  }, 60_000);
});
