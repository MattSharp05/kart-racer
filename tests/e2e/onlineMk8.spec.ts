import { expect, test, type Page } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import { autopilotAll, netInfo, openRoom, stepAll } from './online';

// MK8 Mode online (MK-132): a room racing an MK8 course over BroadcastChannel, every kart on an
// MK8 racer and kart loadout (protocol v6). On the synthetic MK8 test ramp: no Nintendo assets in
// CI. Named `online*` so it runs in the online projects, one test at a time (playwright.config.ts).

const SCENARIO = 'mk8-online-race-2p';
/** Ticks per `stepAll` batch while waiting for the finish. */
const BATCH = 300;
/** A lap of the test ramp at 150cc is ~30 s; give it plenty. */
const MAX_TICKS = 60 * 120;
/** Racing time before comparing the client's kart with the host's, ticks. */
const RACING_TICKS = 240;

function state(page: Page): Promise<TestState> {
  return page.evaluate(() => window.__game!.getState());
}

/** What makes two copies of a race the same MK8 race: course, items, class and every loadout. */
async function mk8Race(page: Page) {
  const s = await state(page);
  return {
    trackId: s.trackId,
    itemSet: s.itemSet,
    engineClass: s.engineClass,
    laps: s.race.laps,
    karts: s.karts.map((k) => `${k.kartType}:${JSON.stringify(k.loadout)}:${k.name ?? ''}`),
  };
}

/** Each finished kart's place, finish tick and lap times. */
function results(s: TestState) {
  return s.positions
    .map((kartId, i) => ({ kartId, place: i + 1, kart: s.karts[kartId]! }))
    .filter(({ kart }) => kart.race.finishTick !== undefined)
    .map(({ kartId, place, kart }) => ({
      kartId,
      place,
      finishTick: kart.race.finishTick,
      lapTimes: kart.race.lapTimes,
    }));
}

test.describe('MK8 Mode online (MK-132)', () => {
  test('host and client join the same MK8 race, loadouts and all, and the client keeps up', async ({
    context,
  }) => {
    test.setTimeout(90_000);
    const room = await openRoom(context, 2, { scenario: SCENARIO, laps: 1 });
    const [host, client] = room.pages as [Page, Page];
    expect(await netInfo(client)).toMatchObject({ role: 'client', kartId: 1 });
    const hostRace = await mk8Race(host);
    expect(hostRace).toMatchObject({ trackId: 'mk8-test-ramp', itemSet: 'mk8', laps: 1 });
    expect(hostRace.karts[1]).toContain('"racer":"mk8-peach"');
    // The client built its race from the host's Start: the same course, items and loadouts.
    expect(await mk8Race(client)).toEqual(hostRace);

    await autopilotAll(room.pages);
    const goTick = (await state(host)).race.goTick;
    await stepAll(room.pages, goTick + RACING_TICKS - (await state(host)).tick);
    const [h, c] = await Promise.all([state(host), state(client)]);
    expect(h.phase).toBe('racing');
    // The client's own kart where the host has it (its prediction runs a little ahead).
    const truth = h.karts[1]!;
    const mine = c.karts[1]!;
    expect(mine.coins).toBeDefined();
    expect(mine.up).toBeDefined();
    const ahead = c.tick - h.tick;
    expect(ahead).toBeGreaterThanOrEqual(0);
    const apart = Math.hypot(
      mine.position.x - truth.position.x - truth.velocity.x * ahead * (1 / 60),
      mine.position.z - truth.position.z - truth.velocity.z * ahead * (1 / 60),
    );
    expect(apart).toBeLessThan(1);
  });

  // A full race (~40 s on CI): main only (MK-89).
  test(
    'host and client race an MK8 course start to finish with matching results',
    { tag: '@full' },
    async ({ context }) => {
      test.setTimeout(180_000);
      const room = await openRoom(context, 2, { scenario: SCENARIO, laps: 1 });
      const [host, client] = room.pages as [Page, Page];
      await autopilotAll(room.pages);
      let hostState = await state(host);
      for (let ticks = 0; hostState.phase !== 'finished' && ticks < MAX_TICKS; ticks += BATCH) {
        await stepAll(room.pages, BATCH);
        hostState = await state(host);
      }
      expect(hostState.phase).toBe('finished');
      await stepAll(room.pages, 30);
      const clientState = await state(client);
      expect(clientState.phase).toBe('finished');
      const hostResults = results(hostState);
      expect(hostResults.map((r) => r.kartId)).toEqual(expect.arrayContaining([0, 1]));
      expect(results(clientState).slice(0, hostResults.length)).toEqual(hostResults);
      expect((await netInfo(client))?.results).toEqual((await netInfo(host))?.results);
    },
  );
});
