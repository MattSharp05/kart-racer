import { describe, expect, it } from 'vitest';
import { raceResults } from '../sim/raceFlow';
import type { NetEvent } from './protocol';
import { parseNetConditions } from './netsim';
import { onlineRace, scriptedInput, TICK_MS } from './testRace';

/** Ticks per second (60 Hz). */
const HZ = 60;

describe('online race over loopback (ADR 0005)', () => {
  it('keeps 3 clients converged to the host at 150 ms RTT, 30 ms jitter, 5 % loss', () => {
    // 75 ms each way = 150 ms RTT.
    const { host, clients, clock } = onlineRace({
      clients: 3,
      conditions: parseNetConditions('75,30,5'),
    });
    const hostEvents: NetEvent[] = [];
    const clientEvents: NetEvent[][] = clients.map(() => []);
    /** Where each client showed its own kart at each tick, to compare once the host gets there. */
    const shown = clients.map(() => new Map<number, { x: number; z: number }>());
    let worstShown = 0;
    const shownErrors: number[] = [];
    let seq = 0;

    // Scripted driving until everyone has finished (a lap of Sunny Circuit is ~55 s, so at least
    // 30 s of it under these conditions), plus 1 s for the last packets.
    let ticks = 0;
    let finishedAt = Infinity;
    for (; ticks < finishedAt + HZ; ticks += 1) {
      if (ticks > 120 * HZ) throw new Error('The race never finished');
      if (host.state.phase === 'finished') finishedAt = Math.min(finishedAt, ticks);
      const events = host.tick(scriptedInput(host.state.karts[0], host.state.tick, 0));
      for (const event of events) {
        if (['finish', 'lap', 'kartHit', 'itemGranted'].includes(event.type)) {
          hostEvents.push({ seq: ++seq, tick: host.state.tick, event });
        }
      }
      const hostKarts = host.state.karts;
      clients.forEach((client, c) => {
        const kartId = c + 1;
        client.tick(scriptedInput(client.state?.karts[kartId], client.state?.tick ?? 0, kartId));
        const mine = client.state?.karts[kartId];
        if (client.state && mine) shown[c]?.set(client.state.tick, { ...mine.position });
        // The host has now simulated this tick: how far off was what the client showed?
        const was = shown[c]?.get(host.state.tick);
        const truth = hostKarts[kartId]?.position;
        // A hit is the host's to decide: the client only learns about it a round trip later.
        const hit = (hostKarts[kartId]?.spinTimer ?? 0) > 0;
        if (was && truth && !hit) {
          const error = Math.hypot(was.x - truth.x, was.z - truth.z);
          shownErrors.push(error);
          worstShown = Math.max(worstShown, error);
        }
        shown[c]?.delete(host.state.tick);
        clientEvents[c]?.push(...client.takeEvents());
      });
      clock.advance(TICK_MS);
    }

    for (const [c, client] of clients.entries()) {
      const peer = host.peers[c];
      expect(client.started).toBe(true);
      expect(client.stats.snapshots).toBeGreaterThan(0.9 * (ticks / 3));
      // Every snapshot's prediction of the client's own kart was within 0.5 m of the host's.
      expect(client.stats.predictionErrorMax).toBeLessThan(0.5);
      // The host almost always had the client's input in time (only while the RTT settles).
      expect(peer?.stats.lateInputs ?? 0).toBeLessThan(0.02 * ticks);
      // Reconcile only on mismatch: most snapshots needed no replay at all.
      expect(client.stats.matched).toBeGreaterThan(0.4 * client.stats.snapshots);
      // Snapshot size for 8 karts (ticket AC: < 600 B).
      expect(peer?.stats.snapshotBytesMax).toBeLessThan(600);
    }
    // What each player saw of their own kart vs where the host had it at that tick.
    expect(worstShown).toBeLessThan(0.5);
    shownErrors.sort((a, b) => a - b);
    expect(shownErrors[Math.floor(shownErrors.length * 0.99)]).toBeLessThan(0.2);

    // Everybody finished on the host, and every client's results equal the host's.
    expect(host.state.phase).toBe('finished');
    const hostResults = raceResults(host.state).filter((row) => row.time !== undefined);
    expect(hostResults.length).toBeGreaterThanOrEqual(4); // at least the 4 humans
    for (const [c, client] of clients.entries()) {
      const state = client.state;
      if (!state) throw new Error('client never started');
      // Finished karts come first, by finish: the host's rows lead the client's standings exactly.
      expect(raceResults(state).slice(0, hostResults.length)).toEqual(hostResults);
      // The host's own events reached every client, once each and in order.
      const got = (clientEvents[c] ?? [])
        .filter((e) => ['finish', 'lap', 'kartHit', 'itemGranted'].includes(e.event.type))
        .map((e) => ({ tick: e.tick, event: e.event }));
      const sent = hostEvents.map((e) => ({ tick: e.tick, event: e.event }));
      expect(got).toEqual(sent);
    }
  }, 90_000); // ~1 min of race time for 4 sims plus replays: ~20 s of CPU.
});
