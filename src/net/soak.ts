import { expect, it } from 'vitest';
import { runLab } from './netLab';
import { oneWayOf } from './netsim';

/**
 * The netcode soak (MK-73): a full 4-player room (host + 3 clients + 4 AI) races a lap over
 * loopback on the `net-bad` network (200 ms RTT, 50 ms jitter, 8 % loss), once per seed. Every
 * client must end with the host's results and the host's finish ticks and lap times for every
 * kart that finished: no desync. And nobody sees a teleport: no kart a client draws (its own or
 * another player's) jumps a metre or more in one frame beyond its own motion. The seeds are split
 * over two files so they run in parallel.
 */

/** `net-bad`, one way (the preset in `scenarios/online.ts`; net can't import scenarios). */
const NET_BAD = oneWayOf({ lagMs: 200, jitterMs: 50, loss: 0.08 });

/** One lap with 4 humans takes ~20 s of Node time; a slow CI runner up to 2–3×. */
const TIMEOUT_MS = 120_000;
/** A 60 fps frame at top speed moves a kart ~0.5 m by itself; a jump this big on top is a teleport. */
const TELEPORT_M = 1;

export const SOAK_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function soakRaces(seeds: readonly number[]): void {
  for (const seed of seeds) {
    it(
      `seed ${seed}: every client ends with the host's results, and nothing teleports`,
      () => {
        const report = runLab({ clients: 3, conditions: NET_BAD, seed });
        expect(report.results, 'the race ended with results').not.toBeNull();
        // Every human (kart 0 = host, 1-3 = clients) finished.
        const finished = (report.results ?? []).filter((s) => s.finishTick !== undefined);
        expect(finished.map((s) => s.kartId)).toEqual(expect.arrayContaining([0, 1, 2, 3]));
        for (const client of report.clients) {
          expect(client.ended, `client ${client.kartId} still in the race`).toBeNull();
          expect(client.results, `client ${client.kartId}'s results`).toEqual(report.results);
          expect(client.mismatchedFinishes, `client ${client.kartId}'s finishes`).toEqual([]);
          expect(client.ownJump.max, `client ${client.kartId}'s own kart`).toBeLessThan(TELEPORT_M);
          expect(client.remoteJump.max, `client ${client.kartId}'s view of others`).toBeLessThan(
            TELEPORT_M,
          );
        }
      },
      TIMEOUT_MS,
    );
  }
}
