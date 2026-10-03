import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { items, itemSets, registerItem, unregisterItem } from '../../../content/items';
import { availableItems } from '../../../sim/items';
import { itemSetOddsRow, oddsTable, pickItem, rowIndex } from '../../../sim/items/odds';
import { rngFloat, seedRng } from '../../../sim/rng';
import { ITEM_SPRITES } from '../../ui/sprites';
import { registerMk8Content } from '../../register';
import { MK8_ITEM_SET, MK8_ITEMS, MK8_ODDS, MK8_TABLE, mk8ItemSet, mk8ItemSim, OURS } from '.';

const ROWS = 9;
const ROLLS = 10_000;
/** Ids in MK8's table no item ticket has built yet: stubbed so every column is in play. */
const stubs = Object.keys(MK8_ODDS).filter((id) => !items.has(id));

beforeAll(() => {
  registerMk8Content();
  for (const id of stubs) registerItem(mk8ItemSim({ id, name: id, order: 900, onUse: () => {} }));
});
afterAll(() => {
  for (const id of stubs) unregisterItem(id);
});

/** Each item's share of `rolls` roulette rolls for `position` among `racers`. */
function rollShares(position: number, racers: number, seed: number): Record<string, number> {
  const rng = { rngState: seedRng(seed) };
  const odds = itemSetOddsRow(MK8_ITEM_SET, position, racers);
  const available = availableItems(MK8_ITEM_SET);
  const counts: Record<string, number> = {};
  for (let i = 0; i < ROLLS; i += 1) {
    const item = pickItem(odds, rngFloat(rng), available) ?? 'none';
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).map(([id, n]) => [id, n / ROLLS]));
}

describe('MK8 odds (MK-103)', () => {
  it("has MK8's 21 columns and our 5, 9 rows each", () => {
    expect(Object.keys(MK8_TABLE)).toHaveLength(21);
    expect(Object.keys(OURS).sort()).toEqual(
      ['bubble-shield', 'hornet-swarm', 'magnet', 'oil-slick', 'phase'].sort(),
    );
    for (const row of Object.values(MK8_ODDS)) expect(row).toHaveLength(ROWS);
  });

  it("MK8's part of every row sums to 200 (its percentages × 2), ours stays low", () => {
    for (let r = 0; r < ROWS; r += 1) {
      expect(Object.values(MK8_TABLE).reduce((sum, row) => sum + row[r]!, 0)).toBe(200);
      const ours = Object.values(OURS).reduce((sum, row) => sum + row[r]!, 0);
      expect(ours / (200 + ours)).toBeLessThan(0.1);
    }
  });

  it('spreads race positions over the rows: 1st gets the first, last gets the last', () => {
    expect(rowIndex(1, 8, ROWS)).toBe(0);
    expect(rowIndex(8, 8, ROWS)).toBe(ROWS - 1);
    expect(Array.from({ length: 9 }, (_, i) => rowIndex(i + 1, 9, ROWS))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('over 10k rolls per position, the items come out as odds.ts says (within 1 %)', () => {
    for (let position = 1; position <= ROWS; position += 1) {
      const row = position - 1;
      const total = Object.values(MK8_ODDS).reduce((sum, weights) => sum + weights[row]!, 0);
      const shares = rollShares(position, ROWS, position);
      for (const [id, weights] of Object.entries(MK8_ODDS)) {
        expect(
          Math.abs((shares[id] ?? 0) - weights[row]! / total),
          `${id} @ ${position}`,
        ).toBeLessThan(0.01);
      }
    }
  });

  it("leaves the original game's odds alone", () => {
    // Stubbed MK8-only items have zero odds there: every original row still sums to 1.
    for (const row of oddsTable()) {
      expect(Object.values(row).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
    for (const id of stubs) expect(availableItems()).not.toContain(id);
  });

  it('is the registered mk8 set, with two slots', () => {
    expect(itemSets.get(MK8_ITEM_SET)).toBe(mk8ItemSet);
    expect(mk8ItemSet.slots).toBe(2);
  });
});

describe('MK8 items (MK-103)', () => {
  it('every MK8 item is in the odds table and has an icon sprite', () => {
    for (const item of MK8_ITEMS) {
      expect(MK8_ODDS[item.id], item.id).toBeDefined();
      expect(ITEM_SPRITES as readonly string[]).toContain(item.icon);
    }
  });

  it('every reskin is one of our items', () => {
    for (const item of MK8_ITEMS.filter((i) => !i.sim)) expect(items.has(item.id)).toBe(true);
  });
});
