import { expect, test, type Page } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import { autopilotAll, netInfo, openRoom, stepAll } from './online';

// Online races over BroadcastChannel (MK-46). Desktop projects only: see playwright.config.ts.

/** Ticks per `stepAll` batch while waiting for the finish. */
const BATCH = 300;
/** A 1-lap race is ~62 s; give it plenty. */
const MAX_TICKS = 60 * 120;

function state(page: Page): Promise<TestState> {
  return page.evaluate(() => window.__game!.getState());
}

/** Each finished kart's result: its place, finish tick and lap times. */
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

/** The room results' finished rows (with a time, MK-55), without the "(you)" marker. */
async function resultRows(page: Page): Promise<string[]> {
  const rows = page.locator('ol.online-results[data-final="true"] li');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const texts = await rows.allInnerTexts();
  return texts
    .map((text) => text.replace(' (you)', '').replace(/\s+/g, ' ').trim())
    .filter((text) => !text.includes('—'));
}

test.describe('online race over BroadcastChannel', () => {
  test('host and client race start to finish with matching results', async ({ browser }) => {
    test.setTimeout(120_000);
    const room = await openRoom(browser, 2, { laps: 1 });
    const [host, client] = room.pages as [Page, Page];
    expect(await netInfo(host)).toMatchObject({ role: 'host', kartId: 0, started: true });
    expect(await netInfo(client)).toMatchObject({ role: 'client', kartId: 1 });
    await autopilotAll(room.pages);

    let hostState = await state(host);
    for (let ticks = 0; hostState.phase !== 'finished' && ticks < MAX_TICKS; ticks += BATCH) {
      await stepAll(room.pages, BATCH);
      hostState = await state(host);
    }
    expect(hostState.phase).toBe('finished');
    // A few more snapshots so the client has the host's finish.
    await stepAll(room.pages, 30);
    const clientState = await state(client);
    const hostNet = await netInfo(host);
    const clientNet = await netInfo(client);

    expect(clientState.phase).toBe('finished');
    expect(clientState.localKartId).toBe(1);
    expect(clientNet!.lastSnapshotTick).toBeGreaterThan(hostState.tick);
    expect(clientNet!.lastSnapshotTick).toBeLessThanOrEqual(hostNet!.lastSnapshotTick);
    // Every result decided by the host's finish is the same on the client (finished karts keep
    // their place and times; the AI still racing can't change them).
    const hostResults = results(hostState);
    expect(hostResults.map((r) => r.kartId)).toEqual(expect.arrayContaining([0, 1]));
    expect(results(clientState).slice(0, hostResults.length)).toEqual(hostResults);
    // …and so is what each player sees on the results screen.
    expect(await resultRows(client)).toEqual(await resultRows(host));
    await room.context.close();
  });

  test('the countdown waits until every player has joined', async ({ browser }) => {
    const room = await openRoom(browser, 1, { scenario: 'online-race-2p' });
    const host = room.host;
    await stepAll([host], 60);
    expect((await state(host)).tick).toBe(0); // waiting for the second player
    expect(await netInfo(host)).toMatchObject({ players: 1, expectedPlayers: 2, started: false });
    await room.context.close();
  });

  test('&netsim adds lag to the link', async ({ browser }) => {
    // Simulated lag is real time (it delays packets with timers), so this one runs unpaused and
    // measures the RTT; it asserts nothing about gameplay.
    const room = await openRoom(browser, 2, { scenario: 'net-bad', paused: false });
    // Pings go out every 0.5 s: wait for a few round trips.
    await expect
      .poll(() => netInfo(room.clients[0]!).then((net) => net?.rttMs ?? 0), { timeout: 10_000 })
      .toBeGreaterThan(150);
    await room.context.close();
  });
});

test.describe('/dev Online group', () => {
  test('lists the online scenarios with host and client links that join one room', async ({
    context,
  }) => {
    const dev = await context.newPage();
    await dev.goto('/dev.html');
    const group = dev.locator('section', { has: dev.getByRole('heading', { name: 'Online' }) });
    for (const name of ['online-race-2p', 'online-race-4p', 'net-good', 'net-bad']) {
      const item = group.locator(`[data-scenario="${name}"]`);
      await expect(item.getByRole('link', { name, exact: true })).toHaveAttribute(
        'href',
        /role=host/,
      );
      await expect(item.getByRole('link', { name: `${name} client` })).toHaveAttribute(
        'href',
        /role=client/,
      );
    }

    const item = group.locator('[data-scenario="online-race-2p"]');
    await item.getByRole('link', { name: 'online-race-2p', exact: true }).click();
    await dev.waitForFunction(() => window.__game?.ready === true);
    const client = await context.newPage();
    await client.goto('/dev.html');
    await client.getByRole('link', { name: 'online-race-2p client' }).click();
    await client.waitForFunction(() => window.__game?.ready === true);

    await expect.poll(() => netInfo(dev).then((net) => net?.players)).toBe(2);
    await expect.poll(() => netInfo(client).then((net) => net?.kartId)).toBe(1);
    // The race runs: step both and the client applies the host's snapshots.
    for (const page of [dev, client]) await page.evaluate(() => window.__game!.pause());
    await stepAll([dev, client], 30);
    expect((await netInfo(client))!.lastSnapshotTick).toBeGreaterThan(0);
  });
});
