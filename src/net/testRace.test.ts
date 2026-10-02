import { afterEach, describe, expect, it } from 'vitest';
import { items, registerItem, unregisterItem } from '../content/items';
import { oddsTable } from '../sim/items/odds';
import { onlineRace, scriptedInput, TEST_RACE_ODDS, TICK_MS, withTestRaceItems } from './testRace';
import { parseNetConditions } from './netsim';

/** A made-up item with odds in every row, as a new item in the roulette would be (MK-86). */
const DUMMY = 'mk86-dummy';

/** 20 s of a seeded test race (host + 1 client, items on) with the test race items. */
function race(): string {
  return withTestRaceItems(() => {
    const { host, clients, clock } = onlineRace({
      clients: 1,
      conditions: parseNetConditions('40,10,2'),
      seed: 3,
    });
    for (let t = 0; t < 20 * 60; t += 1) {
      host.tick(scriptedInput(host.state.karts[0], host.state.tick, 0));
      const client = clients[0];
      client?.tick(scriptedInput(client.state?.karts[1], client.state?.tick ?? 0, 1));
      clock.advance(TICK_MS);
    }
    return JSON.stringify(host.state);
  });
}

describe('test race items (MK-86)', () => {
  afterEach(() => unregisterItem(DUMMY));

  it('are the MVP six with their frozen odds, and the game gets its own back after', () => {
    const own = items.ids();
    withTestRaceItems(() => {
      expect(items.ids()).toEqual(Object.keys(TEST_RACE_ODDS));
      for (const item of items.list()) expect(item.odds).toEqual(TEST_RACE_ODDS[item.id]);
    });
    expect(items.ids()).toEqual(own);
  });

  it('a new item with odds in the roulette changes neither the odds nor a seeded race', () => {
    const odds = withTestRaceItems(() => oddsTable());
    const before = race();
    const mushroom = items.get('mushroom');
    registerItem({ ...mushroom, id: DUMMY, effects: [], entities: [], odds: Array(8).fill(0.5) });
    expect(oddsTable()[0]).toHaveProperty(DUMMY, 0.5);
    expect(withTestRaceItems(() => oddsTable())).toEqual(odds);
    expect(race()).toEqual(before);
  });
});
