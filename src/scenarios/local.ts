import { PREFS_KEY } from '../game/storage/prefs';
import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import type { KartId } from '../sim/data/karts';
import { trackGeometry } from '../sim/track';
import { DT } from '../sim/tuning';
import type { SimState } from '../sim/types';
import { sunnyLineup } from './menus';
import { racingSince, sunnyRace } from './race';
import type { FakePlayer, Scenario } from './registry';

/** P2–P4's racers in the local multiplayer scenarios (MK-144). */
const OTHER_PLAYERS: readonly KartId[] = ['boulder', 'coral', 'nova'];

/**
 * A local race in countdown, on Sunny Circuit unless `trackId` says: `players` people (P1 = kart 0)
 * and AI to 8 karts.
 */
export function localRace(seed: number, players: number, trackId?: string): SimState {
  return sunnyRace(seed, {
    karts: 8,
    ai: true,
    engineClass: 100,
    otherPlayers: OTHER_PLAYERS.slice(0, players - 1),
    ...(trackId !== undefined ? { trackId } : {}),
  });
}

/** The original game's tracks other than Sunny Circuit: 4-player split-screen on each (MK-145). */
const SPLIT_TRACKS = ['dune-canyon', 'frostpeak-pass', 'neon-harbour', 'canopy-rush', 'cog-works'];

/**
 * Fake players for P2…: their karts drive themselves on the autopilot until a test sets their
 * input (`__game.setSlotInput`). `pausedBy` presses that slot's pause button straight away.
 */
function fakePlayers(players: number, pausedBy?: number): FakePlayer[] {
  return Array.from({ length: players }, (_, slot) =>
    slot === pausedBy ? { autopilot: true, pause: true } : { autopilot: true },
  );
}

/** A finished local race (results showing): P1 2nd, P2 5th, the AI still finishing. */
function finishedLocalRace(seed: number): SimState {
  const state = racingSince(localRace(seed, 2), 160);
  state.phase = 'finished';
  const geometry = trackGeometry(sunnyCircuit);
  // Kart 0 is P1, kart 1 is P2; the rest are AI.
  const order = [4, 0, 6, 2, 1, 3, 5, 7];
  const finishTicks = new Map([
    [4, -Math.round(9 / DT)],
    [0, -Math.round(7 / DT)],
    [6, -Math.round(5 / DT)],
    [2, -Math.round(3 / DT)],
    [1, 0],
  ]);
  state.karts.forEach((kart, i) => {
    const t = 0.02 + i * 0.005;
    kart.position = geometry.pointAt(t, (i % 2 ? 1 : -1) * 3);
    kart.heading = geometry.headingAt(t);
    const finishTick = finishTicks.get(kart.id);
    kart.race = {
      ...kart.race,
      lap: finishTick !== undefined ? state.race.laps + 1 : state.race.laps,
      nextCheckpoint: 1,
      lastT: t,
      lapTimes: [53.1 - i * 0.2, 51.9 - i * 0.1, 50.7],
      ...(finishTick !== undefined ? { finishTick } : {}),
    };
  });
  state.positions = order;
  return state;
}

/** Local multiplayer (MK-144): several people on one screen, AI filling the grid. */
export const localScenarios: Scenario[] = [
  {
    name: 'local-2p',
    group: 'Local multiplayer',
    description:
      '2 players on one screen (P2 a fake controller driving itself) + 6 AI, in countdown: the screen split top and bottom.',
    defaultSeed: 1,
    setup: (seed) => ({ state: localRace(seed, 2), players: 2, fakePlayers: fakePlayers(2) }),
  },
  {
    name: 'local-4p',
    group: 'Local multiplayer',
    description: '4 players on one screen (P2–P4 fake controllers driving themselves) + 4 AI.',
    defaultSeed: 1,
    setup: (seed) => ({ state: localRace(seed, 4), players: 4, fakePlayers: fakePlayers(4) }),
  },
  {
    name: 'local-3p',
    group: 'Local multiplayer',
    description:
      '3 players on one screen (P2, P3 fake controllers driving themselves) + 5 AI: three views, the race overview in the fourth quadrant.',
    defaultSeed: 1,
    setup: (seed) => ({ state: localRace(seed, 3), players: 3, fakePlayers: fakePlayers(3) }),
  },
  {
    name: 'local-2p-side',
    group: 'Local multiplayer',
    description: "2 players with the screen split side by side (the race setup's Screen option).",
    defaultSeed: 1,
    setup: (seed) => ({
      state: localRace(seed, 2),
      players: 2,
      fakePlayers: fakePlayers(2),
      storage: { [PREFS_KEY]: JSON.stringify({ split: 'side' }) },
    }),
  },
  ...SPLIT_TRACKS.map((trackId): Scenario => ({
    name: `local-4p-${trackId}`,
    group: 'Local multiplayer',
    description: `4 players on one screen on ${trackId} (split-screen perf, MK-145).`,
    defaultSeed: 1,
    setup: (seed) => ({
      state: localRace(seed, 4, trackId),
      players: 4,
      fakePlayers: fakePlayers(4),
    }),
  })),
  {
    name: 'local-2p-paused',
    group: 'Local multiplayer',
    description: "A 2-player race paused from P2's controller: the pause menu says who paused.",
    defaultSeed: 1,
    setup: (seed) => ({
      state: racingSince(localRace(seed, 2), 5),
      players: 2,
      fakePlayers: fakePlayers(2, 1),
    }),
  },
  {
    name: 'local-2p-results',
    group: 'Local multiplayer',
    description: 'A finished 2-player race: P1 2nd and P2 5th, both marked on the results.',
    defaultSeed: 1,
    setup: (seed) => ({
      state: finishedLocalRace(seed),
      players: 2,
      fakePlayers: fakePlayers(2),
    }),
  },
  {
    name: 'local-setup',
    group: 'Local multiplayer',
    description: 'Racer select with the Players option set to 2 (P1 picks, then P2).',
    defaultSeed: 1,
    setup: (seed) => ({
      state: sunnyLineup(seed),
      view: 'lineup',
      screen: 'racerSelect',
      storage: { [PREFS_KEY]: JSON.stringify({ players: 2 }) },
    }),
  },
];
