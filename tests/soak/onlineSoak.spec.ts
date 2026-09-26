import { expect, test, type Page } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import { autopilotAll, netInfo, stepAll } from '../e2e/online';
import { openBadRoom } from './room';

/**
 * The browser soak (MK-73, `pnpm test:soak`): a 4-page room (host + 3 clients + 4 AI) races a lap
 * on the `net-bad` network (200 ms RTT, 50 ms jitter, 8 % loss), 10 times in a row. Every race
 * must end with each client showing the host's finish ticks, lap times and room results (no
 * desync), and no page may log an error. CI runs the same race over loopback for 10 seeds on every
 * push (`src/net/soak*.test.ts`); this is the real-browser version, ~2 minutes a race.
 */

const RUNS = Number(process.env.SOAK_RUNS ?? 10);
const NET_BAD = '200,50,8';
/** Real speed (the network lag is real time): 3 ticks per 50 ms. */
const REAL_TIME = { chunk: 3, paceMs: 50 };
const BATCH = 300;
/** A 1-lap race is ~62 s; give it plenty. */
const MAX_TICKS = 60 * 150;

function state(page: Page): Promise<TestState> {
  return page.evaluate(() => window.__game!.getState());
}

/** Each finished kart's finish tick and lap times, by kart id. */
function finishes(s: TestState, upToTick = Infinity) {
  return s.karts
    .filter((k) => k.race.finishTick !== undefined && k.race.finishTick <= upToTick)
    .map((k) => ({ kartId: k.id, finishTick: k.race.finishTick, lapTimes: k.race.lapTimes }));
}

/** The room results' finished rows (with a time, MK-55), without the "(you)" marker. */
async function resultRows(page: Page): Promise<string[]> {
  const rows = page.locator('ol.online-results[data-final="true"] li');
  const texts = await rows.allInnerTexts();
  return texts
    .map((text) => text.replace(' (you)', '').replace(/\s+/g, ' ').trim())
    .filter((text) => !text.includes('—'));
}

test.describe('online soak at net-bad (MK-73)', () => {
  test(`${RUNS} 4-player races end with the same results on every page`, async ({ browser }) => {
    test.setTimeout(RUNS * 300_000);
    const summary: string[] = [];
    for (let run = 1; run <= RUNS; run += 1) {
      const started = Date.now();
      const context = await browser.newContext();
      const errors: string[] = [];
      context.on('page', (page) => {
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(`${m.text()}`);
        });
        page.on('pageerror', (e) => errors.push(e.message));
      });
      const room = await openBadRoom(context, 4, `soak-${Date.now()}-${run}`, {
        scenario: 'online-race-4p',
        laps: 1,
        netsim: NET_BAD,
      });
      const [host, ...clients] = room.pages as [Page, ...Page[]];
      await autopilotAll(room.pages);

      let hostState = await state(host);
      for (let t = 0; hostState.phase !== 'finished' && t < MAX_TICKS; t += BATCH) {
        await stepAll(room.pages, BATCH, REAL_TIME);
        hostState = await state(host);
      }
      expect(hostState.phase, `run ${run}: the race finished`).toBe('finished');
      // The finish travels at the network's pace: step on until every client has it and shows
      // the room's results.
      for (const client of clients) {
        await expect
          .poll(
            async () => {
              await stepAll(room.pages, 6, REAL_TIME);
              return (await resultRows(client)).length > 0;
            },
            { timeout: 30_000, intervals: [0] },
          )
          .toBe(true);
      }

      hostState = await state(host);
      const hostRows = await resultRows(host);
      for (const client of clients) {
        const seen = (await netInfo(client))!.lastSnapshotTick;
        const clientState = await state(client);
        expect(finishes(clientState, seen), `run ${run}: a client's finishes`).toEqual(
          finishes(hostState, seen),
        );
        expect(await resultRows(client), `run ${run}: a client's results`).toEqual(hostRows);
      }
      expect(errors, `run ${run}: console errors`).toEqual([]);
      const rtts = await Promise.all(clients.map((c) => netInfo(c).then((n) => n!.rttMs)));
      summary.push(
        `run ${run}: ${((Date.now() - started) / 1000).toFixed(0)} s, ${hostRows.length} ` +
          `finishers, client RTT ${rtts.map((r) => r.toFixed(0)).join('/')} ms`,
      );
      console.log(summary.at(-1));
      await context.close();
    }
    console.log(summary.join('\n'));
  });
});
