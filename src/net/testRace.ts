import { items, registerItem, unregisterItem, type ItemContent } from '../content/items';
import type { KartId } from '../sim/data/karts';
import { autopilotInput } from '../sim/autopilot';
import { meshAutopilotInput, type StuckState } from '../sim/ai/meshDriver';
import type { CreateRaceOptions, RacerSlot } from '../sim/race/createRace';
import { rngFloat, seedRng } from '../sim/rng';
import { getTrack, trackGeometry } from '../sim/track';
import { DT } from '../sim/tuning';
import type { InputFrame, KartState, SimState } from '../sim/types';
import { OnlineClient } from './client';
import { OnlineHost } from './host';
import { createLoopbackPair, type NetConditions } from './netsim';

/**
 * Test harness for the net core (unit and perf tests, not shipped): a host and N clients on
 * loopback links under simulated lag, with a hand-cranked clock so every run is deterministic.
 */

export const TICK_MS = DT * 1000;
const KARTS: readonly KartId[] = ['maple', 'pixie', 'boulder', 'swoop'];

/** A deterministic clock and timer queue that loopback links schedule deliveries on. */
export function virtualClock() {
  let time = 0;
  let order = 0;
  const queue: { at: number; order: number; fn: () => void }[] = [];
  return {
    now: () => time,
    schedule: (fn: () => void, ms: number) => queue.push({ at: time + ms, order: order++, fn }),
    advance(ms: number) {
      time += ms;
      queue.sort((a, b) => a.at - b.at || a.order - b.order);
      while (queue[0] && queue[0].at <= time) queue.shift()?.fn();
    },
  };
}

/** The racers of an online test race: the host's kart 0, clients 1..humans-1, the rest AI. */
export function onlineRacers(humans: number, karts = 8): RacerSlot[] {
  return Array.from({ length: karts }, (_, i) => ({
    kartId: KARTS[i % KARTS.length] ?? 'maple',
    controller: i === 0 ? 'local' : i < humans ? 'remote' : 'ai',
  }));
}

/** What a test race may change from the default (Sunny Circuit, 100cc, the four original karts). */
export type TestRaceOverrides = Partial<
  Pick<CreateRaceOptions, 'trackId' | 'racers' | 'engineClass' | 'itemSet'>
>;

/** Host + clients on loopback links with `conditions` both ways (link i seeded with seed + i). */
export function onlineRace({
  clients,
  conditions,
  seed = 7,
  laps = 1,
  itemsOn = true,
  race = {},
}: {
  clients: number;
  conditions: NetConditions;
  seed?: number;
  laps?: number;
  itemsOn?: boolean;
  /** Another track, racers, engine class or item set (MK-132: an MK8 race on a mesh track). */
  race?: TestRaceOverrides;
}) {
  const clock = virtualClock();
  const host = new OnlineHost(
    {
      trackId: 'sunny-circuit',
      racers: onlineRacers(clients + 1),
      engineClass: 100,
      itemsOn,
      seed,
      laps,
      ...race,
    },
    0,
  );
  const clientList = Array.from({ length: clients }, (_, i) => {
    const rng = { rngState: seedRng(seed * 31 + i) };
    const [hostEnd, clientEnd] = createLoopbackPair({
      conditions,
      random: () => rngFloat(rng),
      schedule: clock.schedule,
    });
    const client = new OnlineClient(clientEnd, clock.now);
    host.addClient(hostEnd, i + 1);
    return client;
  });
  return { host, clients: clientList, clock };
}

const track = getTrack('sunny-circuit');
if (track.kind !== 'spline') throw new Error('sunny-circuit must be a spline track');
const geometry = trackGeometry(track);

/**
 * Scripted driving for player `player` at `tick`: follows the track with a weaving line, drifts
 * now and then and fires its items, so prediction and the host's events both get exercised.
 */
