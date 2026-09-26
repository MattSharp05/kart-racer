import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

// The hazard test track in its dusk theme (MK-49), with every hazard kind and surface.
for (const name of ['hazard-test-overview', 'hazard-crusher']) {
  test(`${name} (paused)`, async ({ page }) => {
    await loadScenario(page, name, { paused: true });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
