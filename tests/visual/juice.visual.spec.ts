import { expect, test } from '@playwright/test';
import { step } from '../e2e/helpers';

for (const name of ['juice-boost', 'juice-hit']) {
  test(`${name} (paused)`, async ({ page }) => {
    // Reduced motion so the (random-looking) shake doesn't move the frame between runs.
    await page.goto(`/?scenario=${name}&paused=1&reduced-motion=1`);
    await page.waitForFunction(() => window.__game?.ready === true);
    await step(page, 6);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