export function scriptedInput(
  kart: KartState | undefined,
  tick: number,
  player: number,
): InputFrame {
  if (!kart) return { throttle: 0, brake: 0, steer: 0, drift: false, item: false };
  const lateral = Math.sin(tick / 70 + player * 1.7) * 3;
  const input = autopilotInput(kart, geometry, 1, lateral);
  const phase = (tick + player * 40) % 240;
  // Pinned against a wall (a head-on hit can leave the autopilot pushing into it for good): ask
  // for the pickup drone, as a player would.
  const stuck =
    kart.race.lap >= 1 &&
    kart.race.finishTick === undefined &&
    tick - kart.race.lapStartTick > STUCK_AFTER_TICKS &&
    Math.abs(kart.speed) < STUCK_SPEED &&
    kart.spinTimer === 0 &&
    kart.respawnTimer === 0;
  return {
    ...input,
    drift: phase > 150 && phase < 200,
    item: phase === 100,
    ...(stuck ? { respawn: true } : {}),
  };
}

/** Each scripted mesh-track driver's backing-out memory (per player: host and clients apart). */
const meshStuck = new Map<string, StuckState>();

/**
 * `scriptedInput` on a mesh track (MK-132): the route autopilot, backing out when wedged, with
 * drifts and item presses on the same rhythm. `who` keeps each driver's memory apart.
 */
export function meshScriptedInput(state: SimState | null, kartId: number, who: string): InputFrame {
  const kart = state?.karts[kartId];
  if (!state || !kart) return { throttle: 0, brake: 0, steer: 0, drift: false, item: false };
  const track = getTrack(state.trackId);
  if (track.kind !== 'mesh') throw new Error(`${state.trackId} isn't a mesh track`);
  let stuck = meshStuck.get(who);
  if (!stuck) meshStuck.set(who, (stuck = { stuckTime: 0, recoverTime: 0 }));
  const input = meshAutopilotInput(kart, track, state.engineClass, 1, stuck);
  const phase = (state.tick + kartId * 40) % 240;
  return { ...input, drift: input.drift || (phase > 150 && phase < 180), item: phase === 100 };
}

/** A scripted kart slower than this (m/s) this long into its lap (ticks) is stuck. */
const STUCK_SPEED = 0.5;
const STUCK_AFTER_TICKS = 180;

/**
 * The item table seeded test races run with (MK-86): the MVP six, with their odds frozen here. A
 * seeded race depends on every roulette draw, so adding an item to the game or rebalancing the
 * odds would send it a different way; with this table only changes to these items' behaviour do.
 * Odds rows as in `ItemContent.odds` (1st place first), as tuned when MK-86 froze them.
 */
export const TEST_RACE_ODDS: Readonly<Record<string, readonly number[]>> = {
  mushroom: [0.14, 0.2, 0.19, 0.18, 0.15, 0.15, 0.13, 0.1],
  banana: [0.28, 0.16, 0.1, 0.06, 0, 0, 0, 0],
  green: [0.24, 0.18, 0.13, 0.1, 0.06, 0, 0, 0],
  red: [0, 0.1, 0.17, 0.2, 0.17, 0.15, 0.13, 0.11],
  star: [0, 0, 0, 0, 0.07, 0.11, 0.15, 0.18],
  lightning: [0, 0, 0, 0, 0.03, 0.05, 0.07, 0.09],
};

/**
 * Swaps the registered items for `TEST_RACE_ODDS`'s (in that order, with those odds) until the
 * returned function puts the game's own back, in their order. For a test's `beforeAll`/`afterAll`;
 * `withTestRaceItems` for code that runs at once.
 */
export function useTestRaceItems(): () => void {
  const own: ItemContent[] = [...items.list()];
  // Every test item is checked before anything is unregistered, so a throw leaves the game's own.
  const fixed = Object.entries(TEST_RACE_ODDS).map(([id, odds]) => {
    const item = own.find((i) => i.id === id);
    if (!item) throw new Error(`Test race item ${id} isn't registered`);
    return { ...item, odds };
  });
  for (const item of own) unregisterItem(item.id);
  for (const item of fixed) registerItem(item);
  return () => {
    for (const id of Object.keys(TEST_RACE_ODDS)) unregisterItem(id);
    for (const item of own) registerItem(item);
  };
}

/** Runs `run` with the test race items (`useTestRaceItems`), then puts the game's own back. */
export function withTestRaceItems<T>(run: () => T): T {
  const restore = useTestRaceItems();
  try {
    return run();
  } finally {
    restore();
  }
}
