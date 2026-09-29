import { expect, it } from 'vitest';
import { KART_IDS } from '../data/karts';
import {
  balanceRace,
  balanceRacePlan,
  finishOrder,
  formatSummary,
  tallyRaces,
} from './racerBalance';

/**
 * The racer balance smoke (MK-88): the first 20 of `pnpm racer-balance`'s races (items on, every
 * racer on the grid 16 times), no racer winning more than 35% of them. Stops a stat or AI change
 * from handing one racer the races again. Minutes of CPU, so it runs apart from `pnpm test`:
 * `pnpm test:balance` (its own CI job).
 */
const RACES = 20;
/** Most of the races one racer may win. */
const MAX_WIN_SHARE = 0.35;

it(
  `racer balance smoke: ${RACES} races, nobody wins more than 35%`,
  { timeout: 15 * 60_000 },
  () => {
    const orders: string[][] = [];
    const entries: string[][] = [];
    for (let index = 0; index < RACES; index += 1) {
      orders.push(finishOrder(balanceRace(index, { itemsOn: true })));
      entries.push(balanceRacePlan(index).kartIds);
    }
    const summary = tallyRaces(orders, entries);
    process.stdout.write(`${formatSummary(summary)}\n`);
    expect(summary.map((r) => r.id)).toEqual(KART_IDS);
    for (const r of summary) {
      expect(r.winShare, `${r.id} win share`).toBeLessThanOrEqual(MAX_WIN_SHARE);
    }
  },
);
