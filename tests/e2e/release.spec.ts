import { expect, test } from '@playwright/test';
import { getState, loadScenario, step } from './helpers';

const FULL_RACE = ['desktop-chrome', 'pixel-landscape'];

test.describe('MVP release check (MK-28)', () => {
  test('a full auto-driven 100cc race finishes 3 laps with no console errors', async ({
    page,
  }, info) => {
    test.skip(!FULL_RACE.includes(info.project.name), 'full race runs on desktop-chrome + pixel');
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'race-full-100cc', { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    let state = await getState(page);
    for (let i = 0; i < 20 && state.karts[0]!.race.finishTick === undefined; i += 1) {
      state = await step(page, 900);
    }
    expect(state.karts[0]!.race.finishTick).toBeDefined();
    expect(state.karts[0]!.race.lapTimes).toHaveLength(3);
    await expect(page.locator('.menu-results')).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test('race-full-100cc mid-race stays within 150 draw calls and 150k triangles', async ({
    page,
  }) => {
    await loadScenario(page, 'race-full-100cc', { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    await step(page, 600);
    // Let a real frame draw so renderer.info describes the race.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const info = await page.evaluate(() => window.__game!.renderInfo());
    expect(info.calls).toBeLessThanOrEqual(150);
    expect(info.triangles).toBeLessThanOrEqual(150_000);
  });

  test('?perf=1 shows the performance overlay', async ({ page }) => {
    await page.goto('/?scenario=race-full-100cc&perf=1');
    await page.waitForFunction(() => window.__game?.ready === true);
    await expect(page.locator('.perf-overlay')).toContainText('fps');
    await expect(page.locator('.perf-overlay')).toContainText('draw calls');
  });
});
