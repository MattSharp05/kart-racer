import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

// MK-56: the leaderboards on the mock backend's boards (the scenarios turn the mock on).
for (const [name, state] of [
  ['leaderboard', 'board'],
  ['leaderboard-empty', 'empty'],
] as const) {
  test(`${name} (paused)`, async ({ page }) => {
    await loadScenario(page, name, { paused: true });
    await expect(page.locator('.leaderboard-body')).toHaveAttribute('data-state', state);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
