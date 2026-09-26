import { describe, expect, it } from 'vitest';
import { NET } from './config';
import { parseNetConditions } from './netsim';
import { onlineRace, scriptedInput, TICK_MS } from './testRace';

/** Ticks per second (60 Hz). */
const HZ = 60;

type Race = ReturnType<typeof onlineRace>;
type Client = Race['clients'][number];

/** One tick of the room: the host, then each client still playing, then the network. */
function tickRoom({ host, clock }: Race, playing: readonly (Client | null)[]): void {
  host.tick(scriptedInput(host.state.karts[0], host.state.tick, 0));
  playing.forEach((client, c) => {
    if (!client) return;
    const kartId = c + 1;
    client.tick(scriptedInput(client.state?.karts[kartId], client.state?.tick ?? 0, kartId));
  });
  clock.advance(TICK_MS);
}

describe('drops (MK-70)', () => {
  it('a client that goes silent for 3 s becomes AI on the host, and the race ends with 8 results', () => {
    // 50 ms each way, 10 ms jitter, 5 % loss.
    const race = onlineRace({ clients: 2, conditions: parseNetConditions('100,10,5') });
    const { host, clients } = race;
    const [stayer, silent] = clients as [Client, Client];
    const silentAt = 10 * HZ;
    let droppedAt = -1;
    let lap = 0;
    for (let ticks = 0; !host.results; ticks += 1) {
      if (ticks > 150 * HZ) throw new Error('No results: the room waited for the dropped player');
      // Kart 2's tab freezes 10 s in (no Bye: it just stops sending).
      tickRoom(race, [stayer, ticks < silentAt ? silent : null]);
      if (droppedAt < 0 && host.state.karts[2]?.controller === 'ai') {
        droppedAt = ticks;
        lap = host.state.karts[2]?.race.lap ?? 0;
        // Reported once, for the toast, on the host and on the other client.
        expect(host.takeDrops()).toEqual([2]);
        expect(host.takeDrops()).toEqual([]);
      }
    }
    // Dropped 3 s after its last packet arrived (a lag, give or take jitter and loss, after
    // `silentAt`), not before.
    const heardFor = droppedAt - silentAt;
    expect(heardFor).toBeGreaterThanOrEqual(NET.dropAfterTicks);
    expect(heardFor).toBeLessThanOrEqual(NET.dropAfterTicks + 10);
    expect(host.peers[1]?.connected).toBe(false);

    // The race finished normally for everyone still here: 8 rows, the people with times.
    expect(host.state.phase).toBe('finished');
    expect(host.results).toHaveLength(8);
    for (const kartId of [0, 1]) {
      expect(host.results?.find((s) => s.kartId === kartId)?.finishTick).toBeDefined();
    }
    // The AI raced the dropped kart on (it didn't sit where it stopped).
    expect(host.state.karts[2]?.race.lap).toBeGreaterThanOrEqual(lap);
    const aiKart = host.state.karts[2]!;
    expect(aiKart.race.finishTick !== undefined || aiKart.race.lap > lap || aiKart.speed > 5).toBe(
      true,
    );

    for (let i = 0; i < HZ; i += 1) tickRoom(race, [stayer, null]);
    // The other client saw the kart change hands (toast) and predicts it as AI too.
    expect(stayer.takeDrops()).toEqual([2]);
    expect(stayer.state?.karts[2]?.controller).toBe('ai');
    expect(stayer.results).toEqual(host.results);
  });

  it('hands a kart to the AI on the next tick when its player says Bye or its link closes', () => {
    const race = onlineRace({ clients: 3, conditions: parseNetConditions('0,0,0') });
    const { host, clients } = race;
    const [a, b, c] = clients as [Client, Client, Client];
    for (let i = 0; i < 6 * HZ; i += 1) tickRoom(race, [a, b, c]);
    expect(host.state.karts.slice(0, 4).map((k) => k.controller)).toEqual([
      'local',
      'remote',
      'remote',
      'remote',
    ]);
    b.leave();
    race.clock.advance(TICK_MS);
    tickRoom(race, [a, null, c]);
    expect(host.state.karts[2]?.controller).toBe('ai');
    expect(host.takeDrops()).toEqual([2]);

    host.peers[2]!.transport.close();
    tickRoom(race, [a, null, null]);
    expect(host.state.karts[3]?.controller).toBe('ai');
    expect(host.takeDrops()).toEqual([3]);
    // Kart 1 is still its player's.
    expect(host.state.karts[1]?.controller).toBe('remote');
  });

  it("tells a dropped client it was dropped, if it's still listening", () => {
    const race = onlineRace({ clients: 1, conditions: parseNetConditions('0,0,0') });
    const [client] = race.clients as [Client];
    for (let i = 0; i < 4 * HZ; i += 1) tickRoom(race, [client]);
    // A backgrounded phone: the page stops ticking (sends nothing) but the link stays up.
    for (let i = 0; i < NET.dropAfterTicks + 5; i += 1) tickRoom(race, [null]);
    expect(race.host.state.karts[1]?.controller).toBe('ai');
    expect(client.ended).toBe('dropped');
  });

  it('a client knows it lost the host after 5 s of silence', () => {
    const race = onlineRace({ clients: 1, conditions: parseNetConditions('0,0,0') });
    const [client] = race.clients as [Client];
    for (let i = 0; i < 3 * HZ; i += 1) tickRoom(race, [client]);
    expect(client.hostLost).toBe(false);
    // The host's tab is gone without a Bye: the client ticks on alone.
    for (let i = 0; i < NET.hostLostTicks - 1; i += 1) {
      client.tick(scriptedInput(client.state?.karts[1], client.state?.tick ?? 0, 1));
      race.clock.advance(TICK_MS);
    }
    expect(client.hostLost).toBe(false);
    client.tick(scriptedInput(client.state?.karts[1], client.state?.tick ?? 0, 1));
    expect(client.hostLost).toBe(true);
    // A snapshot from the host and it's back.
    for (let i = 0; i < NET.snapshotEveryTicks; i += 1) tickRoom(race, [null]);
    expect(client.hostLost).toBe(false);
  }, 60_000); // A whole online race over loopback: ~9 s of CPU, more on CI's 2-core runner.

  it("doesn't drop anyone while the host isn't ticking (its tab in the background)", () => {
    const race = onlineRace({ clients: 1, conditions: parseNetConditions('0,0,0') });
    const [client] = race.clients as [Client];
    for (let i = 0; i < 4 * HZ; i += 1) tickRoom(race, [client]);
    // 10 s of the client alone: the host simulated nothing, so nobody is late.
    for (let i = 0; i < 10 * HZ; i += 1) {
      client.tick(scriptedInput(client.state?.karts[1], client.state?.tick ?? 0, 1));
      race.clock.advance(TICK_MS);
    }
    for (let i = 0; i < HZ; i += 1) tickRoom(race, [client]);
    expect(race.host.state.karts[1]?.controller).toBe('remote');
    expect(race.host.takeDrops()).toEqual([]);
  });
});
