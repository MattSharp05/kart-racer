// MK8 split-screen (MK-148): VS Races for 2–4 people on one screen, MK8 CPUs filling the grid,
// each player in their own view with MK8's HUD. On the synthetic test ramp (no pack: CI's e2e and
// perf), plus 4 players on Mario Kart Stadium (needs the pack), and the menus' Players screen and
// P2's character pick. P2–P4 are fake controllers driving themselves (MK-144) until a test sets
// their input (`__game.setSlotInput`), or a paired phone takes their kart over (MK-147).
import { DT } from '../../sim/tuning';
import type { MeshTrackDef } from '../../sim/meshTrack';
import type { SimState } from '../../sim/types';
import type { FakePlayer, Scenario, ScenarioSetup } from '../registry';
import { courseRace, onCourse } from './lib/courses';
import { openMk8 } from './lib/menus';
import { MK8_STADIUM_ID } from './stadium';
import { TEST_RAMP } from './testRamp';

/** P2–P4's racers (P1 drives Mario, as in every course scenario). */
const OTHER_RACERS = ['mk8-luigi', 'mk8-peach', 'mk8-yoshi'];
const STADIUM_PACK = 'mario-kart-stadium';

/** A VS Race from the countdown with `players` people on this screen (karts 0…, P1 first). */
function localRace(players: number) {
  return (track: MeshTrackDef, seed: number): SimState =>
    courseRace(track, seed, true, OTHER_RACERS.slice(0, players - 1));
}

/** P2… as fake controllers on the autopilot (P1 is this device's keyboard). */
function fakePlayers(players: number): FakePlayer[] {
  return Array.from({ length: players }, () => ({ autopilot: true }));
}

/** The race's winner time and each place's gap behind, s. */
const WINNER_TIME = 78.412;
const GAP = 0.9;
/** The finishing order (kart ids): P1 (kart 0) 2nd, P2 (kart 1) 5th. */
const FINISH_ORDER = [4, 0, 6, 2, 1, 3, 5, 7];

/** A finished 2-player race: everyone across the line in `FINISH_ORDER`. */
function finished2p(track: MeshTrackDef, seed: number): SimState {
  const state = localRace(2)(track, seed);
  state.phase = 'finished';
  state.race.goTick = -Math.round(WINNER_TIME / DT) - 600;
  FINISH_ORDER.forEach((kartId, place) => {
    const kart = state.karts[kartId];
    if (!kart) return;
    kart.race = {
      ...kart.race,
      lap: state.race.laps + 1,
      finishTick: state.race.goTick + Math.round((WINNER_TIME + place * GAP) / DT),
    };
  });
  state.tick = 1;
  state.positions = [...FINISH_ORDER];
  return state;
}

const playersOn = (players: number) => ({ players, fakePlayers: fakePlayers(players) });

/** `setup` with this many players, unless the course isn't there (then its own screen). */
function withPlayers(
  setup: (seed: number) => ScenarioSetup,
  players: number,
): (seed: number) => ScenarioSetup {
  return (seed) => {
    const made = setup(seed);
    return made.screen ? made : { ...made, ...playersOn(players) };
  };
}

const scenarios: Scenario[] = [
  ...[2, 3, 4].map((players): Scenario => ({
    name: `mk8-local-${players}p`,
    group: 'MK8 Mode',
    description: `MK8 VS Race for ${players} players on one screen (MK-148) on the synthetic test ramp (no pack): P2${players > 2 ? `–P${players}` : ''} fake controllers driving themselves, MK8 CPUs filling the grid, from the countdown. Each view has MK8's HUD and Lakitu.`,
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: withPlayers(onCourse(TEST_RAMP.id, localRace(players)), players),
  })),
  {
    name: 'mk8-local-2p-results',
    group: 'MK8 Mode',
    description:
      'A finished 2-player MK8 VS Race on the test ramp (MK-148): the results mark P1 (2nd) and P2 (5th).',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: withPlayers(onCourse(TEST_RAMP.id, finished2p), 2),
  },
  {
    name: 'mk8-stadium-4p',
    group: 'MK8 Mode',
    description:
      'Mario Kart Stadium with 4 players on one screen (MK-148: split-screen perf on a real course). Needs the MK8 pack (local `pnpm dev` or the site’s password).',
    defaultSeed: 1,
    mk8Course: STADIUM_PACK,
    setup: withPlayers(onCourse(MK8_STADIUM_ID, localRace(4)), 4),
  },
  {
    name: 'mk8-ui-players',
    group: 'MK8 Mode',
    description:
      'MK8 VS Race’s Players screen (MK-148): 1–4 people on this screen, 2 selected. OK: each player picks a racer and kart in turn.',
    defaultSeed: 1,
    setup: openMk8('players'),
  },
  {
    name: 'mk8-ui-char-p2',
    group: 'MK8 Mode',
    description:
      'MK8 character select for P2 in a 2-player VS Race (MK-148): P1 picked Mario; P2’s badge in blue. OK goes on to P2’s kart.',
    defaultSeed: 1,
    setup: openMk8('char-p2'),
  },
];
export default scenarios;
