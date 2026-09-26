import { expect, test, type Page } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import { autopilotAll, openLobby, stepAll, waitForRaces } from './online';

/**
 * The online race flow (MK-55): a room's race to the results everyone shares, then the host's Race
 * again or Next track, and a pause menu that doesn't stop the race. Rooms and races run over
 * BroadcastChannel (`?net=local`), so desktop projects only (see playwright.config.ts).
 */

/** Ticks per `stepAll` batch while waiting for the finish. */
const BATCH = 300;
/** A 1-lap race is ~62 s; give it plenty. */
const MAX_TICKS = 60 * 120;

function state(page: Page): Promise<TestState> {
  return page.evaluate(() => window.__game!.getState());
}

/** Races every page's kart to the end in lock-step: until the host's race has ended. */
async function raceToTheEnd(pages: Page[]): Promise<void> {
  for (const page of pages) await page.evaluate(() => window.__game!.pause());
  await autopilotAll(pages);
  const host = pages[0]!;
  let hostState = await state(host);
  for (let ticks = 0; hostState.phase !== 'finished' && ticks < MAX_TICKS; ticks += BATCH) {
    await stepAll(pages, BATCH);
    hostState = await state(host);
  }
  expect(hostState.phase).toBe('finished');
  // A few more snapshots, so every client has the host's results; then real time again (the
  // results screen opens on a timer).
  await stepAll(pages, 30);
  for (const page of pages) await page.evaluate(() => window.__game!.resume());
}

/** The final results as shown, one string per row, without this page's "(you)". */
async function finalRows(page: Page): Promise<string[]> {
  const list = page.locator('ol.online-results[data-final="true"]');
  await expect(list).toBeVisible({ timeout: 20_000 });
  const rows = await list.locator('li').allInnerTexts();
  return rows.map((text) => text.replace(' (you)', '').replace(/\s+/g, ' ').trim());
}

/** What makes two races "the same settings": track, class, items, karts and who drives them. */
async function raceSettings(page: Page) {
  const s = await state(page);
  return {
    trackId: s.trackId,
    engineClass: s.engineClass,
    laps: s.race.laps,
    itemBoxes: s.entities.filter((e) => e.kind === 'itemBox').length,
    karts: s.karts.map((k) => `${k.kartType}:${k.name ?? ''}`),
  };
}

test.describe('online race flow', () => {
  test('4 players race to the same results; Race again puts everyone in a new race', async ({
    context,
  }) => {
    test.setTimeout(300_000);
    const room = await openLobby(context, 4, { laps: 1 });
    const { host, clients, pages } = room;
    const before = await Promise.all(pages.map(raceSettings));
    const kartIds = await Promise.all(pages.map((p) => state(p).then((s) => s.localKartId)));
    expect(kartIds).toEqual([0, 1, 2, 3]);
    // Everyone's countdown runs on the host's ticks: the same go tick everywhere.
    const goTicks = await Promise.all(pages.map((p) => state(p).then((s) => s.race.goTick)));
    expect(new Set(goTicks).size).toBe(1);

    await raceToTheEnd(pages);

    // Every page shows the host's results: the same 8 rows, the 4 people highlighted.
    const hostRows = await finalRows(host);
    expect(hostRows).toHaveLength(8);
    for (const client of clients) expect(await finalRows(client)).toEqual(hostRows);
    for (const [i, page] of pages.entries()) {
      await expect(page.locator('.online-results li.human')).toHaveCount(4);
      await expect(page.locator('.online-results li.you')).toContainText(room.names[i]!);
    }
    // The host picks what's next; the others wait for it.
    for (const client of clients) {
      await expect(client.locator('.online-results-status')).toHaveText('Waiting for host…');
      await expect(client.getByRole('button', { name: 'Race again' })).toHaveCount(0);
    }
    await expect(host.getByRole('button', { name: 'Next track' })).toBeEnabled();
    const lastTick = (await state(host)).tick;

    // Race again: a new race with the same settings on every page.
    await host.getByRole('button', { name: 'Race again' }).click();
    for (const page of pages) {
      await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
      await expect.poll(() => state(page).then((s) => s.tick < lastTick)).toBe(true);
    }
    await waitForRaces(pages);
    for (const [i, page] of pages.entries()) {
      expect(await raceSettings(page)).toEqual(before[i]);
      const s = await state(page);
      expect(s.localKartId).toBe(i);
      expect(s.phase).not.toBe('finished');
    }
  });

  test('Next track takes the host and everyone on the results back to the lobby', async ({
    context,
  }) => {
    test.setTimeout(240_000);
    const room = await openLobby(context, 2, { laps: 1 });
    const [host, guest] = room.pages as [Page, Page];
    await raceToTheEnd(room.pages);
    await finalRows(guest);
    await host.getByRole('button', { name: 'Next track' }).click();
    for (const page of room.pages) {
      await expect(page.locator('.menu-lobby')).toBeVisible({ timeout: 10_000 });
      expect(await page.evaluate(() => window.__game!.net())).toBeNull();
    }
    // The host can pick again and start: the guest is still ready.
    await expect(host.getByRole('combobox', { name: 'Track' })).toBeEnabled();
    await expect(host.getByRole('button', { name: 'Start' })).toBeEnabled();
  });

  test("pausing on a client opens its menu but doesn't stop anyone's race", async ({ context }) => {
    test.setTimeout(120_000);
    const { pages, clients } = await openLobby(context, 3);
    const pauser = clients[0]!;
    await pauser.getByRole('button', { name: 'Pause' }).click();
    await expect(pauser.locator('.menu-paused')).toBeVisible();
    await expect(pauser.locator('.pause-note')).toHaveText('Race continues');
    await expect(pauser.getByRole('button', { name: 'Restart race' })).toHaveCount(0);
    expect(await pauser.evaluate(() => window.__game!.isPaused())).toBe(false);

    // Every page's race keeps ticking while the menu is open, the pauser's own included.
    const ticks = () => Promise.all(pages.map((p) => state(p).then((s) => s.tick)));
    const start = await ticks();
    await expect
      .poll(async () => (await ticks()).every((t, i) => t > start[i]! + 30), { timeout: 20_000 })
      .toBe(true);
    for (const page of pages)
      expect(await page.evaluate(() => window.__game!.isPaused())).toBe(false);

    await pauser.getByRole('button', { name: 'Resume' }).click();
    await expect(pauser.locator('.menus')).toBeHidden();
  });
});
