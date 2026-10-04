import { beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../content/tracks';
import { MK8_ITEM_SET } from '../mk8/content/items/id';
import { registerTestRamp } from '../mk8/content/courses/test-ramp/register';
import { registerMk8Content } from '../mk8/register';
import { meshAutopilotInput } from '../sim/ai/meshDriver';
import type { MeshTrackDef } from '../sim/meshTrack';
import { createRace, type CreateRaceOptions, type RacerSlot } from '../sim/race/createRace';
import { step } from '../sim/step';
import type { InputFrame, Loadout, SimEvent, SimState } from '../sim/types';
import { raceFromSetup } from './client';
import { raceSetupOf } from './host';
import {
  applySnapshot,
  decodeMessage,
  encodeEvents,
  encodeSnapshot,
  encodeStart,
  MSG,
  PROTOCOL_VERSION,
  type NetMessage,
} from './protocol';
import { onlineRacers } from './testRace';

/** v6 (MK-132): MK8 Mode's races online — loadouts, item set and the MK8 kart state. */

const TRACK = 'mk8-test-ramp';
const LOADOUTS: readonly Loadout[] = [
  { racer: 'mk8-bowser', body: 'b-dasher', tires: 'slick-tires', glider: 'paper-glider' },
  { racer: 'mk8-toad', body: 'pipe-frame', tires: 'slim-tires', glider: 'cloud-glider' },
];
/** Unit vectors come back within this (octahedral, 2 × int16). */
const UNIT_ERROR = 1e-4;

function mk8Options(engineClass: CreateRaceOptions['engineClass'] = 200): CreateRaceOptions {
  const racers = Array.from({ length: 8 }, (_, i): RacerSlot => {
    const loadout = LOADOUTS[i % LOADOUTS.length]!;
    return {
      kartId: loadout.racer,
      controller: i === 0 ? 'local' : i < 4 ? 'remote' : 'ai',
      loadout,
      ...(i < 4 ? { name: `Player ${i + 1}` } : {}),
    };
  });
  return {
    trackId: TRACK,
    racers,
    engineClass,
    itemsOn: true,
    seed: 5,
    laps: 3,
    itemSet: MK8_ITEM_SET,
  };
}

function decodeAs<T extends NetMessage['type']>(packet: Uint8Array, type: T) {
  const msg = decodeMessage(packet);
  if (msg.type !== type) throw new Error(`Expected message ${type}, got ${msg.type}`);
  return msg as Extract<NetMessage, { type: T }>;
}

function track(): MeshTrackDef {
  const def = tracks.get(TRACK).def;
  if (def.kind !== 'mesh') throw new Error('not a mesh track');
  return def;
}

/** 20 s of the race with the humans on the route autopilot: spread out, some on anti-gravity. */
function midRace(): SimState {
  let state = createRace(mk8Options(150));
  const def = track();
  for (let tick = 0; tick < 20 * 60; tick += 1) {
    const inputs: InputFrame[] = state.karts
      .slice(0, 4)
      .map((kart) => meshAutopilotInput(kart, def, state.engineClass));
    state = step(state, inputs).state;
  }
  return state;
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('net protocol v6: MK8 Mode online (MK-132)', () => {
  beforeAll(() => {
    registerTestRamp();
    registerMk8Content();
  });

  it('round-trips Start with the item set, loadouts and 200cc, and rebuilds the same race', () => {
    const options = mk8Options();
    const host = createRace(options);
    const setup = raceSetupOf(options, host);
    expect(setup.itemSet).toBe(MK8_ITEM_SET);
    expect(setup.engineClass).toBe(200);
    expect(setup.racers.map((r) => r.loadout)).toEqual(options.racers.map((r) => r.loadout));
    const msg = decodeAs(encodeStart(1, setup), MSG.start);
    expect(msg).toEqual({ type: MSG.start, version: PROTOCOL_VERSION, kartId: 1, setup });

    const client = raceFromSetup(msg.setup, 1);
    expect(client.karts[1]!.controller).toBe('local');
    client.karts.forEach((kart, i) => (kart.controller = host.karts[i]!.controller));
    expect(client).toEqual(host);
  });

  it('leaves an original-game Start without an item set or loadouts', () => {
    const options = {
      trackId: 'sunny-circuit',
      racers: onlineRacers(2),
      engineClass: 100 as const,
      itemsOn: true,
      seed: 3,
    };
    const setup = raceSetupOf(options, createRace(options));
    const msg = decodeAs(encodeStart(1, setup), MSG.start);
    expect(msg.setup.itemSet).toBeUndefined();
    expect(msg.setup.racers.every((r) => r.loadout === undefined)).toBe(true);
  });

  it('round-trips the MK8 kart state within its quantization bounds', () => {
    const state = midRace();
    // Every MK8 field in use somewhere on the grid.
    const [a, b, c] = state.karts;
    a!.item.second = { held: a!.item.held ?? 'triple-banana', uses: 1, roulette: 0.4 };
    a!.glide = { time: 0.75, pitch: -0.4321, aim: { x: 12.5, y: 3.25, z: -40.125 } };
    a!.gravityDir = { x: 0.6, y: -0.8, z: 0 };
    b!.inWater = true;
    b!.spinBoostTimer = 0.5;
    b!.coins = 7;
    c!.glide = { time: 0.1, pitch: 0.9 };
    c!.antigrav = true;
    c!.up = { x: 0, y: -1, z: 0 };
    c!.forward = { x: 1, y: 0, z: 0 };
    c!.gravityDir = { x: 0, y: 1, z: 0 };
    const coins = state.coins!;
    expect(coins.length).toBeGreaterThan(8);
    coins[3]!.respawnTimer = 2.5;
    coins.push({
      id: 900,
      position: { x: 1, y: 2, z: 3 },
      respawnTimer: 0,
      life: 4.5,
      ownerId: 2,
      ownerImmune: 0.25,
    });
    const packet = encodeSnapshot(state, 10, []);
    const msg = decodeAs(packet, MSG.snapshot);
    const copy = applySnapshot(createRace(mk8Options(150)), msg.tick, msg.bytes);

    state.karts.forEach((kart, i) => {
      const got = copy.karts[i]!;
      expect(distance(got.position, kart.position)).toBeLessThan(0.01);
      expect(got.loadout).toEqual(kart.loadout);
      expect(got.antigrav).toBe(kart.antigrav);
      expect(got.coins).toBe(kart.coins);
      expect(got.inWater).toBe(kart.inWater);
      expect(got.item.second?.held).toBe(kart.item.second?.held);
      expect(got.item.second?.uses).toBe(kart.item.second?.uses);
      expect(got.item.second?.roulette ?? 0).toBeCloseTo(kart.item.second?.roulette ?? 0, 3);
      expect(got.spinBoostTimer ?? 0).toBeCloseTo(kart.spinBoostTimer ?? 0, 3);
      for (const key of ['up', 'forward', 'gravityDir'] as const) {
        const want = kart[key];
        if (!want) expect(got[key]).toBeUndefined();
        else expect(distance(got[key]!, want)).toBeLessThan(UNIT_ERROR);
      }
      if (got.up && got.forward) {
        const dot = got.up.x * got.forward.x + got.up.y * got.forward.y + got.up.z * got.forward.z;
        expect(Math.abs(dot)).toBeLessThan(1e-12);
      }
      expect(!!got.glide).toBe(!!kart.glide);
      if (kart.glide) {
        expect(got.glide!.time).toBeCloseTo(kart.glide.time, 3);
        expect(got.glide!.pitch).toBeCloseTo(kart.glide.pitch, 4);
        if (kart.glide.aim) expect(distance(got.glide!.aim!, kart.glide.aim)).toBeLessThan(0.01);
        else expect(got.glide!.aim).toBeUndefined();
      }
    });
    // Upside down on a ceiling: exactly, as the axes are.
    expect(copy.karts[2]!.up).toEqual({ x: 0, y: -1, z: 0 });
    expect(distance(copy.karts[2]!.gravityDir!, { x: 0, y: 1, z: 0 })).toBe(0);
    // Coins: line coins by id, taken ones with their timer, dropped ones in full.
    expect(copy.coins!.map((coin) => coin.id)).toEqual(coins.map((coin) => coin.id));
    expect(copy.coins![3]!.respawnTimer).toBeCloseTo(2.5, 3);
    expect(copy.coins![0]!.position).toEqual(coins[0]!.position);
    const dropped = copy.coins!.at(-1)!;
    expect(dropped).toMatchObject({
      id: 900,
      respawnTimer: 0,
      life: 4.5,
      ownerId: 2,
      ownerImmune: 0.25,
    });
    expect(distance(dropped.position, { x: 1, y: 2, z: 3 })).toBeLessThan(0.01);
  });

  it('round-trips a second-slot itemGranted event', () => {
    const events: SimEvent[] = [
      { type: 'itemGranted', kartId: 3, item: 'triple-banana', slot: 2 },
      { type: 'itemGranted', kartId: 4, item: 'triple-banana' },
      { type: 'kartHit', kartId: 1, by: -1, kind: 'squash' },
      { type: 'kartHit', kartId: 1, by: 2, kind: 'hazard' },
    ];
    const net = events.map((event, i) => ({ seq: i, tick: 100 + i, event }));
    const msg = decodeAs(encodeEvents(net), MSG.event);
    expect(msg.events).toEqual(net);
  });

  it('keeps 8 MK8 karts’ snapshot within 1.25× an original race’s (ticket AC)', () => {
    const mk8 = encodeSnapshot(midRace(), 0, []).length;
    const original = createRace({
      trackId: 'sunny-circuit',
      racers: onlineRacers(4),
      engineClass: 150,
      itemsOn: true,
      seed: 5,
    });
    let state = original;
    for (let tick = 0; tick < 20 * 60; tick += 1) state = step(state, []).state;
    const v2 = encodeSnapshot(state, 0, []).length;
    console.info(`Snapshot bytes, 8 karts 20 s in: MK8 test ramp ${mk8}, Sunny Circuit ${v2}`);
    expect(mk8).toBeLessThanOrEqual(v2 * 1.25);
  });
});
