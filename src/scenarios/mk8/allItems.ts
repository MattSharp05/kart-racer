// MK8 item use (MK-129): 8 AI on the synthetic test ramp (no pack needed), every MK8 item handed
// out in rotation at the start, to watch the AI use them and hear their sounds.
import { items } from '../../content/items';
import { MK8_ITEM_SET } from '../../mk8/content/items/id';
import { giveItem, availableItems } from '../../sim/items';
import { driveByAi } from '../../sim/race/takeover';
import { step } from '../../sim/step';
import type { MeshTrackDef } from '../../sim/meshTrack';
import { NEUTRAL_INPUT, type KartState, type SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { courseRace, onCourse } from './lib/courses';
import { TEST_RAMP } from './testRamp';

/**
 * MK8 races' items (MK8's and our five) in roulette order: the rotation. Lightning comes last: it
 * takes everyone else's items, so handed out early it would empty the other slots before they're
 * used.
 */
export function mk8ItemRotation(): string[] {
  const last = (id: string) => (id === 'lightning' ? 1 : 0);
  return [...availableItems(MK8_ITEM_SET)].sort(
    (a, b) => last(a) - last(b) || items.get(a).order - items.get(b).order || a.localeCompare(b),
  );
}

/** Gives `kart` rotation item `n` (wrapping round) in slot 1, and the next in slot 2. */
export function giveRotation(kart: KartState, rotation: readonly string[], n: number): void {
  const at = (i: number) => rotation[((i % rotation.length) + rotation.length) % rotation.length];
  const first = at(n);
  const second = at(n + 1);
  if (first) giveItem(kart, first);
  if (second && kart.item.second) giveItem(kart.item.second, second);
}

/** Items each seed hands out: two per kart. */
const ROTATION_PER_SEED = 16;
/** The camera follows this kart (mid-field on the grid). */
const FOLLOW = 4;

/**
 * The all-items race: `courseRace` on the test ramp with every kart driven by the AI, each holding
 * two items of the rotation (seed 1 hands out the first 16, seed 2 the next 16 and so on), from GO.
 */
export function mk8AllItemsRace(track: MeshTrackDef, seed: number): SimState {
  let state = courseRace(track, seed);
  for (const kart of state.karts) driveByAi(kart);
  // To GO: items are only used once the race is on.
  while (state.phase !== 'racing') state = step(state, [NEUTRAL_INPUT]).state;
  const rotation = mk8ItemRotation();
  state.karts.forEach((kart, i) =>
    giveRotation(kart, rotation, (seed - 1) * ROTATION_PER_SEED + i * 2),
  );
  return state;
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-race-all-items',
    group: 'MK8 Mode',
    description:
      'Watch 8 AI race on the MK8 test ramp (MK-129, no pack needed), each starting with two MK8 items handed out in rotation (seed 1: the first 16 in roulette order, seed 2: the next 16, round and round). The camera follows the 5th kart. Listen for each item’s MK8 sound (the pack’s with one, our synth without).',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: (seed) => {
      const setup = onCourse(TEST_RAMP.id, mk8AllItemsRace)(seed);
      return setup.screen ? setup : { ...setup, follow: FOLLOW };
    },
  },
];
export default scenarios;
