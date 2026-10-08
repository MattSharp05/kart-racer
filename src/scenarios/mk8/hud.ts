// MK8 Mode's race HUD (MK-127) on the synthetic MK8 test ramp: no pack needed (with one, the HUD
// draws the pack's item, coin and racer sprites). All racing, 3 laps at 150cc, MK8's items; the
// field are MK8 racers so the minimap shows their heads.
import { defaultLoadout } from '../../mk8/content/parts';
import { DT } from '../../sim/tuning';
import { giveItem } from '../../sim/items';
import type { MeshTrackDef } from '../../sim/meshTrack';
import type { KartState, SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { courseFinalLap, courseRace, onCourse } from './lib/courses';
import { TEST_RAMP } from './testRamp';

/** The field, you first (MK8 racer ids: registered before setup, like the course). */
export const HUD_RACERS = [
  'mk8-mario',
  'mk8-luigi',
  'mk8-peach',
  'mk8-yoshi',
  'mk8-bowser',
  'mk8-toad',
  'mk8-daisy',
  'mk8-koopa-troopa',
] as const;

/** `mk8-hud-roulette` starts this far into the 1.5 s spin, s left. */
export const ROULETTE_LEFT = 0.7;
/** Lap 2 began this long ago in the mid-race scenarios (Lakitu's sign is long gone), s. */
const LAP_2_SINCE = 10;

function mk8Field(state: SimState): SimState {
  state.karts.forEach((kart, i) => {
    kart.kartType = HUD_RACERS[i % HUD_RACERS.length] ?? kart.kartType;
    // Its kart too (MK-136: the course races give every kart a loadout of its racer's).
    if (kart.loadout) kart.loadout = defaultLoadout(kart.kartType);
  });
  return state;
}

/** The field on lap 2 of 3, you 4th: `courseFinalLap` a lap earlier. */
function midRace(track: MeshTrackDef, seed: number): SimState {
  const state = mk8Field(courseFinalLap(track, seed));
  for (const kart of state.karts) {
    kart.race = {
      ...kart.race,
      lap: 2,
      lapStartTick: -Math.round(LAP_2_SINCE / DT),
      lapTimes: kart.race.lapTimes.slice(0, 1),
    };
  }
  return state;
}

/** Puts kart `id` where the leader is (and the leader where it was): you lead. */
function lead(state: SimState, id: number): void {
  const leaderId = state.positions[0];
  const you = state.karts[id];
  const leader = leaderId === undefined ? undefined : state.karts[leaderId];
  if (!you || !leader || leader === you) return;
  const keys = [
    'position',
    'velocity',
    'heading',
    'speed',
    'up',
    'forward',
    'gravityDir',
    'race',
  ] as const satisfies readonly (keyof KartState)[];
  for (const key of keys) {
    const mine = you[key];
    Object.assign(you, { [key]: leader[key] });
    Object.assign(leader, { [key]: mine });
  }
  state.positions = state.positions.map((k) => (k === id ? leader.id : k === leader.id ? id : k));
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-hud-roulette',
    group: 'MK8 Mode',
    description:
      'MK8 race HUD (MK-127): lap 2, the item roulette mid-spin in the round item box top-left. It flicks through MK8’s items, slows down and lands with a bounce on the item the race gave you (roulette and decide sounds). Minimap top-right with every racer’s head, coins and lap bottom-left, position bottom-right.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onCourse(TEST_RAMP.id, (track, seed) => {
      const state = midRace(track, seed);
      const [you] = state.karts;
      if (you) you.item.roulette = ROULETTE_LEFT;
      return state;
    }),
  },
  {
    name: 'mk8-hud-two-slots',
    group: 'MK8 Mode',
    description:
      'MK8 race HUD (MK-127): both item slots full: triple green shells with 2 left (×2) in the big box, a banana in the small second slot beside it. Use the item twice: the second slot’s banana moves up.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onCourse(TEST_RAMP.id, (track, seed) => {
      const state = midRace(track, seed);
      const [you] = state.karts;
      if (you) {
        giveItem(you, 'triple-green');
        you.item.uses = 2;
        if (you.item.second) giveItem(you.item.second, 'banana');
      }
      return state;
    }),
  },
  {
    name: 'mk8-hud-final-lap',
    group: 'MK8 Mode',
    description:
      'MK8 race HUD (MK-127): you just crossed into the final lap in 1st with 10 coins. Lakitu holds up the FINAL LAP sign for a moment, the lap reads 3/3 and the big gold “1st” sits bottom-right.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onCourse(TEST_RAMP.id, (track, seed) => {
      const state = mk8Field(courseFinalLap(track, seed));
      lead(state, 0);
      const [you] = state.karts;
      if (you) you.coins = 10;
      return state;
    }),
  },
  {
    name: 'mk8-hud-countdown',
    group: 'MK8 Mode',
    description:
      'MK8 race HUD (MK-127): the start. Lakitu drops in with his start light (a red lamp a second, then green) over big 3, 2, 1, GO! numbers, with MK8’s countdown sounds.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onCourse(TEST_RAMP.id, (track, seed) => mk8Field(courseRace(track, seed))),
  },
];
export default scenarios;
