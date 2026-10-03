import { expect, it } from 'vitest';
import { registerTestRamp } from '../src/mk8/content/courses/test-ramp/register';
import { MK8_ITEM_SET } from '../src/mk8/content/items/id';
import { registerMk8Content } from '../src/mk8/register';
import { TEST_RAMP } from '../src/scenarios/mk8/testRamp';
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
 *
 * MK8's items (MK-129): `ITEM_SET=mk8 pnpm item-balance` races MK8's set at 150cc on the synthetic
 * MK8 test ramp (no pack needed), with MK8's targets: every item used at least once per 10 races,
 * no item behind more than 25% of the hits, and the back half of the field handed mostly catch-up
 * items (and more of them than the front half).
 */
const RACES = Number(process.env.RACES ?? 50);
const MK8 = process.env.ITEM_SET === MK8_ITEM_SET;
/** Items that bring a kart back into the race: boosts, invincibility, and hitting the leaders. */
const CATCH_UP = new Set([
  'mushroom',
  'triple-mushroom',
  'golden-mushroom',
  'star',
  'bullet-bill',
  'lightning',
  'spiny-shell',
  'red',
  'triple-red',
]);

function add(into: Record<string, number>, from: Record<string, number>): void {
  for (const [key, n] of Object.entries(from)) into[key] = (into[key] ?? 0) + n;
}

it(`item balance over ${RACES} races${MK8 ? ' (MK8 items)' : ''}`, { timeout: 30 * 60_000 }, () => {
  if (MK8) {
    registerMk8Content();
    registerTestRamp();
  }
  const itemSet = MK8 ? MK8_ITEM_SET : undefined;
  const trackIds = MK8 ? [TEST_RAMP.id] : raceTrackIds();
  const races: RaceItemStats[] = [];
  for (let i = 0; i < RACES; i += 1) {
    const seed = i + 1;
    const trackId = trackIds[i % trackIds.length] ?? 'sunny-circuit';
    const state = MK8 ? allAiRace(seed, trackId, 8, 150, itemSet) : allAiRace(seed, trackId);
    races.push(raceItemStats(state, seed));
  }
  const used: Record<string, number> = {};
  const hits: Record<string, number> = {};
  /** Items handed out to the front half of the field and to the back half. */
  const front: Record<string, number> = {};
  const back: Record<string, number> = {};
  for (const race of races) {
    add(used, race.used);
    add(hits, race.hits);
    for (const [id, places] of Object.entries(race.granted)) {
      const half = places.length / 2;
      places.forEach((n, place) => {
        const into = place < half ? front : back;
        into[id] = (into[id] ?? 0) + n;
      });
    }
  }
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const catchUp = (r: Record<string, number>) =>
    sum(Object.fromEntries(Object.entries(r).filter(([id]) => CATCH_UP.has(id)))) / (sum(r) || 1);
  const totalHits = sum(hits);
  const leadChanges = races.reduce((a, r) => a + r.leadChanges, 0) / races.length;
  const spreads = races.map((r) => r.finishSpread).sort((a, b) => a - b);
  const median = spreads[Math.floor(spreads.length / 2)] ?? 0;
  const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const ids = availableItems(itemSet);
  const pct = (n: number, of: number) => (of ? ((n / of) * 100).toFixed(1) : '0');

  const lines = [
    `races: ${races.length} on ${trackIds.join(', ')}${MK8 ? ' (MK8 items, 150cc)' : ''}`,
    `all finished: ${races.filter((r) => r.finishers === 8).length}/${races.length}`,
    `lead changes / race: ${leadChanges.toFixed(1)} (min ${Math.min(...races.map((r) => r.leadChanges))}, max ${Math.max(...races.map((r) => r.leadChanges))})`,
    `finish spread (1st → 8th): mean ${mean.toFixed(1)} s, median ${median.toFixed(1)} s, min ${spreads[0]?.toFixed(1)} s, max ${spreads.at(-1)?.toFixed(1)} s`,
    `total item hits: ${totalHits}`,
    `catch-up items handed out: front half ${pct(catchUp(front), 1)}%, back half ${pct(catchUp(back), 1)}%`,
    'item | used | hits | share of hits | handed out front / back',
    ...ids.map(
      (id) =>
        `${id} | ${used[id] ?? 0} | ${hits[id] ?? 0} | ${pct(hits[id] ?? 0, totalHits)}% | ${front[id] ?? 0} / ${back[id] ?? 0}`,
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

  expect(totalHits, 'item hits').toBeGreaterThan(0);
  if (MK8) {
    for (const id of ids) {
      expect(used[id] ?? 0, `${id} used per 10 races`).toBeGreaterThanOrEqual(RACES / 10);
      expect((hits[id] ?? 0) / totalHits, `${id} share of hits`).toBeLessThanOrEqual(0.25);
    }
    expect(catchUp(back), 'back half: catch-up share').toBeGreaterThanOrEqual(0.5);
    expect(catchUp(back), 'back half gets more catch-up').toBeGreaterThan(catchUp(front));
    return;
  }
  for (const id of ids) expect(used[id] ?? 0, `${id} used`).toBeGreaterThan(0);
  expect(leadChanges).toBeGreaterThanOrEqual(3);
  for (const id of ids) {
    expect((hits[id] ?? 0) / totalHits, `${id} share of hits`).toBeLessThanOrEqual(0.3);
  }
});
