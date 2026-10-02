import { describe, expect, it } from 'vitest';
import { runLab, spread } from './netLab';
import { oneWayOf } from './netsim';
import { withTestRaceItems } from './testRace';

/**
 * What the tuned netcode defaults (MK-73, ADR 0005 → "Tuning (MK-73)") promise a player on a bad
 * network: a 4-player room at `net-bad` (200 ms RTT, 50 ms jitter, 8 % loss), 30 s of racing,
 * every client drawing at 60 fps. Deterministic (virtual clock): these guard the feel, not speed.
 */

const NET_BAD = oneWayOf({ lagMs: 200, jitterMs: 50, loss: 0.08 });
const RACING_TICKS = 30 * 60;
/**
 * The races these checks sample (MK-86). One race's percentiles sit inside the spread from race
 * to race (a single client's own-jump p99 ranged 0.013–0.055 m over seeds 1–10), so the
 * percentiles pool every client's frames over 3 seeds; the worst frames (max) still count per
 * client. The races run with the test item table (MVP six, frozen odds), so new items or new odds
 * don't move them. Pooled over any 3 consecutive seeds of 1–10: own jump p99 ≤ 0.044 m, own truth
 * error p99 ≤ 0.244 m.
 */
const SEEDS = [1, 2, 3];

describe('tuned netcode at net-bad (MK-73)', () => {
  const clients = withTestRaceItems(() =>
    SEEDS.flatMap((seed) =>
      runLab({ clients: 3, conditions: NET_BAD, seed, racingTicks: RACING_TICKS }).clients.map(
        (client) => ({ seed, ...client }),
      ),
    ),
  );
  const pooled = (read: (c: (typeof clients)[number]) => number[]) => spread(clients.flatMap(read));
  const cases = clients.map((c) => [c.seed, c.kartId, c] as const);

  it('own karts drawn smoothly and close to the truth', () => {
    // A 60 fps frame moves a kart ~0.5 m by itself; beyond its own motion it jumps ≤ 5 cm (p99
    // of every client's frames), and is drawn within 0.3 m of the host's kart (p99).
    expect(pooled((c) => c.samples.ownJump).p99).toBeLessThan(0.05);
    expect(pooled((c) => c.samples.ownTruthError).p99).toBeLessThan(0.3);
  });

  it.each(cases)('seed %i, client %i: own kart never teleports', (_, __, client) => {
    // Even the worst frame is under half a metre.
    expect(client.ownJump.max).toBeLessThan(0.5);
  });

  it.each(cases)("seed %i, client %i: other players' karts never teleport", (_, __, client) => {
    // Their predicted karts are corrected by metres when they steer mid-flight; blending up to
    // `snapDistance` (8 m) keeps each frame's jump well under a metre (3 m snaps drew 4 m hops).
    expect(client.remoteJump.max).toBeLessThan(1);
    expect(client.remoteTruthError.p50).toBeLessThan(0.1);
  });

  it.each(cases)(
    'seed %i, client %i: inputs on time, and within the bandwidth budget',
    (_, __, client) => {
      // Late inputs only while the RTT estimate settles at the start.
      expect(client.lateInputs).toBeLessThan(15);
      expect(client.downKBps).toBeLessThan(12);
      expect(client.upKBps).toBeLessThan(3);
      expect(client.ended).toBeNull();
    },
  );
});
