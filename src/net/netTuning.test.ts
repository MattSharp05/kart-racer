import { describe, expect, it } from 'vitest';
import { runLab } from './netLab';
import { oneWayOf } from './netsim';

/**
 * What the tuned netcode defaults (MK-73, ADR 0005 → "Tuning (MK-73)") promise a player on a bad
 * network: a 4-player room at `net-bad` (200 ms RTT, 50 ms jitter, 8 % loss), 30 s of racing,
 * every client drawing at 60 fps. Deterministic (virtual clock): these guard the feel, not speed.
 */

const NET_BAD = oneWayOf({ lagMs: 200, jitterMs: 50, loss: 0.08 });
const RACING_TICKS = 30 * 60;

describe('tuned netcode at net-bad (MK-73)', () => {
  const report = runLab({ clients: 3, conditions: NET_BAD, seed: 1, racingTicks: RACING_TICKS });

  it.each(report.clients.map((c) => [c.kartId, c] as const))(
    'client %i: own kart drawn smoothly and close to the truth',
    (_, client) => {
      // A 60 fps frame moves a kart ~0.5 m by itself; beyond its own motion it jumps ≤ 5 cm
      // (p99), and even the worst frame is under half a metre (no teleports).
      expect(client.ownJump.p99).toBeLessThan(0.05);
      expect(client.ownJump.max).toBeLessThan(0.5);
      expect(client.ownTruthError.p99).toBeLessThan(0.3);
    },
  );

  it.each(report.clients.map((c) => [c.kartId, c] as const))(
    "client %i: other players' karts never teleport",
    (_, client) => {
      // Their predicted karts are corrected by metres when they steer mid-flight; blending up to
      // `snapDistance` (8 m) keeps each frame's jump well under a metre (3 m snaps drew 4 m hops).
      expect(client.remoteJump.max).toBeLessThan(1);
      expect(client.remoteTruthError.p50).toBeLessThan(0.1);
    },
  );

  it.each(report.clients.map((c) => [c.kartId, c] as const))(
    'client %i: inputs on time, and within the bandwidth budget',
    (_, client) => {
      // Late inputs only while the RTT estimate settles at the start.
      expect(client.lateInputs).toBeLessThan(15);
      expect(client.downKBps).toBeLessThan(12);
      expect(client.upKBps).toBeLessThan(3);
      expect(client.ended).toBeNull();
    },
  );
});
