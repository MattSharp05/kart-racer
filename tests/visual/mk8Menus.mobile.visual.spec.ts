import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

// MK-116: MK8 Mode's title and mode select on a phone (no pack: our wordmark and stand-ins).
// MK-119: the engine class and the cup/course select. MK-118: the kart builder.
for (const [name, depth] of [
  ['mk8-ui-title', '1'],
  ['mk8-ui-mode', '2'],
  ['mk8-ui-kart', '4'],
  ['mk8-ui-cc', '5'],
  ['mk8-ui-cup', '6'],
  ['mk8-ui-course', '6'],
] as const) {
  test(`${name} on phones (paused)`, async ({ page }, info) => {
    await loadScenario(page, name, { paused: true });
    await expect(page.locator('.mk8')).toHaveAttribute('data-depth', depth);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}-${info.project.name}.png`);
  });
}
