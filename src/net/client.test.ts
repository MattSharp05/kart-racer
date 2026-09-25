import { beforeEach, describe, expect, it, vi } from 'vitest';
import { step } from '../sim/step';
import type { InputFrame } from '../sim/types';
import { OnlineClient } from './client';
import { OnlineHost } from './host';
import { createLoopbackPair, parseNetConditions } from './netsim';
import {
  decodeMessage,
  encodeSnapshot,
  encodeStart,
  MSG,
  PROTOCOL_VERSION,
  quantizeInput,
} from './protocol';
import { onlineRace, onlineRacers, scriptedInput, TICK_MS, virtualClock } from './testRace';

vi.mock('../sim/step', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sim/step')>();
  return { ...actual, step: vi.fn(actual.step) };
});
const stepSpy = vi.mocked(step);

const CLIENT_KART = 1;

beforeEach(() => {
  stepSpy.mockClear();
});

/** Host + 1 client at a steady 100 ms RTT, run until the client's clock has settled. */
function settledRace() {
  const race = onlineRace({ clients: 1, conditions: parseNetConditions('50,0,0') });
  const { host, clock } = race;
  const client = race.clients[0]!;
  /** What the test fed the client for each tick (quantized, as it's stored and sent). */
  const fed = new Map<number, InputFrame>();
  const tick = () => {
    host.tick(scriptedInput(host.state.karts[0], host.state.tick, 0));
    const input = scriptedInput(client.state?.karts[CLIENT_KART], client.state?.tick ?? 0, 1);
    if (client.state) fed.set(client.state.tick + 1, quantizeInput(input));
    client.tick(input);
  };
  for (let i = 0; i < 400; i += 1) {
    tick();
    clock.advance(TICK_MS);
  }
  return { host, client, clock, fed, tick };
}

