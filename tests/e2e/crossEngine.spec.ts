import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import type { SimState } from '../../src/sim/types';
import { loadScenario } from './helpers';

/**
 * Cross-engine determinism (informational; ported from the MK-36 spike in MK-76). Online races
 * re-simulate the host's state on every client (ADR 0005), so Chromium and WebKit must step the
 * same race bit for bit. Both desktop projects run the seeded 8-kart race for 15 s and report a
 * hash of the final state: equal hashes in the two reports = identical sims.
 */
const TICKS = 900;

test.describe('cross-engine determinism (informational)', () => {
  test.beforeEach(({ isMobile }, testInfo) => {
    test.skip(isMobile || !['desktop-chrome', 'desktop-webkit'].includes(testInfo.project.name));
  });

  test('hashes the seeded 8-kart race', async ({ page, browserName }, testInfo) => {
    await loadScenario(page, 'race-full-150cc', { seed: 1, paused: true });
    const state = await page.evaluate((ticks) => {
      const game = window.__game!;
      game.setAutopilot(game.getState().localKartId, true);
      // The local kart is the session's, not the sim's: leave it out of the hash.
      const sim: Partial<TestState> = game.step(ticks, { render: false });
      delete sim.localKartId;
      return sim as SimState;
    }, TICKS);
    expect(state.tick).toBe(TICKS);
    const hash = createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16);
    const result = { hash, tick: state.tick, kart0: state.karts[0]?.position };
    console.log(`cross-engine-hash-${browserName}: ${JSON.stringify(result)}`);
    await testInfo.attach(`cross-engine-hash-${browserName}`, {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });
  });
});
