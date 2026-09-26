import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

// MK-56: the leaderboard on a phone: the list scrolls, your row stays pinned under it.
test('leaderboard on phones (paused)', async ({ page }, info) => {
  await loadScenario(page, 'leaderboard', { paused: true });
  await expect(page.locator('.leaderboard-body')).toHaveAttribute('data-state', 'board');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot(`leaderboard-${info.project.name}.png`);
});