describe('OnlineClient reconciliation (ADR 0005)', () => {
  it('re-simulates exactly the unacked inputs when a snapshot disagrees', () => {
    const { host, client, clock, fed, tick } = settledRace();
    // Tick until the host is about to snapshot, then knock the client's kart 1 m sideways on the
    // host, so that snapshot can't match the prediction.
    while ((host.state.tick + 1) % 3 !== 0) {
      tick();
      clock.advance(TICK_MS);
    }
    host.state.karts[CLIENT_KART]!.position.x += 1;
    const reconciled = client.stats.reconciled;
    tick();
    const snapshotTick = host.state.tick;
    clock.advance(TICK_MS);
    // Keep racing until that snapshot arrives (50 ms later); watch the sim only while it's handled.
    let before = 0;
    for (let i = 0; i < 10 && client.stats.reconciled === reconciled; i += 1) {
      tick();
      before = client.state!.tick;
      stepSpy.mockClear();
      clock.advance(TICK_MS);
    }

    expect(client.stats.reconciled).toBe(reconciled + 1);
    expect(client.state!.tick).toBe(before); // settled clock: no easing
    const replayed = stepSpy.mock.calls.map(([state, inputs]) => ({
      tick: state.tick + 1,
      input: inputs[CLIENT_KART],
    }));
    const unacked = [...fed.entries()]
      .filter(([t]) => t > snapshotTick && t <= before)
      .map(([t, input]) => ({ tick: t, input }));
    expect(unacked.length).toBeGreaterThan(3);
    expect(replayed).toEqual(unacked);
    expect(client.stats.lastReplayTicks).toBe(unacked.length);
  });

  it('keeps its prediction without re-simulating when a snapshot matches', () => {
    const { client, clock, tick } = settledRace();
    let quietMatches = 0;
    for (let i = 0; i < 300; i += 1) {
      tick();
      const matched = client.stats.matched;
      const at = client.state!.tick;
      stepSpy.mockClear();
      clock.advance(TICK_MS);
      if (client.stats.matched > matched && client.state!.tick === at) {
        expect(stepSpy).not.toHaveBeenCalled();
        quietMatches += 1;
      }
    }
    // Most snapshots match on a clean link.
    expect(quietMatches).toBeGreaterThan(50);
  });

  it('starts even when the first Start is lost', () => {
    let calls = 0;
    const [hostEnd, clientEnd] = createLoopbackPair({
      conditions: { lagMs: 0, jitterMs: 0, loss: 0.5 },
      random: () => (calls++ === 0 ? 0 : 0.99), // lose only the very first packet
      schedule: (fn) => fn(),
    });
    const host = new OnlineHost(
      {
        trackId: 'sunny-circuit',
        racers: onlineRacers(2),
        engineClass: 100,
        itemsOn: true,
        seed: 3,
      },
      0,
    );
    const client = new OnlineClient(clientEnd, () => 0);
    host.addClient(hostEnd, CLIENT_KART);
    for (let i = 0; i < 60; i += 1) {
      host.tick(scriptedInput(host.state.karts[0], i, 0));
      client.tick(scriptedInput(client.state?.karts[CLIENT_KART], i, 1));
    }
    expect(client.started).toBe(true);
    expect(client.kartId).toBe(CLIENT_KART);
    expect(host.peers[0]!.newestTick).toBeGreaterThan(0);
  });

  it('drops a malformed snapshot without losing the next good one', () => {
    const { host, client, clock, tick } = settledRace();
    const good = encodeSnapshot(host.state, 0, []);
    const snapshots = client.stats.snapshots;
    // A snapshot "from the future" whose state is cut short.
    const bad = encodeSnapshot({ ...host.state, tick: host.state.tick + 1000 }, 0, []);
    const hostEnd = host.peers[0]!.transport;
    hostEnd.send(bad.subarray(0, 40));
    hostEnd.send(good.subarray(0, good.length - 3));
    clock.advance(60);
    expect(client.stats.badPackets).toBe(2);
    expect(client.stats.snapshots).toBeGreaterThan(snapshots); // the regular ones still arrive
    for (let i = 0; i < 30; i += 1) {
      tick();
      clock.advance(TICK_MS);
    }
    expect(client.stats.staleSnapshots).toBe(0);
  });

  it('refuses a host speaking another protocol version', () => {
    const clock = virtualClock();
    const [hostEnd, clientEnd] = createLoopbackPair({ schedule: clock.schedule });
    const client = new OnlineClient(clientEnd, clock.now);
    const replies: number[] = [];
    hostEnd.onMessage((packet) => replies.push(decodeMessage(packet).type));
    const host = new OnlineHost(
      {
        trackId: 'sunny-circuit',
        racers: onlineRacers(2),
        engineClass: 100,
        itemsOn: true,
        seed: 3,
      },
      0,
    );
    const start = encodeStart(CLIENT_KART, host.setup);
    start[1] = PROTOCOL_VERSION + 1;
    hostEnd.send(start);
    clock.advance(1);
    expect(client.ended).toBe('version');
    expect(replies).toContain(MSG.bye);
    expect(client.started).toBe(false);
  });

  it('stops sending to a client that left, and ends the race for the others', () => {
    const { host, clients, clock } = onlineRace({
      clients: 2,
      conditions: parseNetConditions('20,0,0'),
    });
    for (let i = 0; i < 60; i += 1) {
      host.tick(scriptedInput(host.state.karts[0], i, 0));
      clients.forEach((client, c) =>
        client.tick(scriptedInput(client.state?.karts[c + 1], i, c + 1)),
      );
      clock.advance(TICK_MS);
    }
    clients[0]!.leave();
    clock.advance(TICK_MS * 3);
    expect(host.peers[0]!.connected).toBe(false);
    const sent = host.peers[0]!.stats.bytesSent;
    for (let i = 0; i < 30; i += 1) host.tick(scriptedInput(host.state.karts[0], i, 0));
    expect(host.peers[0]!.stats.bytesSent).toBe(sent);

    host.end();
    clock.advance(TICK_MS * 3);
    expect(clients[1]!.ended).toBe('ended');
    expect(clients[1]!.tick(scriptedInput(undefined, 0, 2))).toEqual([]);
  });

  it("rejects inputs for a kart the host doesn't give to a client", () => {
    const [hostEnd] = createLoopbackPair();
    const host = new OnlineHost(
      {
        trackId: 'sunny-circuit',
        racers: onlineRacers(2),
        engineClass: 100,
        itemsOn: true,
        seed: 3,
      },
      0,
    );
    expect(() => host.addClient(hostEnd, 5)).toThrow(); // an AI kart
  });
});
