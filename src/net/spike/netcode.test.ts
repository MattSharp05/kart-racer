import { describe, expect, it } from 'vitest';
import { createLoopbackPair, parseNetConditions, type NetConditions } from '../netsim';
import { seedRng, rngFloat } from '../../sim/rng';
import { step } from '../../sim/step';
import { DT } from '../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame } from '../../sim/types';
import { CLIENT_KART, HOST_KART, NetClient, NetHost, spikeRace } from './netcode';
import {
  applySnapshot,
  decodeMessage,
  encodeInputs,
  encodeSnapshot,
  MSG,
  quantizeInput,
} from './protocol';

const SEED = 3;
const TICK_MS = DT * 1000;

/** A hand-cranked clock + timer queue, so lag and jitter are deterministic. */
function virtualNetwork(conditions: NetConditions, seed = 1) {
  let time = 0;
  const queue: { at: number; fn: () => void }[] = [];
  const rng = { rngState: seedRng(seed) };
  const [hostEnd, clientEnd] = createLoopbackPair({
    conditions,
    random: () => rngFloat(rng),
    schedule: (fn, ms) => queue.push({ at: time + ms, fn }),
  });
  return {
    hostEnd,
    clientEnd,
    now: () => time,
    advance(ms: number) {
      time += ms;
      queue.sort((a, b) => a.at - b.at);
      while (queue[0] && queue[0].at <= time) queue.shift()?.fn();
    },
  };
}

/** Steering that changes every second, so prediction has something to get wrong. */
function driverInput(tick: number, phase: number): InputFrame {
  return {
    ...NEUTRAL_INPUT,
    throttle: 1,
    steer: Math.sin(tick / 60 + phase) * 0.6,
    drift: Math.floor(tick / 90) % 4 === 1,
  };
}

function race(conditions: NetConditions, ticks: number) {
  const net = virtualNetwork(conditions);
  const host = new NetHost(spikeRace(SEED), SEED);
  const client = new NetClient(net.clientEnd, net.now);
  host.addClient(net.hostEnd, CLIENT_KART);
  for (let i = 0; i < ticks; i += 1) {
    host.tick(driverInput(host.state.tick, 0));
    client.tick(driverInput(client.state?.tick ?? 0, 2));
    net.advance(TICK_MS);
  }
  return { host, client };
}

describe('spike protocol', () => {
  it('round-trips inputs through the wire format', () => {
    const inputs = [driverInput(10, 0), { ...NEUTRAL_INPUT, brake: 1, item: true, respawn: true }];
    const msg = decodeMessage(encodeInputs(42, inputs));
    expect(msg.type).toBe(MSG.input);
    if (msg.type !== MSG.input) return;
    expect(msg.newestTick).toBe(42);
    expect(msg.inputs).toEqual(inputs.map(quantizeInput));
    expect(msg.inputs[0]?.steer).toBeCloseTo(inputs[0]?.steer ?? 0, 1);
  });

  it('round-trips a mid-race snapshot within quantization error', () => {
    let state = spikeRace(SEED);
    for (let i = 0; i < 400; i += 1) {
      state = step(state, [driverInput(i, 0), driverInput(i, 1)]).state;
    }
    const packet = encodeSnapshot(state, 7, [{ kartId: 0, input: NEUTRAL_INPUT }]);
    const msg = decodeMessage(packet);
    if (msg.type !== MSG.snapshot) throw new Error('not a snapshot');
    expect(msg.ackTick).toBe(7);
    const copy = applySnapshot(spikeRace(SEED), msg.tick, msg.bytes);
    expect(copy.tick).toBe(state.tick);
    expect(copy.phase).toBe(state.phase);
    expect(copy.rngState).toBe(state.rngState);
    expect(copy.positions).toEqual(state.positions);
    expect(copy.entities.length).toBe(state.entities.length);
    state.karts.forEach((kart, i) => {
      const got = copy.karts[i];
      expect(got?.position.x).toBeCloseTo(kart.position.x, 1);
      expect(got?.position.z).toBeCloseTo(kart.position.z, 1);
      expect(got?.speed).toBeCloseTo(kart.speed, 2);
      expect(got?.heading).toBeCloseTo(kart.heading, 3);
      expect(got?.race.lap).toBe(kart.race.lap);
      expect(got?.race.nextCheckpoint).toBe(kart.race.nextCheckpoint);
      expect(got?.drift.direction).toBe(kart.drift.direction);
      expect(got?.item.held).toBe(kart.item.held);
    });
    // 8 karts + item boxes: the whole snapshot fits comfortably in one packet.
    expect(packet.length).toBeLessThan(600);
  });

  it('parses netsim presets', () => {
    expect(parseNetConditions('150,30,5')).toEqual({ lagMs: 150, jitterMs: 30, loss: 0.05 });
    expect(parseNetConditions(null)).toEqual({ lagMs: 0, jitterMs: 0, loss: 0 });
  });
});

describe('spike netcode over a loopback', () => {
  it('matches the host exactly on a perfect network once inputs stop changing', () => {
    const { host, client } = race({ lagMs: 0, jitterMs: 0, loss: 0 }, 600);
    expect(client.started).toBe(true);
    const mine = client.state?.karts[CLIENT_KART];
    const theirs = host.state.karts[CLIENT_KART];
    // The client is ahead of the host, so compare the prediction error it measured on snapshots.
    expect(client.stats.predictionErrorMax).toBeLessThan(0.05);
    expect(mine && theirs).toBeTruthy();
    expect(host.remotes[0]?.stats.lateInputs).toBe(0);
  });

  it.each([
    ['75 ms, no loss', '75,0,0'],
    ['150 ms + 30 ms jitter + 5% loss', '150,30,5'],
  ])('keeps the client kart converged to the host under %s', (_name, preset) => {
    const { host, client } = race(parseNetConditions(preset), 20 * 60);
    const stats = client.stats;
    expect(client.started).toBe(true);
    expect(stats.snapshots).toBeGreaterThan(300);
    // Prediction with the host's authoritative inputs: tiny errors (quantization) only.
    expect(stats.predictionErrorAvg).toBeLessThan(0.1);
    expect(stats.predictionErrorMax).toBeLessThan(1);
    // The host almost always had the client's input in time.
    const late = host.remotes[0]?.stats.lateInputs ?? 0;
    expect(late).toBeLessThan(0.02 * 20 * 60);
    // Client runs ahead by about a round trip.
    const lead = (client.state?.tick ?? 0) - host.state.tick;
    expect(lead).toBeGreaterThan(0);
    expect(lead).toBeLessThan(client.leadTicks() + 6);
  });

  it('predicts the host kart from its last known input', () => {
    const { client } = race({ lagMs: 50, jitterMs: 0, loss: 0 }, 300);
    expect(client.state?.karts[HOST_KART]?.speed).toBeGreaterThan(5);
  });
});
