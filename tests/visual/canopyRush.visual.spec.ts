import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';

// Canopy Rush (MK-61): the start grid, and out on a swaying rope bridge.
test('track-canopy-rush start grid (paused)', async ({ page }) => {
  await loadScenario(page, 'track-canopy-rush', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('track-canopy-rush.png');
});

test('canopy-bridge, on the swaying rope bridge (paused)', async ({ page }) => {
  await loadScenario(page, 'canopy-bridge', { paused: true });
  await setInput(page, 0, { throttle: 1 });
  await step(page, 60);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('canopy-bridge.png');
});
