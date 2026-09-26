import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';

// Neon Harbour (MK-60): the start grid, and the city block with oncoming traffic.
test('track-neon-harbour start grid (paused)', async ({ page }) => {
  await loadScenario(page, 'track-neon-harbour', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('track-neon-harbour.png');
});

test('neon-harbour-traffic, a car coming down the city street (paused)', async ({ page }) => {
  await loadScenario(page, 'neon-harbour-traffic', { paused: true });
  await setInput(page, 0, { throttle: 1 });
  await step(page, 60);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('neon-harbour-traffic.png');
});
