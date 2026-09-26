import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/types';
import { standingsOf } from './host';
import { parseNetConditions } from './netsim';
import { decodeMessage, encodeResults, MSG } from './protocol';
import { onlineRace, scriptedInput, TICK_MS } from './testRace';

/** Ticks per second (60 Hz). */
const HZ = 60;

describe('Results message (MK-55)', () => {
  it('round-trips the standings, finished or still racing', () => {
    const standings = [
      { kartId: 2, finishTick: 3690 },
      { kartId: 0, finishTick: 3725 },
      { kartId: 5 },
      { kartId: 1 },
    ];
    expect(decodeMessage(encodeResults(standings))).toEqual({ type: MSG.results, standings });
  });
});

describe('online race flow over loopback (MK-55)', () => {
  it('ends with the same frozen results on every device, and a countdown on the same ticks', () => {
    // 50 ms each way, 10 ms jitter, 5 % loss.
    const { host, clients, clock } = onlineRace({
      clients: 2,
      conditions: parseNetConditions('50,10,5'),
    });
    const goTick = host.state.race.goTick;
    /** Each device's countdown beats with the tick of the race it played them at. */
    const beats: { name: string; tick: number }[][] = [[], [], []];
    const beat = (device: number, events: readonly SimEvent[], tick: number) => {
      for (const event of events) {
        if (event.type === 'countdown') beats[device]?.push({ name: `${event.value}`, tick });
        if (event.type === 'go') beats[device]?.push({ name: 'go', tick });
      }
    };

    let endedAt = Infinity;
    let resultsAtEnd: ReturnType<typeof standingsOf> | null = null;
    let frozen: typeof host.results = null;
    for (let ticks = 0; ticks < endedAt + 2 * HZ; ticks += 1) {
      if (ticks > 120 * HZ) throw new Error('The race never finished');
      beat(0, host.tick(scriptedInput(host.state.karts[0], host.state.tick, 0)), host.state.tick);
      if (host.state.phase === 'finished' && endedAt === Infinity) {
        endedAt = ticks;
        resultsAtEnd = standingsOf(host.state);
        frozen = host.results;
      }
      clients.forEach((client, c) => {
        const kartId = c + 1;
        const input = scriptedInput(client.state?.karts[kartId], client.state?.tick ?? 0, kartId);
        const predicted = client.tick(input);
        const tick = client.state?.tick ?? 0;
        beat(c + 1, predicted, tick);
        beat(
          c + 1,
          client.takeEvents().map((e) => e.event),
          tick,
        );
      });
      clock.advance(TICK_MS);
    }

    // The host froze its standings the tick the race ended (every human finished)…
    expect(host.results).toEqual(resultsAtEnd);
    expect(host.results).toHaveLength(8);
    for (const kartId of [0, 1, 2]) {
      expect(host.results?.find((s) => s.kartId === kartId)?.finishTick).toBeDefined();
    }
    // …and kept them since (2 s more of racing).
    expect(host.results).toBe(frozen);
    for (const client of clients) expect(client.results).toEqual(host.results);

    // Everyone's countdown: 3, 2, 1, GO once each, on the same race ticks as the host's.
    const expected = beats[0];
    expect(expected?.map((b) => b.name)).toEqual(['3', '2', '1', 'go']);
    expect(expected?.at(-1)?.tick).toBe(goTick);
    for (const device of [1, 2]) {
      const played = beats[device] ?? [];
      expect(played.map((b) => b.name)).toEqual(['3', '2', '1', 'go']);
      // Played from this device's own race (the host's copy only arrives a lag later), so on the
      // host's ticks; the first beat can come from the host if it fell before the first snapshot.
      expect(played.slice(1)).toEqual(expected?.slice(1));
    }
  });

  it("doesn't wait for a player who left: results come once everyone still here finished", () => {
    const { host, clients, clock } = onlineRace({
      clients: 2,
      conditions: parseNetConditions('30,0,0'),
    });
    const [stayer, quitter] = clients as [(typeof clients)[0], (typeof clients)[0]];
    for (let ticks = 0; !host.results; ticks += 1) {
      if (ticks > 120 * HZ) throw new Error('No results: the room waited for the quitter');
      host.tick(scriptedInput(host.state.karts[0], host.state.tick, 0));
      stayer.tick(scriptedInput(stayer.state?.karts[1], stayer.state?.tick ?? 0, 1));
      // Kart 2's player quits 10 s into the race; the kart coasts from then on.
      if (ticks === 10 * HZ) quitter.leave();
      else if (ticks < 10 * HZ) {
        quitter.tick(scriptedInput(quitter.state?.karts[2], quitter.state?.tick ?? 0, 2));
      }
      clock.advance(TICK_MS);
    }
    expect(host.state.phase).toBe('racing'); // the quitter's kart never finished
    const finished = (kartId: number) =>
      host.results?.find((s) => s.kartId === kartId)?.finishTick !== undefined;
    expect([finished(0), finished(1), finished(2)]).toEqual([true, true, false]);
    for (let i = 0; i < HZ; i += 1) {
      host.tick(scriptedInput(host.state.karts[0], host.state.tick, 0));
      stayer.tick(scriptedInput(stayer.state?.karts[1], stayer.state?.tick ?? 0, 1));
      clock.advance(TICK_MS);
    }
    expect(stayer.results).toEqual(host.results);
  });
});
