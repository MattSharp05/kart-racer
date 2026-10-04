import { beforeAll, describe, expect, it } from 'vitest';
import { MK8_ITEM_SET } from '../mk8/content/items/id';
import { registerTestRamp } from '../mk8/content/courses/test-ramp/register';
import { registerMk8Content } from '../mk8/register';
import type { RacerSlot } from '../sim/race/createRace';
import { forwardFromHeading } from '../sim/math';
import { NEUTRAL_INPUT, type Loadout, type SimState } from '../sim/types';
import { runLab } from './netLab';
import { oneWayOf } from './netsim';
import { meshScriptedInput } from './testRace';

/**
 * MK8 Mode online (MK-132): a full room (host + 3 clients + 4 AI) races the synthetic MK8 test ramp
 * (mesh track: anti-gravity tunnel, glide ramp, water, coins; no pack needed) at `net-bad`, every
 * kart on an MK8 loadout with MK8's items. Mario Kart Stadium needs the pack, which CI never has:
 * the test ramp has the same physics paths (ADR 0011).
 */

/** `net-bad`, one way (as `soak.ts`). */
const NET_BAD = oneWayOf({ lagMs: 200, jitterMs: 50, loss: 0.08 });
const LOADOUTS: readonly Loadout[] = [
  { racer: 'mk8-mario', body: 'standard-kart', tires: 'standard-tires', glider: 'peach-parasol' },
  { racer: 'mk8-bowser', body: 'b-dasher', tires: 'slick-tires', glider: 'paper-glider' },
  { racer: 'mk8-toad', body: 'pipe-frame', tires: 'slim-tires', glider: 'cloud-glider' },
  { racer: 'mk8-peach', body: 'pipe-frame', tires: 'standard-tires', glider: 'peach-parasol' },
];
/** The test ramp's tunnel (`test-ramp/layout.ts`): its right wall (+Z) is anti-gravity. */
const TUNNEL_FROM = 30;
const WALL_Z = 7;
/** Each human starts this far from the wall, angled at it (as `mk8-test-antigrav`), m apart. */
const FROM_WALL = 4;
const SPACING = 6;
const AT_WALL = (-3 * Math.PI) / 4;
/** Racing time in the anti-gravity run: up the wall, over the ceiling and down, ticks. */
const ANTIGRAV_TICKS = 150;

/** A 60 fps frame at top speed moves a kart ~0.5 m by itself; a jump this big on top is a teleport. */
const TELEPORT_M = 1;

function racers(): RacerSlot[] {
  return Array.from({ length: 8 }, (_, i) => {
    const loadout = LOADOUTS[i % LOADOUTS.length]!;
    return {
      kartId: loadout.racer,
      controller: i === 0 ? 'local' : i < 4 ? 'remote' : 'ai',
      loadout,
    };
  });
}

describe('MK8 race online over loopback at net-bad (MK-132)', () => {
  beforeAll(() => {
    registerTestRamp();
    registerMk8Content();
  });

  it('races a lap of the test ramp with every client ending on the host’s results', () => {
    const report = runLab({
      clients: 3,
      conditions: NET_BAD,
      seed: 3,
      laps: 1,
      race: { trackId: 'mk8-test-ramp', racers: racers(), engineClass: 150, itemSet: MK8_ITEM_SET },
      input: meshScriptedInput,
    });
    expect(report.results, 'the race ended with results').not.toBeNull();
    const finished = (report.results ?? []).filter((s) => s.finishTick !== undefined);
    expect(finished.map((s) => s.kartId)).toEqual(expect.arrayContaining([0, 1, 2, 3]));
    for (const client of report.clients) {
      const who = `client ${client.kartId}`;
      expect(client.ended, `${who} still in the race`).toBeNull();
      expect(client.results, `${who}'s results`).toEqual(report.results);
      expect(client.mismatchedFinishes, `${who}'s finishes`).toEqual([]);
      expect(client.ownJump.max, `${who}'s own kart`).toBeLessThan(TELEPORT_M);
      expect(client.remoteJump.max, `${who}'s view of others`).toBeLessThan(TELEPORT_M);
      // Drawn where the host had it (the route itself stays off the anti-gravity wall: see below).
      expect(client.ownTruthError.p99, `${who}'s own kart vs the host`).toBeLessThan(0.5);
    }
  }, 180_000);

  it('keeps 3 clients converged to the host driving up the anti-gravity wall and over the ceiling', () => {
    const report = runLab({
      clients: 3,
      conditions: NET_BAD,
      seed: 4,
      racingTicks: ANTIGRAV_TICKS,
      race: { trackId: 'mk8-test-ramp', racers: racers(), engineClass: 150, itemSet: MK8_ITEM_SET },
      // Full throttle, straight on: the wall turns the karts up it and onto the ceiling.
      input: () => ({ ...NEUTRAL_INPUT, throttle: 1 }),
      prepare: atTheWall,
    });
    for (const client of report.clients) {
      const who = `client ${client.kartId}`;
      expect(client.ended, `${who} still in the race`).toBeNull();
      expect(client.ownJump.max, `${who}'s own kart`).toBeLessThan(TELEPORT_M);
      expect(client.remoteJump.max, `${who}'s view of others`).toBeLessThan(TELEPORT_M);
      expect(client.ownTruthErrorAntigrav.max, `${who} drove in anti-gravity`).toBeGreaterThan(0);
      expect(client.ownTruthErrorAntigrav.p99, `${who} in anti-gravity`).toBeLessThan(0.5);
    }
  }, 120_000);
});

/** The 4 humans on the tunnel floor, angled at its anti-gravity wall, one behind the other. */
function atTheWall(state: SimState): void {
  for (const kart of state.karts.slice(0, 4)) {
    kart.position = { x: TUNNEL_FROM + FROM_WALL + kart.id * SPACING, y: 0, z: WALL_Z - FROM_WALL };
    kart.heading = AT_WALL;
    kart.up = { x: 0, y: 1, z: 0 };
    kart.forward = forwardFromHeading(AT_WALL);
    kart.velocity = { x: 0, y: 0, z: 0 };
    kart.speed = 0;
  }
}
