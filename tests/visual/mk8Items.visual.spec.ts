import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';
import { servePack } from '../e2e/mk8';

const frame = (page: import('@playwright/test').Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

// MK-103: every reskinned MK8 item drawn with its pack model. CI has only the synthetic fixture
// pack (ADR 0009), so the baseline shows its stand-in shapes; the real models are checked locally.
test('mk8-items-lineup (paused)', async ({ page }) => {
  await servePack(page);
  await loadScenario(page, 'mk8-items-lineup', { paused: true });
  await frame(page);
  await frame(page);
  await expect(page).toHaveScreenshot('mk8-items-lineup.png');
});
