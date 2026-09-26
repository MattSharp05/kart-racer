import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';

// Frostpeak Pass (MK-59): the start grid and the frozen lake.
test('track-frostpeak-pass start grid (paused)', async ({ page }) => {
  await loadScenario(page, 'track-frostpeak-pass', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('track-frostpeak-pass.png');
});

test('frostpeak-ice, out on the frozen lake (paused)', async ({ page }) => {
  await loadScenario(page, 'frostpeak-ice', { paused: true });
  await setInput(page, 0, { throttle: 1 });
  await step(page, 120);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('frostpeak-ice.png');
});
