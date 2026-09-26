import { expect, test, type Page } from '@playwright/test';

/**
 * The room's results screen (MK-55) from the `online-results` scenario: no network, so it runs on
 * every project, phones included. The full online flow is `onlineFlow.spec.ts`.
 */

async function open(page: Page, role: 'host' | 'client'): Promise<void> {
  await page.goto(`/?scenario=online-results&net=local&role=${role}&paused=1`);
  await page.waitForFunction(() => window.__game?.ready === true);
  await expect(page.locator('.menu-onlineResults')).toBeVisible();
}

test('the host sees all 8 karts, the people highlighted, and picks what is next', async ({
  page,
}) => {
  await open(page, 'host');
  const rows = page.locator('.online-results li');
  await expect(rows).toHaveCount(8);
  await expect(page.locator('.online-results li.human')).toHaveCount(4);
  await expect(page.locator('.online-results li.you')).toContainText('Maya (you)');
  await expect(page.getByRole('heading', { name: 'You finished 2nd!' })).toBeVisible();
  await expect(rows.first()).toContainText('Bob');
  await expect(rows.first()).toContainText('Boulder');
  await expect(rows.last()).toContainText('—');
  await expect(page.getByRole('button', { name: 'Race again' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Next track' })).toBeEnabled();
  // No leaderboard screen yet: no button for it.
  await expect(page.getByRole('button', { name: 'View leaderboard' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.locator('.menu-title')).toBeVisible();
});

test('everyone else waits for the host', async ({ page }) => {
  await open(page, 'client');
  await expect(page.locator('.online-results-status')).toHaveText('Waiting for host…');
  await expect(page.getByRole('button', { name: 'Race again' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible();
});

test.describe('on a small phone', () => {
  test.use({ viewport: { width: 667, height: 375 } });

  for (const role of ['host', 'client'] as const) {
    test(`the results fit 667×375 (${role}), buttons at least 44 px`, async ({ page }) => {
      await open(page, role);
      const result = await page.locator('.menu-panel').evaluate((el) => {
        const r = el.getBoundingClientRect();
        const small = [...el.querySelectorAll('button')]
          .map((b) => b.getBoundingClientRect())
          .filter((b) => b.width > 0 && (b.width < 44 || b.height < 44));
        return {
          inside: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
          scrolls:
            el.scrollHeight > el.clientHeight + 1 ||
            document.documentElement.scrollHeight > innerHeight + 1,
          small: small.length,
        };
      });
      expect(result).toEqual({ inside: true, scrolls: false, small: 0 });
    });
  }
});
