import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

// The top-down overviews (MK-79/MK-90; sunny-overview is in sunny.visual.spec.ts) and the oval.
for (const name of [
  'oval-overview',
  'oval-start',
  'hazard-test-overview',
  'canopy-overview',
  'cog-works-overview',
  'dune-canyon-overview',
  'frostpeak-overview',
  'neon-harbour-overview',
]) {
  test(`${name} (paused)`, async ({ page }) => {
    await loadScenario(page, name, { paused: true });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
