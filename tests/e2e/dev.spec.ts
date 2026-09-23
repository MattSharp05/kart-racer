import { expect, test } from '@playwright/test';

test.describe('/dev scenario index', () => {
  test('lists every scenario with a working link and a QR code', async ({ page }) => {
    await page.goto('/dev.html');
    for (const name of ['empty', 'moving']) {
      const item = page.locator(`[data-scenario="${name}"]`);
      await expect(item.getByRole('link', { name })).toHaveAttribute(
        'href',
        new RegExp(`\\?scenario=${name}$`),
      );
      await expect(item.getByRole('img')).toHaveAttribute('src', /api\.qrserver\.com/);
    }
  });

  test('a scenario link opens the game in that scenario', async ({ page }) => {
    await page.goto('/dev.html');
    await page.getByRole('link', { name: 'moving' }).click();
    await page.waitForFunction(() => window.__game?.ready === true);
    expect(await page.evaluate(() => window.__game!.scenario)).toBe('moving');
  });

  test('has no horizontal overflow', async ({ page }) => {
    await page.goto('/dev.html');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test('/dev has no horizontal overflow at 375 px wide', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/dev.html');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
