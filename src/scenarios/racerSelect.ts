import { racers, type RacerContent } from '../content/racers';
import { racerViews, type RacerView } from '../content/racers/render';
import { sunnyLineup } from './menus';
import type { Scenario } from './registry';

/** The grid the racer select is laid out for (MK-51): 10 racers, 2 rows of 5 on a phone. */
export const FULL_ROSTER = 10;
/** Paints for the stand-ins, so the cards tell apart. */
const STAND_IN_PAINTS = [0x3a86ff, 0x8338ec, 0xff006e, 0xfb5607, 0x06d6a0, 0x118ab2];

/**
 * Until MK-63/MK-64 add the six new racers: registers stand-ins (copies of the registered racers'
 * stats and shapes, own names and paints) so the grid has 10 cards. Only for this scenario's page;
 * registers nothing once 10 real racers exist, and only once per page.
 */
function registerStandIns(): void {
  const real = racers.list().filter((r) => !r.id.startsWith('stand-in-'));
  for (let i = 0; real.length + i < FULL_ROSTER; i += 1) {
    const id = `stand-in-${i + 1}`;
    if (racers.has(id)) continue;
    const model = real[i % real.length];
    if (!model) return;
    const view = racerViews.get(model.id);
    racers.register({
      id,
      name: `Stand-in ${i + 1}`,
      order: 1000 + i,
      tagline: `Placeholder card (copies ${model.name}) until the new racers land.`,
      stats: { ...model.stats },
    } satisfies RacerContent);
    racerViews.register({
      ...view,
      id,
      colours: {
        ...view.colours,
        body: STAND_IN_PAINTS[i % STAND_IN_PAINTS.length] ?? view.colours.body,
      },
    } satisfies RacerView);
  }
}

export const racerSelectScenarios: Scenario[] = [
  {
    name: 'racer-select',
    group: 'Menus',
    description:
      'Racer select (MK-51): a card per registered racer, the turntable and stats. Arrows or a tap to pick, Enter / Choose to go on.',
    defaultSeed: 1,
    setup: (seed) => ({ state: sunnyLineup(seed), view: 'lineup', screen: 'racerSelect' }),
  },
  {
    name: 'racer-select-full',
    group: 'Menus',
    description:
      'Racer select with 10 racers (layout check): the registered ones plus stand-ins up to 10.',
    defaultSeed: 1,
    setup: (seed) => {
      registerStandIns();
      return { state: sunnyLineup(seed), view: 'lineup', screen: 'racerSelect' };
    },
  },
];
