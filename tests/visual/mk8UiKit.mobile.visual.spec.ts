import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

// MK-104: the MK8 UI kit's style guide on a phone (no pack: stand-in tiles).
test('mk8-ui-kit on phones (paused)', async ({ page }, info) => {
  await loadScenario(page, 'mk8-ui-kit', { paused: true });
  await expect(page.locator('.mk8')).toHaveAttribute('data-depth', '1');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot(`mk8-ui-kit-${info.project.name}.png`);
});

test('mk8-ui-kit character grid on phones (paused)', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loadScenario(page, 'mk8-ui-kit', { paused: true });
  await page.keyboard.press('Enter');
  await expect(page.locator('.mk8')).toHaveAttribute('data-depth', '2');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot(`mk8-ui-kit-characters-${info.project.name}.png`);
});
