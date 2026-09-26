import { expect, test } from '@playwright/test';
import { SANDSTORM_LEAD_SECONDS } from '../../src/content/tracks/dune-canyon/scenarios';
import { loadScenario, setInput, step } from '../e2e/helpers';

// Dune Canyon (MK-58): the start grid and a moment inside the sandstorm.
test('track-dune-canyon start grid (paused)', async ({ page }) => {
  await loadScenario(page, 'track-dune-canyon', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('track-dune-canyon.png');
});

test('dune-canyon-sandstorm, 1 s into the storm (paused)', async ({ page }) => {
  await loadScenario(page, 'dune-canyon-sandstorm', { paused: true });
  await setInput(page, 0, { throttle: 1 });
  await step(page, (SANDSTORM_LEAD_SECONDS + 1) * 60);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('dune-canyon-sandstorm.png');
});
