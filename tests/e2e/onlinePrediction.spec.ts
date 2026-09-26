import { expect, test, type Page } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import { autopilotAll, netInfo, openRoom, stepAll } from './online';

// Client prediction under lag (MK-45). Desktop projects only (online spec: playwright.config.ts).

/** The ticket's lag: 150 ms round trip, 30 ms jitter, 5 % loss. */
const NETSIM = '150,30,5';
/**
 * Ticks between checks for the client's finish on the host. Short (1 s): the client's results
 * screen covers its HUD 2.5 s after the finish, so the host must notice the finish well before that.
 */
const BATCH = 60;
/** A 1-lap race is ~62 s; give it plenty. */
const MAX_TICKS = 60 * 100;
/** Real-time stepping (see `StepAllOptions.paceMs`): 3 ticks per 50 ms. */
const REAL_TIME = { chunk: 3, paceMs: 50 };

function state(page: Page): Promise<TestState> {
  return page.evaluate(() => window.__game!.getState());
}

/** What the page's HUD shows (redrawn now: `stepAll` skips drawing). */
async function hud(page: Page) {
  await page.evaluate(() => void window.__game!.step(1));
  return {
    position: await page.locator('.hud-position').getAttribute('data-position'),
    lap: (await page.locator('.hud-lap').innerText()).replace(/\s+/g, ' ').trim(),
  };
}

test.describe('online client prediction under lag', () => {
  test("the client's HUD position and lap match the host's at the finish", async ({ browser }) => {
    test.setTimeout(150_000);
    const room = await openRoom(browser, 2, { laps: 1, netsim: NETSIM });
    const [host, client] = room.pages as [Page, Page];
    const kartId = (await netInfo(client))!.kartId;
    await autopilotAll(room.pages);

    // Race until the host has the client's kart over the line.
    let hostState = await state(host);
    for (
      let ticks = 0;
      hostState.karts[kartId]!.race.finishTick === undefined && ticks < MAX_TICKS;
      ticks += BATCH
    ) {
      await stepAll(room.pages, BATCH, REAL_TIME);
      hostState = await state(host);
    }
    expect(hostState.karts[kartId]!.race.finishTick).toBeDefined();
    // The lag is real time: keep stepping until the host's finish has reached the client.
    await expect
      .poll(
        async () => {
          await stepAll(room.pages, 6, REAL_TIME);
          return (await state(client)).karts[kartId]!.race.finishTick;
        },
        // No backoff between polls: the results screen covers the HUD 2.5 s after the finish, and
        // a busy CI runner (other online specs in parallel) can spend that in poll gaps (MK-55).
        { timeout: 20_000, intervals: [0] },
      )
      .toBe(hostState.karts[kartId]!.race.finishTick);

    hostState = await state(host);
    const place = hostState.positions.indexOf(kartId) + 1;
    const shown = await hud(client);
    expect(shown.position).toBe(String(place));
    expect(shown.lap).toBe(`LAP 1/1`);
    // The client's own standings agree with the host's for every kart finished by the newest
    // snapshot the client has (AI karts may have finished on the host since).
    const clientState = await state(client);
    const seen = (await netInfo(client))!.lastSnapshotTick;
    const finished = hostState.positions.filter(
      (id) => (hostState.karts[id]!.race.finishTick ?? Infinity) <= seen,
    );
    expect(clientState.positions.slice(0, finished.length)).toEqual(finished);
    await room.context.close();
  });

  test('?netdebug=1 shows RTT, loss, snapshot age, re-simulation and corrections', async ({
    browser,
  }) => {
    const room = await openRoom(browser, 2, { netsim: NETSIM, netdebug: true, paused: false });
    const [host, client] = room.pages as [Page, Page];
    const overlay = client.getByTestId('net-debug');
    // Pings go out every 0.5 s: wait until the RTT is measured (at least the simulated 150 ms; two
    // software-rendered pages in CI add a lot more).
    await expect(overlay).toContainText(/rtt (1[5-9]\d|[2-9]\d\d|\d{4,}) ms/, { timeout: 15_000 });
    await expect(overlay).toContainText('loss');
    await expect(overlay).toContainText(/snapshot age \d+ ms/);
    await expect(overlay).toContainText('re-sim');
    await expect(overlay).toContainText('correction');
    await expect(host.getByTestId('net-debug')).toContainText('net host');
    await expect(host.getByTestId('net-debug')).toContainText('kart 1: late inputs');
    await room.context.close();
  });
});
