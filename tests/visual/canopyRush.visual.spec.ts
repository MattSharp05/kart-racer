import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';

// Canopy Rush (MK-61): the start grid, out on a swaying rope bridge, and (QA round 3) the trail
// look on the road with a tapir and her calf crossing it.
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

test('canopy-animals-road-tapir, a tapir and calf crossing the trail (paused)', async ({
  page,
}) => {
  await loadScenario(page, 'canopy-animals-road-tapir', { paused: true });
  await page.evaluate(() => window.__game!.setAutopilot(0, true));
  await step(page, 100);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('canopy-animals-road-tapir.png');
});
