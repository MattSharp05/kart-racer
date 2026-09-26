import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';

// Cog Works (MK-62): the start grid, and the crusher gauntlet with the first piston's lamps lit.
test('track-cog-works start grid (paused)', async ({ page }) => {
  await loadScenario(page, 'track-cog-works', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('track-cog-works.png');
});

test('cog-works-crushers, the gauntlet as the first piston warns (paused)', async ({ page }) => {
  await loadScenario(page, 'cog-works-crushers', { paused: true });
  await setInput(page, 0, { throttle: 1 });
  await step(page, 60);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('cog-works-crushers.png');
});
