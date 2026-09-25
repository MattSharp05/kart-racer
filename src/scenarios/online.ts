import { oneWayOf, type NetConditions } from '../net/netsim';
import { KART_IDS } from '../sim/data/karts';
import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { createRace, type CreateRaceOptions, type RacerSlot } from '../sim/race/createRace';
import { attractMode } from './menus';
import type { Scenario, ScenarioSetup } from './registry';

/**
 * Online races without a server (MK-46, docs/TDD.md → v2 testing): open the host link, then the
 * client link in more windows of the same browser. They find each other over BroadcastChannel
 * (`net/localRoom.ts`); the host waits for every player before the countdown runs. Use windows side
 * by side, not tabs: a background tab stops its game loop, and a stopped host stops the race.
 */
export const ONLINE_GROUP = 'Online';

/** The /dev links' room for scenario `name` (one per scenario, so different races never mix). */
export function devRoom(name: string): string {
  return `dev-${name}`;
}

const KARTS_PER_RACE = 8;

/** Simulated networks for QA, per direction (round trip as in `&netsim=<rtt>,<jitter>,<loss%>`). */
export const NETSIM_PRESETS = {
  /** 80 ms RTT, 10 ms jitter, 1 % loss: a decent home connection. */
  good: oneWayOf({ lagMs: 80, jitterMs: 10, loss: 0.01 }),
  /** 200 ms RTT, 50 ms jitter, 8 % loss: a bad mobile connection. */
  bad: oneWayOf({ lagMs: 200, jitterMs: 50, loss: 0.08 }),
} satisfies Record<string, NetConditions>;

/** The host's race: kart 0 is the host, karts 1..players-1 the clients, the rest AI. */
function onlineRaceOptions(seed: number, players: number): CreateRaceOptions {
  const racers = Array.from({ length: KARTS_PER_RACE }, (_, i): RacerSlot => ({
    kartId: KART_IDS[i % KART_IDS.length] ?? 'maple',
    controller: i === 0 ? 'local' : i < players ? 'remote' : 'ai',
  }));
  return { trackId: sunnyCircuit.id, racers, engineClass: 100, itemsOn: true, seed };
}

function onlineRace(seed: number, players: number, netsim?: NetConditions): ScenarioSetup {
  const race = onlineRaceOptions(seed, players);
  return {
    state: createRace(race),
    view: 'chase',
    online: { race, ...(netsim ? { netsim } : {}) },
  };
}

/** Whether `scenario` is an online race (listed with host and client links). */
export function isOnlineScenario(scenario: Scenario): boolean {
  return scenario.group === ONLINE_GROUP;
}

/** The query string of an online scenario's host or client link. */
export function onlineQuery(name: string, role: 'host' | 'client', room = devRoom(name)): string {
  return `?scenario=${encodeURIComponent(name)}&net=local&role=${role}&room=${encodeURIComponent(room)}`;
}

export const onlineScenarios: Scenario[] = [
  {
    name: 'online-lobby',
    group: ONLINE_GROUP,
    description:
      'Room lobby over BroadcastChannel (MK-40): the host link creates a room, the client link joins it in another window; the lists update as players come and go.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), view: 'chase', screen: 'title', lobby: true }),
  },
  {
    name: 'online-race-2p',
    group: ONLINE_GROUP,
    description:
      'Online race over BroadcastChannel: open the host link, then the client link in a second window (not a tab: background tabs pause). Host + 1 client + 6 AI.',
    defaultSeed: 1,
    setup: (seed) => onlineRace(seed, 2),
  },
  {
    name: 'online-race-4p',
    group: ONLINE_GROUP,
    description:
      'Host + 3 clients + 4 AI: open the host link, then the client link in 3 more windows side by side.',
    defaultSeed: 1,
    setup: (seed) => onlineRace(seed, 4),
  },
  {
    name: 'net-good',
    group: ONLINE_GROUP,
    description:
      '2-player online race on a good simulated network: 80 ms RTT, 10 ms jitter, 1 % loss.',
    defaultSeed: 1,
    setup: (seed) => onlineRace(seed, 2, NETSIM_PRESETS.good),
  },
  {
    name: 'net-bad',
    group: ONLINE_GROUP,
    description:
      '2-player online race on a bad simulated network: 200 ms RTT, 50 ms jitter, 8 % loss.',
    defaultSeed: 1,
    setup: (seed) => onlineRace(seed, 2, NETSIM_PRESETS.bad),
  },
];
