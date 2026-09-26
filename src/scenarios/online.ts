import { oneWayOf, type NetConditions } from '../net/netsim';
import { KART_IDS } from '../sim/data/karts';
import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { createRace, type CreateRaceOptions, type RacerSlot } from '../sim/race/createRace';
import { DT } from '../sim/tuning';
import type { SimState } from '../sim/types';
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

/**
 * The host's race: kart 0 is the host, karts 1..players-1 the clients, the rest AI. The players are
 * "Player 1…n" (the lobby gives them their nicknames; name tags show them, MK-55).
 */
function onlineRaceOptions(seed: number, players: number): CreateRaceOptions {
  const racers = Array.from({ length: KARTS_PER_RACE }, (_, i): RacerSlot => ({
    kartId: KART_IDS[i % KART_IDS.length] ?? 'maple',
    controller: i === 0 ? 'local' : i < players ? 'remote' : 'ai',
    ...(i < players ? { name: `Player ${i + 1}` } : {}),
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

/** Nicknames of the people in the offline online-look scenarios (MK-55): you, then 3 friends. */
const PEOPLE = ['Maya', 'Ann', 'Bob', 'Cleo'] as const;

/**
 * A 4-person online race as a still state, no network (MK-55): you (`local`, kart 0) on grid slot
 * `ownSlot`, the 3 friends (`remote`, named) on the slots before it, AI in the rest.
 */
function peopleRace(seed: number, ownSlot: number): SimState {
  const others = Array.from({ length: KARTS_PER_RACE }, (_, slot) => slot).filter(
    (slot) => slot !== ownSlot,
  );
  const racers = Array.from({ length: KARTS_PER_RACE }, (_, i): RacerSlot => {
    const name = PEOPLE[i];
    return {
      kartId: KART_IDS[i % KART_IDS.length] ?? 'maple',
      controller: i === 0 ? 'local' : name ? 'remote' : 'ai',
      gridSlot: i === 0 ? ownSlot : (others[i - 1] ?? i),
      ...(name ? { name } : {}),
    };
  });
  return createRace({ trackId: sunnyCircuit.id, racers, engineClass: 100, itemsOn: true, seed });
}

/** Racing since a moment ago, still on the grid (no countdown banner coming and going). */
function justStarted(state: SimState): SimState {
  state.phase = 'racing';
  state.race.countdownStartTick -= state.race.goTick;
  state.race.goTick = 0;
  return state;
}

/** Finish order of the `online-results` race (kart ids) and each finisher's race time, s. */
const RESULTS_ORDER = [2, 0, 5, 1, 3, 4, 6, 7] as const;
const RESULTS_TIMES = [61.42, 62.08, 62.95, 63.3, 64.71, 65.2] as const;

/** Everyone but the last 2 AI over the line, you 2nd: the room's results (MK-55). */
function finishedPeopleRace(seed: number): SimState {
  const state = peopleRace(seed, 4);
  state.phase = 'finished';
  state.race.goTick = 0;
  RESULTS_ORDER.forEach((kartId, place) => {
    const kart = state.karts[kartId];
    const time = RESULTS_TIMES[place];
    if (!kart || time === undefined) return;
    kart.race = { ...kart.race, lap: state.race.laps + 1, finishTick: Math.round(time / DT) };
  });
  state.tick = Math.round((RESULTS_TIMES.at(-1) ?? 0) / DT);
  state.positions = [...RESULTS_ORDER];
  return state;
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
    name: 'online-name-tags',
    group: ONLINE_GROUP,
    description:
      'Name tags (MK-55): 3 friends on the grid ahead of you, each nickname in their colour over their kart (the AI get none). A still state: no network, both links show the same.',
    defaultSeed: 1,
    setup: (seed) => ({ state: justStarted(peopleRace(seed, 5)), view: 'chase' }),
  },
  {
    name: 'online-results',
    group: ONLINE_GROUP,
    description:
      'The room\'s results (MK-55): all 8 karts, the 4 people highlighted in their colours. The host link has Race again / Next track; the client link shows "Waiting for host…". (No room here: the buttons go back to the title.)',
    defaultSeed: 1,
    setup: (seed) => ({ state: finishedPeopleRace(seed), view: 'chase', screen: 'onlineResults' }),
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
