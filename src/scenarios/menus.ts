import { KART_IDS } from '../sim/data/karts';
import { sunnyCircuit } from '../sim/data/tracks/sunnyCircuit';
import { createSimState } from '../sim/state';
import { trackGeometry } from '../sim/track';
import { DT } from '../sim/tuning';
import type { SimState } from '../sim/types';
import { sunnyRace } from './race';
import type { Scenario } from './registry';

const sunny = trackGeometry(sunnyCircuit);
/** Where the kart-select lineup is parked: on the main straight, just past the line. */
const LINEUP_T = 0.03;
const LINEUP_SPACING = 3.2;

/** The four karts side by side on Sunny's main straight (kart select background). */
export function sunnyLineup(seed: number): SimState {
  return createSimState({
    seed,
    trackId: 'sunny-circuit',
    karts: KART_IDS.map((kartType, i) => ({
      kartType,
      position: sunny.pointAt(LINEUP_T, (i - (KART_IDS.length - 1) / 2) * LINEUP_SPACING),
      heading: sunny.headingAt(LINEUP_T),
    })),
  });
}

/** Title-screen background: an AI race already under way (the "player" kart is on autopilot). */
export function attractMode(seed: number): SimState {
  const state = sunnyRace(seed, { karts: 8, ai: true });
  state.phase = 'racing';
  state.race.goTick = -Math.round(20 / DT);
  return state;
}

export const menuScenarios: Scenario[] = [
  {
    name: 'menu-title',
    group: 'Menus',
    description: 'Title screen (also what the plain URL opens).',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'title' }),
  },
  {
    name: 'menu-kart-select',
    group: 'Menus',
    description: 'Kart select: ← → to browse, Enter to choose.',
    defaultSeed: 1,
    setup: (seed) => ({ state: sunnyLineup(seed), view: 'lineup', screen: 'kartSelect' }),
  },
  {
    name: 'menu-cc-select',
    group: 'Menus',
    description: 'Engine class select (50 / 100 / 150cc).',
    defaultSeed: 1,
    setup: (seed) => ({ state: sunnyLineup(seed), view: 'lineup', screen: 'ccSelect' }),
  },
  {
    name: 'menu-paused',
    group: 'Menus',
    description: 'Mid-race, paused: Resume / Restart / Quit.',
    defaultSeed: 1,
    setup: (seed) => {
      const state = sunnyRace(seed, { karts: 8, ai: true });
      state.phase = 'racing';
      state.race.goTick = -Math.round(15 / DT);
      return { state, screen: 'paused' };
    },
  },
];
