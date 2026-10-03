import { expect, test, type Page } from '@playwright/test';

// MK-125: an MK8 course's look at the start line, full and low quality, plus its water and boost
// motion blur. On the look ramp, the synthetic test ramp (no pack in CI, ADR 0009); Mario Kart
// Stadium's start line is checked locally with the pack. Bloom is slow in software GL: the frames
// take a while to settle.
async function open(page: Page, scenario: string, extra = '') {
  await page.goto(`/?scenario=${scenario}&paused=1${extra}`);
  await page.waitForFunction(() => window.__game?.ready === true);
  await page.evaluate(() => window.__game!.whenReady());
  await page.evaluate(() => window.__game!.step(2, { render: true }));
}

test('mk8-test-look-start, full quality (paused)', async ({ page }) => {
  await open(page, 'mk8-test-look-start');
  await expect(page).toHaveScreenshot('mk8-look-start-full.png', { timeout: 30_000 });
});

test('mk8-test-look-start, low quality (paused)', async ({ page }) => {
  await open(page, 'mk8-test-look-start', '&quality=low');
  await expect(page).toHaveScreenshot('mk8-look-start-low.png', { timeout: 30_000 });
});

test('mk8-test-look-water (paused)', async ({ page }) => {
  await open(page, 'mk8-test-look-water');
  await expect(page).toHaveScreenshot('mk8-look-water.png', { timeout: 30_000 });
});

test('mk8-test-look-boost (paused)', async ({ page }) => {
  await open(page, 'mk8-test-look-boost');
  await expect(page).toHaveScreenshot('mk8-look-boost.png', { timeout: 30_000 });
});
