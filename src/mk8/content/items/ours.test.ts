// MK-115: our five unique items in MK8 races. Their behaviour is ours (only their looks change), so
// their own unit tests run again here with every race on MK8's item set: `createSimState` makes
// `mk8` races (MK8's odds, two slots) unless a test picks another set.
import { describe, expect, it, vi } from 'vitest';
import './ours/registerFirst';
import { itemSets } from '../../../content/items';
import { createSimState } from '../../../sim/state';
import { MK8_ITEM_SET } from './id';
import { MK8_ITEMS, OURS } from '.';

vi.mock('../../../sim/state', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../sim/state')>();
  const { MK8_ITEM_SET: set } = await import('./id');
  return {
    ...original,
    createSimState: (options: Parameters<typeof original.createSimState>[0]) =>
      original.createSimState({ itemSet: set, itemSlots: 2, ...options }),
  };
});

describe('our five items race on the mk8 item set', () => {
  it('builds mk8 races, with all five in the odds and an MK8 look each', () => {
    expect(createSimState({ seed: 1 }).itemSet).toBe(MK8_ITEM_SET);
    const odds = itemSets.get(MK8_ITEM_SET).odds;
    for (const id of Object.keys(OURS)) {
      expect(odds[id]?.some((weight) => weight > 0)).toBe(true);
      expect(MK8_ITEMS.some((item) => item.id === id)).toBe(true);
    }
  });
});

// Each item's own tests (they register here, under the mock).
import '../../../content/items/oil-slick/sim.test';
import '../../../content/items/hornet-swarm/sim.test';
import '../../../content/items/bubble-shield/sim.test';
import '../../../content/items/magnet/sim.test';
import '../../../content/items/phase/sim.test';
