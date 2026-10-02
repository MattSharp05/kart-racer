import { expect, test } from '@playwright/test';
import { SPRITES } from '../../src/mk8/ui/sprites';

// MK-95: the sprite QA page lists every sprite. CI has no MK8 assets, so every tile shows as missing.
test('the MK8 sprite page lists every sprite with its id', async ({ page }) => {
  await page.goto('/dev/mk8-sprites.html');
  const tiles = page.locator('.sprite');
  await expect(tiles).toHaveCount(Object.keys(SPRITES).length);
  await expect(page.locator('[data-sprite="c_mario"] figcaption')).toContainText('c_mario 128×128');
  await expect(page.locator('[data-sprite="i_banana"] figcaption')).toContainText('keyed');
  await expect(page.locator('[data-sprite="c_mario"]')).toHaveClass(/missing/);
});
