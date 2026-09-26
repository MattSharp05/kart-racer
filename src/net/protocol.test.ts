import { describe, expect, it } from 'vitest';
import { createRace } from '../sim/race/createRace';
import { step } from '../sim/step';
import type { InputFrame, SimEvent, SimState } from '../sim/types';
import { raceFromSetup } from './client';
import { raceSetupOf } from './host';
import { handToAi } from '../sim/race/takeover';
import {
  applySnapshot,
  decodeMessage,
  encodeBye,
  encodeEvents,
  encodeInputs,
  encodePing,
  encodeSnapshot,
  encodeStart,
  MSG,
  PROTOCOL_VERSION,
  quantizeInput,
  withAck,
  type ByeReason,
  type NetMessage,
} from './protocol';
import { onlineRacers, scriptedInput } from './testRace';

const SEED = 11;
const OPTIONS = {
  trackId: 'sunny-circuit',
  racers: onlineRacers(4),
  engineClass: 150 as const,
  itemsOn: true,
  seed: SEED,
  laps: 2,
};

function decodeAs<T extends NetMessage['type']>(
  packet: Uint8Array,
  type: T,
): Extract<NetMessage, { type: T }> {
  const msg = decodeMessage(packet);
  if (msg.type !== type) throw new Error(`Expected message ${type}, got ${msg.type}`);
  return msg as Extract<NetMessage, { type: T }>;
}

/** A race 25 s in: karts spread out, drifting, with bananas and shells on the track. */
function midRace(): SimState {
  let state = createRace(OPTIONS);
  const held = ['green', 'banana', 'red', 'banana'] as const;
  for (let tick = 0; tick < 25 * 60; tick += 1) {
    if (tick % 300 === 0) held.forEach((item, i) => (state.karts[i]!.item.held = item));
    const inputs = state.karts.slice(0, 4).map((kart, i) => scriptedInput(kart, tick, i));
    state = step(state, inputs).state;
  }
  state.karts[0]!.race.lapTimes = [31.25];
  return state;
}

