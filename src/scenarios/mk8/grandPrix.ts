// MK8 Grand Prix (MK-130) on the synthetic test ramp (no pack needed): a scripted 150cc Mushroom
// Cup (`src/mk8/gp/scripted.ts`, named by each scenario's `mk8Start` hint) with MK-121's field,
// you (Mario) as kart 0. Race 2 under way, race 2's standings with race 1's points before it (ties
// broken by race 2's places), and the podium after race 4.
import type { Scenario } from '../registry';
import { finalLap, finishedIn, onRamp } from './raceScreens';
import { TEST_RAMP } from './testRamp';

/** Races 2 and 4's finishing orders (kart ids); `SCRIPTED_RACES` in `src/mk8/gp/scripted.ts`. */
export const GP_RACE_2 = [0, 1, 3, 5, 2, 7, 4, 6];
export const GP_RACE_4 = [0, 5, 3, 1, 2, 7, 6, 4];

const scenarios: Scenario[] = [
  {
    name: 'mk8-gp-race2',
    group: 'MK8 Mode',
    description:
      "MK8 Grand Prix (MK-130), race 2 of the 150cc Mushroom Cup on its final lap (test ramp, no pack): finish it for the standings with race 1's points. Pause → Quit asks “Quit the Grand Prix?” first.",
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onRamp(finalLap, { mk8Start: 'gp-race2' }),
  },
  {
    name: 'mk8-gp-standings',
    group: 'MK8 Mode',
    description:
      "MK8 Grand Prix standings after race 2 (MK-130): race 1's points plus race 2's (+15, +12…), with ties at 25, 21, 15 and 11 points broken by race 2's places. Next race loads race 3 (its stand-in without a pack); Quit asks to confirm.",
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onRamp(finishedIn(GP_RACE_2), { mk8Start: 'gp-standings' }),
  },
  {
    name: 'mk8-gp-podium',
    group: 'MK8 Mode',
    description:
      'MK8 Grand Prix podium (MK-130) after race 4: you (Mario) won the cup on 50 points — the top 3 on the steps (block stand-ins without a pack), a gold trophy and confetti; the gold trophy is saved for 150cc and shows on the cup select. OK goes back to MK8 Mode.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: onRamp(finishedIn(GP_RACE_4), { mk8Start: 'gp-podium' }),
  },
];
export default scenarios;
