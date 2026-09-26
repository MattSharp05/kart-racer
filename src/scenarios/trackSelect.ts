import { recordStorage } from '../game/storage/records';
import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { sunnyLineup } from './menus';
import { SAVED_RECORDS } from './race';
import type { Scenario } from './registry';

/** The engine class the saved records are for: the menus' default. */
const RECORDS_CLASS = 100;

export const trackSelectScenarios: Scenario[] = [
  {
    name: 'track-select',
    group: 'Menus',
    description:
      'Track select (MK-50): a card per track (outline, hazard, your records). Arrows or a tap to pick, Enter / Race! to start.',
    defaultSeed: 1,
    setup: (seed) => ({ state: sunnyLineup(seed), view: 'lineup', screen: 'trackSelect' }),
  },
  {
    name: 'track-select-records',
    group: 'Menus',
    description:
      "Track select with records-has-best's saved records on Sunny Circuit at 100cc (race 2:40.000, lap 0:48.000).",
    defaultSeed: 1,
    setup: (seed) => ({
      state: sunnyLineup(seed),
      view: 'lineup',
      screen: 'trackSelect',
      storage: {
        ...recordStorage(sunnyCircuit.id, RECORDS_CLASS, SAVED_RECORDS),
        // The records are for 100cc, so show that class whatever the saved pref.
        'kart-racer:prefs': JSON.stringify({ engineClass: RECORDS_CLASS }),
      },
    }),
  },
];