describe('net protocol (ADR 0005)', () => {
  it('round-trips Start with the race setup, and rebuilds the same race from it', () => {
    const host = createRace(OPTIONS);
    const setup = raceSetupOf(OPTIONS, host);
    setup.racers[2]!.name = 'Zoë 🏁';
    const msg = decodeAs(encodeStart(2, setup), MSG.start);
    expect(msg).toEqual({ type: MSG.start, version: PROTOCOL_VERSION, kartId: 2, setup });

    // The client's copy: the same race, with its own kart local and the other humans remote.
    host.karts[2]!.name = 'Zoë 🏁';
    const client = raceFromSetup(msg.setup, 2);
    const controllers = client.karts.map((kart) => kart.controller);
    expect(controllers).toEqual(['remote', 'remote', 'local', 'remote', 'ai', 'ai', 'ai', 'ai']);
    client.karts.forEach((kart, i) => (kart.controller = host.karts[i]!.controller));
    expect(client).toEqual(host);
  });

  it('decodes only the version of a Start from another protocol version', () => {
    const packet = encodeStart(1, raceSetupOf(OPTIONS, createRace(OPTIONS)));
    packet[1] = PROTOCOL_VERSION + 1;
    const msg = decodeAs(packet, MSG.start);
    expect(msg.version).toBe(PROTOCOL_VERSION + 1);
    expect(msg.setup.racers).toEqual([]);
  });

  it('round-trips inputs, quantized', () => {
    const inputs: InputFrame[] = [
      { throttle: 0.73, brake: 0.2, steer: -0.456, drift: true, item: false },
      { throttle: 0, brake: 1, steer: 1, drift: false, item: true, respawn: true },
      { throttle: 1, brake: 0, steer: -1, drift: false, item: false },
    ];
    const msg = decodeAs(encodeInputs(123_456, inputs), MSG.input);
    expect(msg.newestTick).toBe(123_456);
    expect(msg.inputs).toEqual(inputs.map(quantizeInput));
    // Quantizing is idempotent: host and client replay exactly the same frames.
    expect(msg.inputs.map(quantizeInput)).toEqual(msg.inputs);
    msg.inputs.forEach((input, i) => {
      expect(Math.abs(input.steer - inputs[i]!.steer)).toBeLessThanOrEqual(0.5 / 127);
      expect(Math.abs(input.throttle - inputs[i]!.throttle)).toBeLessThanOrEqual(0.5 / 255);
    });
  });

  it('round-trips a mid-race snapshot exactly after quantization, within the error bounds', () => {
    const state = midRace();
    expect(state.entities.some((e) => e.kind === 'shell' || e.kind === 'banana')).toBe(true);
    const humans = [
      { kartId: 0, age: 0, input: quantizeInput(scriptedInput(state.karts[0], 1, 0)) },
      { kartId: 1, age: 3, input: quantizeInput({ ...scriptedInput(state.karts[1], 1, 1) }) },
    ];
    const packet = encodeSnapshot(state, 1234, humans);
    const msg = decodeAs(packet, MSG.snapshot);
    expect(msg.tick).toBe(state.tick);
    expect(msg.ackTick).toBe(1234);
    expect(msg.humans).toEqual(humans);

    const copy = applySnapshot(createRace(OPTIONS), msg.tick, msg.bytes);
    // Exact after quantization: re-encoding the decoded state gives the same bytes.
    expect(encodeSnapshot(copy, 1234, humans)).toEqual(packet);
    expect(copy.tick).toBe(state.tick);
    expect(copy.phase).toBe(state.phase);
    expect(copy.rngState).toBe(state.rngState);
    expect(copy.positions).toEqual(state.positions);
    expect(copy.entities.map((e) => [e.id, e.kind])).toEqual(
      state.entities.map((e) => [e.id, e.kind]),
    );
    state.karts.forEach((kart, i) => {
      const got = copy.karts[i]!;
      const error = Math.hypot(
        got.position.x - kart.position.x,
        got.position.y - kart.position.y,
        got.position.z - kart.position.z,
      );
      expect(error).toBeLessThan(0.01); // < 1 cm
      const turn = Math.abs(
        Math.atan2(Math.sin(got.heading - kart.heading), Math.cos(got.heading - kart.heading)),
      );
      expect(turn).toBeLessThan((0.5 * Math.PI) / 180); // < 0.5°
      const { lap, nextCheckpoint, lapStartTick, finishTick, throttleSince, wrongWay } = kart.race;
      expect(got.race).toMatchObject({ lap, nextCheckpoint, lapStartTick, wrongWay });
      expect([got.race.finishTick, got.race.throttleSince]).toEqual([finishTick, throttleSince]);
      expect(got.race.lapTimes).toEqual(kart.race.lapTimes);
      expect(got.item.held).toBe(kart.item.held);
      expect(got.drift.direction).toBe(kart.drift.direction);
      expect(got.drift.tier).toBe(kart.drift.tier);
    });
    // The host encodes once and stamps each client's ack.
    const other = decodeAs(withAck(packet, 99), MSG.snapshot);
    expect(other.ackTick).toBe(99);
    expect(other.bytes).toEqual(msg.bytes);
    // Snapshot size for 8 karts (ticket AC).
    expect(packet.length).toBeLessThan(600);
  });

  it('carries a kart handed to the AI (MK-70): the copy hands it over too, and its AI memory follows', () => {
    let state = handToAi(midRace(), 2);
    for (let tick = 0; tick < 120; tick += 1) state = step(state, []).state;
    const kart = state.karts[2]!;
    expect(kart.controller).toBe('ai');
    kart.ai!.stuckTime = 0.5;
    const packet = encodeSnapshot(state, 0, []);
    const msg = decodeAs(packet, MSG.snapshot);
    // The client's copy still thinks kart 2 is a person's.
    const copy = createRace(OPTIONS);
    expect(copy.karts[2]!.controller).toBe('remote');
    applySnapshot(copy, msg.tick, msg.bytes);
    expect(copy.karts[2]!.controller).toBe('ai');
    expect(copy.karts[2]!.ai).toMatchObject({ skill: kart.ai!.skill, stuckTime: 0.5 });
    // The rest of the karts decode in step (the stream stayed aligned) and nobody else changed.
    expect(copy.karts.map((k) => k.controller)).toEqual(state.karts.map((k) => k.controller));
    expect(encodeSnapshot(copy, 0, [])).toEqual(packet);
  });

  it('round-trips every kind of race event', () => {
    const events: SimEvent[] = [
      { type: 'phaseChanged', phase: 'racing' },
      { type: 'checkpoint', kartId: 3, index: 2 },
      { type: 'lap', kartId: 1, lap: 2, lapTime: 41.25 },
      { type: 'lap', kartId: 1, lap: 1 },
      { type: 'positionChange', positions: [3, 1, 0, 2, 7, 6, 5, 4] },
      { type: 'countdown', value: 2 },
      { type: 'go' },
      { type: 'rocketStart', kartId: 4 },
      { type: 'stall', kartId: 5 },
      { type: 'finish', kartId: 2, position: 3, time: 95.13333333333334 },
      { type: 'respawn', kartId: 6 },
      { type: 'itemBoxHit', kartId: 7, boxId: 300 },
      { type: 'itemGranted', kartId: 0, item: 'lightning' },
      { type: 'itemUsed', kartId: 0, item: 'star' },
      { type: 'kartHit', kartId: 1, by: -1, kind: 'squash' },
      { type: 'kartHit', kartId: 1, by: 2, kind: 'red' },
      { type: 'star', kartId: 2 },
      { type: 'lightning', kartId: 3 },
      { type: 'wallHit', kartId: 4, strength: 0.625 },
      { type: 'bump', a: 1, b: 2, strength: 3.5 },
      { type: 'hop', kartId: 5 },
      { type: 'driftStart', kartId: 6, direction: -1 },
      { type: 'driftTier', kartId: 6, tier: 3 },
      { type: 'driftCancel', kartId: 6 },
      { type: 'miniTurbo', kartId: 6, tier: 2 },
      { type: 'boost', kartId: 7, seconds: 1.5 },
      { type: 'boostPad', kartId: 7 },
      { type: 'launch', kartId: 0 },
      { type: 'trick', kartId: 0 },
      { type: 'land', kartId: 0, airTime: 0.8166666666666667 },
    ];
    const types = new Set(events.map((e) => e.type));
    expect(types.size).toBe(28); // every SimEvent type
    const netEvents = events.map((event, i) => ({ seq: 1000 + i, tick: 70_000 + i, event }));
    const msg = decodeAs(encodeEvents(netEvents), MSG.event);
    expect(msg.events).toEqual(netEvents);
  });

  it.each<ByeReason>(['left', 'ended', 'kicked', 'version', 'dropped'])('round-trips Bye (%s)', (reason) => {
    expect(decodeMessage(encodeBye(reason))).toEqual({ type: MSG.bye, reason });
  });

  it('round-trips ping and pong', () => {
    expect(decodeMessage(encodePing(MSG.ping, 1234.5678))).toEqual({
      type: MSG.ping,
      time: 1234.5678,
    });
    expect(decodeMessage(encodePing(MSG.pong, 9))).toEqual({ type: MSG.pong, time: 9 });
  });

  it('rejects unknown and truncated packets', () => {
    expect(() => decodeMessage(new Uint8Array([99]))).toThrow();
    const packet = encodeInputs(5, [
      quantizeInput({ throttle: 1, brake: 0, steer: 0, drift: false, item: false }),
    ]);
    expect(() => decodeMessage(packet.subarray(0, packet.length - 1))).toThrow();
  });
});
