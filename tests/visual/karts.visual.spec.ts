import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

test('kart lineup (paused)', async ({ page }) => {
  await loadScenario(page, 'kart-lineup', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('kart-lineup.png');
});

// MK-63: the new racers on the racer select's turntable (paused: the showcase angle).
for (const id of ['sprocket', 'juniper', 'blaze']) {
  test(`racer preview: ${id} (paused)`, async ({ page }) => {
    await loadScenario(page, `racer-preview-${id}`, { paused: true });
    await expect(page.locator('.racer-picker')).toHaveAttribute('data-racer', id);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`racer-preview-${id}.png`);
  });
}
