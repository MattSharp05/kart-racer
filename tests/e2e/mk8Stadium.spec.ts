import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-105: Mario Kart Stadium on the real MK8 pack. Local only (ADR 0009: CI never has the pack):
// `MK8_OUT=<pack> pnpm test:e2e tests/e2e/mk8Stadium.spec.ts`. Skipped without `MK8_OUT`.
const PACK = process.env.MK8_OUT;

/** TDD v3's per-course budgets at the grid (desktop). */
const DRAW_CALL_BUDGET = 300;
const TRIANGLE_BUDGET = 400_000;

/** Kart 0 on the autopilot until it finishes (or `maxSeconds`): its laps and the race's phase. */
function raceToFinish(page: Page, maxSeconds: number) {
  return page.evaluate((limit) => {
    const game = window.__game!;
    game.setAutopilot(0, true);
    for (let tick = 0; tick < limit * 60; tick += 60) {
      const kart = game.step(60).karts[0]!;
      if (kart.race.finishTick !== undefined) break;
    }
    const state = game.getState();
    const kart = state.karts[0]!;
    return {
      finished: kart.race.finishTick !== undefined,
      lapTimes: kart.race.lapTimes.length,
      phase: state.phase,
      respawns: game.events().filter((e) => e.type === 'respawn' && e.kartId === 0).length,
    };
  }, maxSeconds);
}

test.describe('Mario Kart Stadium on the real pack (MK-105, local only)', () => {
  test.skip(!PACK, 'needs the real MK8 pack: MK8_OUT=<pack>');
  // Real course, software GL: whole races take a minute or two.
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    await servePack(page, { dir: PACK });
  });

  test('mk8-stadium-race: within the draw and triangle budgets at the grid; the player finishes 3 laps', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-stadium-race', { paused: true });
    const state = await getState(page);
    expect(state.trackId).toBe('mk8-stadium');
    expect(state.karts).toHaveLength(8);
    await page.evaluate(() => window.__game!.step(1, { render: true }));
    const info = await page.evaluate(() => window.__game!.renderInfo());
    console.log(`Stadium at the grid: ${info.calls} draw calls, ${info.triangles} triangles`);
    expect(info.calls).toBeLessThan(DRAW_CALL_BUDGET);
    expect(info.triangles).toBeLessThan(TRIANGLE_BUDGET);
    expect(await raceToFinish(page, 240)).toEqual({
      finished: true,
      lapTimes: 3,
      phase: 'finished',
      respawns: 0,
    });
  });

  test('the Mushroom Cup in MK8 Mode’s cup select starts a race on Mario Kart Stadium', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-cup');
    await expect(page.locator('.mk8-scr-cup .mk8-cup-tile').first()).toHaveAttribute(
      'aria-current',
      'true',
    );
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8')).toHaveCount(0, { timeout: 60_000 });
    const state = await getState(page);
    expect(state.trackId).toBe('mk8-stadium');
    expect(state.phase).toBe('countdown');
  });

  test('the whole flow: title → Grand Prix → character → kart builder → 150cc → Mushroom Cup races on Stadium', async ({
    page,
  }) => {
    const settled = async (n: number) => {
      await expect(page.locator('.mk8')).toHaveAttribute('data-depth', String(n));
      await expect(page.locator('.mk8')).toHaveAttribute('data-transitioning', 'false');
    };
    await loadScenario(page, 'mk8-ui-title');
    await settled(1);
    // Title → mode select → character select → kart builder → engine class → cup select.
    for (const [depth, screen] of [
      [2, '.mk8-scr-modes'],
      [3, '.mk8-scr-char'],
      [4, '.mk8-scr-kart'],
      [5, '.mk8-scr-cc'],
      [6, '.mk8-scr-cup'],
    ] as const) {
      await page.keyboard.press('Enter');
      await settled(depth);
      await expect(page.locator(screen)).toBeVisible();
    }
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8')).toHaveCount(0, { timeout: 60_000 });
    const state = await getState(page);
    expect(state.trackId).toBe('mk8-stadium');
    expect(state.phase).toBe('countdown');
    expect(state.karts).toHaveLength(8);
  });

  test('mk8-stadium-final-lap: one more time over the line finishes the race', async ({ page }) => {
    await loadScenario(page, 'mk8-stadium-final-lap', { paused: true });
    const before = await getState(page);
    expect(before.karts[0]?.race.lap).toBe(3);
    expect(before.phase).toBe('racing');
    expect(await raceToFinish(page, 60)).toMatchObject({ finished: true, lapTimes: 3 });
  });

  test('mk8-stadium-antigrav: up the bridge onto the anti-gravity road', async ({ page }) => {
    await loadScenario(page, 'mk8-stadium-antigrav', { paused: true });
    const antigrav = await page.evaluate(() => {
      const game = window.__game!;
      game.setAutopilot(0, true);
      let seen = false;
      for (let i = 0; i < 20 && !seen; i += 1) seen = game.step(30).karts[0]!.antigrav === true;
      return seen;
    });
    expect(antigrav).toBe(true);
  });
});
