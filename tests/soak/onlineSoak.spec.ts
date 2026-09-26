import { expect, test, type Page } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import { autopilotAll, netInfo, stepAll } from '../e2e/online';
import { openBadRoom } from './room';

/**
 * The browser soak (MK-73, `pnpm test:soak`): a 4-page room (host + 3 clients + 4 AI) races a lap
 * on the `net-bad` network (200 ms RTT, 50 ms jitter, 8 % loss), 10 times in a row. Every race
 * must end with each client holding the host's final standings (what its results screen lists) and
 * the host's finish ticks and lap times (no desync), and no page may log an error. The screens
 * themselves aren't compared: in a bare `?scenario=` race a results screen opened before the final
 * standings arrive doesn't refresh (lobby races do; MK-81). CI runs the same race over loopback
 * for 10 seeds on every push (`src/net/soak*.test.ts`); this is the real-browser version, ~1–2
 * minutes a race.
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
      // The finish travels at the network's pace: step on until every page has the host's final
      // standings (Results, MK-55).
      let waiting = '';
      await expect
        .poll(
          async () => {
            await stepAll(room.pages, 6, REAL_TIME);
            const nets = await Promise.all(room.pages.map((page) => netInfo(page)));
            waiting = nets.flatMap((n) => (n?.results ? [] : [`kart ${n?.kartId}`])).join(', ');
            return waiting;
          },
          { timeout: 30_000, intervals: [0] },
        )
        .toBe('')
        .catch((error: unknown) => {
          throw new Error(`run ${run}: no final results on ${waiting}`, { cause: error });
        });

      hostState = await state(host);
      const hostNet = (await netInfo(host))!;
      for (const client of clients) {
        const clientNet = (await netInfo(client))!;
        const seen = clientNet.lastSnapshotTick;
        expect(clientNet.results, `run ${run}: a client's standings`).toEqual(hostNet.results);
        expect(finishes(await state(client), seen), `run ${run}: a client's finishes`).toEqual(
          finishes(hostState, seen),
        );
      }
      expect(errors, `run ${run}: console errors`).toEqual([]);
      const rtts = await Promise.all(clients.map((c) => netInfo(c).then((n) => n!.rttMs)));
      summary.push(
        `run ${run}: ${((Date.now() - started) / 1000).toFixed(0)} s, ` +
          `${hostNet.results?.filter((r) => r.finishTick !== undefined).length} finishers, client RTT ${rtts.map((r) => r.toFixed(0)).join('/')} ms`,
      );
      console.log(summary.at(-1));
      await context.close();
    }
    console.log(summary.join('\n'));
  });
});
