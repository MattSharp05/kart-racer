import { expect, it } from 'vitest';
import {
  allAiRace,
  raceItemStats,
  raceTrackIds,
  type RaceItemStats,
} from '../src/sim/items/balance';
import { availableItems } from '../src/sim/items';

/**
 * The item balance simulation (MK-72): `pnpm item-balance`. 50 seeded 8-AI races with items on,
 * spread over every race track, then checks the balance targets: every item used, at least 3 lead
 * changes a race on average, no item behind more than 30% of the hits. Minutes of CPU, so never
 * part of `pnpm test`. `RACES=12` runs fewer.
 */
const RACES = Number(process.env.RACES ?? 50);

function add(into: Record<string, number>, from: Record<string, number>): void {
  for (const [key, n] of Object.entries(from)) into[key] = (into[key] ?? 0) + n;
}

it(`item balance over ${RACES} races`, { timeout: 30 * 60_000 }, () => {
  const trackIds = raceTrackIds();
  const races: RaceItemStats[] = [];
  for (let i = 0; i < RACES; i += 1) {
    const seed = i + 1;
    const trackId = trackIds[i % trackIds.length] ?? 'sunny-circuit';
    races.push(raceItemStats(allAiRace(seed, trackId), seed));
  }
  const used: Record<string, number> = {};
  const hits: Record<string, number> = {};
  for (const race of races) {
    add(used, race.used);
    add(hits, race.hits);
  }
  const totalHits = Object.values(hits).reduce((a, b) => a + b, 0);
  const leadChanges = races.reduce((a, r) => a + r.leadChanges, 0) / races.length;
  const spreads = races.map((r) => r.finishSpread).sort((a, b) => a - b);
  const median = spreads[Math.floor(spreads.length / 2)] ?? 0;
  const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;

  const lines = [
    `races: ${races.length} on ${trackIds.join(', ')}`,
    `all finished: ${races.filter((r) => r.finishers === 8).length}/${races.length}`,
    `lead changes / race: ${leadChanges.toFixed(1)} (min ${Math.min(...races.map((r) => r.leadChanges))}, max ${Math.max(...races.map((r) => r.leadChanges))})`,
    `finish spread (1st → 8th): mean ${mean.toFixed(1)} s, median ${median.toFixed(1)} s, min ${spreads[0]?.toFixed(1)} s, max ${spreads.at(-1)?.toFixed(1)} s`,
    `total item hits: ${totalHits}`,
    'item | used | hits | share of hits',
    ...availableItems().map(
      (id) =>
        `${id} | ${used[id] ?? 0} | ${hits[id] ?? 0} | ${totalHits ? (((hits[id] ?? 0) / totalHits) * 100).toFixed(1) : '0'}%`,
    ),
    'per track: lead changes, spread',
    ...trackIds.flatMap((id) => {
      const on = races.filter((r) => r.trackId === id);
      if (on.length === 0) return [];
      const lc = on.reduce((a, r) => a + r.leadChanges, 0) / on.length;
      const sp = on.reduce((a, r) => a + r.finishSpread, 0) / on.length;
      return `${id}: ${lc.toFixed(1)}, ${sp.toFixed(1)} s`;
    }),
  ];
  process.stdout.write(`${lines.join('\n')}\n`);

  for (const id of availableItems()) expect(used[id] ?? 0, `${id} used`).toBeGreaterThan(0);
  expect(leadChanges).toBeGreaterThanOrEqual(3);
  expect(totalHits, 'item hits').toBeGreaterThan(0);
  for (const id of availableItems()) {
    expect((hits[id] ?? 0) / totalHits, `${id} share of hits`).toBeLessThanOrEqual(0.3);
  }
});
