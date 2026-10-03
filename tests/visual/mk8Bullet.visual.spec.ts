import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

const frame = (page: import('@playwright/test').Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

// MK-120: Bullet Bill mid-ride on the MK8 test ramp, drawn in place of the player's kart. No pack
// in CI (ADR 0009), so this is the stand-in bullet; the pack's model is checked locally.
test('mk8-item-bullet-ride (paused)', async ({ page }) => {
  await loadScenario(page, 'mk8-item-bullet-ride', { paused: true });
  await frame(page);
  await frame(page);
  await expect(page).toHaveScreenshot('mk8-item-bullet-ride.png');
});
