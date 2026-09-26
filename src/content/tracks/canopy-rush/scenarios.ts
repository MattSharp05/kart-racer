import { KART_IDS } from '../../../sim/data/karts';
import { createRace, raceSetupRng, type RacerSlot } from '../../../sim/race/createRace';
import { rngInt, rngPick } from '../../../sim/rng';
import { tuning } from '../../../sim/tuning';
import type { Scenario } from '../../../scenarios/registry';
import { kartOnTrack } from '../../../scenarios/tracks';
import { canopyRush, CANOPY_RUSH } from './sim';

const TOP_SPEED = tuning.topSpeed[150];

/** A kart in the canopy at `t` in a 150cc session (the sway timing assumes 150cc speeds). */
function kartAt(seed: number, t: number, options: Parameters<typeof kartOnTrack>[3] = {}) {
  const state = kartOnTrack(seed, canopyRush.id, t, options);
  state.engineClass = 150;
  return state;
}

/** A full 150cc race from the countdown: you + 7 AI, the player starting 5th–8th (seeded). */
function race(seed: number) {
  const rng = raceSetupRng(seed);
  const playerSlot = rngInt(rng, 4, 7);
  const others = Array.from({ length: 8 }, (_, i) => i).filter((i) => i !== playerSlot);
  const racers = Array.from({ length: 8 }, (_, i): RacerSlot =>
    i === 0
      ? { kartId: 'maple', controller: 'local', gridSlot: playerSlot }
      : { kartId: rngPick(rng, KART_IDS), controller: 'ai', gridSlot: others[i - 1] ?? i },
  );
  return createRace({ trackId: canopyRush.id, racers, engineClass: 150, itemsOn: true, seed, rng });
}

/** The bridge scenario starts this far before bridge 1, at top speed… */
export const BRIDGE_LEAD_METRES = 25;
/**
 * …at this tick of the sway, so that holding W without steering, the deck's push carries you over
 * its right edge in the second half of the bridge (steering against it keeps you on).
 */
export const BRIDGE_START_TICK = 90;

/** The shortcut scenario starts on the tree platform this far before the drop, facing it. */
export const SHORTCUT_LEAD_METRES = 10;

/** Canopy Rush (MK-61): registered from this folder (`src/scenarios/index.ts` finds it). */
const scenarios: Scenario[] = [
  {
    name: 'track-canopy-rush',
    group: 'Canopy Rush',
    description:
      'Canopy Rush (MK-61): a full 150cc race in the jungle treetops, you + 7 AI, from the countdown. A waterfall jump, the climb to bridge 3, the spiral down the giant trunk, two more swaying rope bridges and a risky drop into the ruins below.',
    defaultSeed: 1,
    setup: (seed) => ({ state: race(seed) }),
  },
  {
    name: 'canopy-bridge',
    group: 'Canopy Rush',
    description:
      'At top speed, 25 m before rope bridge 1, as it starts to sway. Hold W without steering and the deck pushes you over its edge (you are put back at the bridge start); steer against the sway to stay on.',
    defaultSeed: 1,
    setup: (seed) => {
      const { from } = CANOPY_RUSH.bridges.b1;
      const t = CANOPY_RUSH.tAt(from.x, from.z) - BRIDGE_LEAD_METRES / CANOPY_RUSH.length;
      const state = kartAt(seed, t, { speed: TOP_SPEED });
      state.tick = BRIDGE_START_TICK;
      return { state };
    },
  },
  {
    name: 'canopy-shortcut',
    group: 'Canopy Rush',
    description:
      'On the tree platform after bridge 1, turned towards the gap in its right-hand edge. Hold W: you drop into the ruins below; follow the stone path and it brings you back onto the road on the jungle floor, well ahead.',
    defaultSeed: 1,
    setup: (seed) => {
      const [, entry] = CANOPY_RUSH.ruinsPath;
      const t =
        CANOPY_RUSH.tAt(entry?.x ?? 0, entry?.z ?? 0) - SHORTCUT_LEAD_METRES / CANOPY_RUSH.length;
      // Heading south, the gap is on the right (west): turned a little that way.
      return { state: kartAt(seed, t, { speed: TOP_SPEED * 0.8, headingOffset: -0.45 }) };
    },
  },
];

export default scenarios;
