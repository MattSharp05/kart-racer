// MK8 loadouts (MK-102): a kart's physics from MK8's stat table.
import { createSimState } from '../../sim/state';
import type { Loadout, SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { spawn } from './lib/sunny';

/** MK-102's loadout scenarios: a heavy and a light MK8 kart (the extremes of the stat table). */
export const LOADOUTS = {
  heavy: { racer: 'mk8-bowser', body: 'b-dasher', tires: 'slick-tires', glider: 'paper-glider' },
  light: { racer: 'mk8-toad', body: 'pipe-frame', tires: 'slim-tires', glider: 'cloud-glider' },
} as const satisfies Record<string, Loadout>;

/**
 * A kart in `loadout` at rest at the start of Sunny Circuit's main straight, alone (MK-102). MK8
 * racers don't race in the original game's renderer yet, so a stand-in original racer of the same
 * build is drawn (`kartType`); the physics are the loadout's.
 */
export function mk8LoadoutRace(seed: number, which: keyof typeof LOADOUTS): SimState {
  return createSimState({
    seed,
    trackId: 'sunny-circuit',
    itemsOn: false,
    karts: [
      {
        // Past the first item boxes: no boost pad for the next 10 s (`mk8Golden`).
        ...spawn(5, 0),
        kartType: which === 'heavy' ? 'boulder' : 'pixie',
        loadout: LOADOUTS[which],
      },
    ],
  });
}

const scenarios: Scenario[] = [
  ...(['heavy', 'light'] as const).map((which): Scenario => ({
    name: `mk8-loadout-${which}`,
    group: 'MK8 Mode',
    description:
      which === 'heavy'
        ? "A heavy MK8 kart (MK-102): Bowser on B Dasher, Slick tires, Paper Glider (speed 5.75, acceleration 1.5), at rest on Sunny Circuit's straight, no items. Slow off the line, the highest top speed. Drawn as Boulder until MK8 races draw MK8 karts."
        : "A light MK8 kart (MK-102): Toad on Pipe Frame, Slim tires, Cloud Glider (speed 3, acceleration 3.25), at rest on Sunny Circuit's straight, no items. Quick off the line, a lower top speed. Drawn as Pixie until MK8 races draw MK8 karts.",
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8LoadoutRace(seed, which) }),
  })),
];
export default scenarios;
