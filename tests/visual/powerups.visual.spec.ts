import { expect, test } from '@playwright/test';
import { loadScenario, step } from '../e2e/helpers';

for (const name of ['star-active', 'lightning-shrunk']) {
  test(`${name} (paused)`, async ({ page }) => {
    await loadScenario(page, name, { paused: true });
    // A few ticks so the shrink animation has settled.
    await step(page, 30);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
