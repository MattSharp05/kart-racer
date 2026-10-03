import { expect, test, type Page } from '@playwright/test';
import { loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-97: MK8 Mode's entry point. The pack is local only (ADR 0009), so these run against the
// synthetic fixture pack (`fixtures/mk8-pack/`), or against no pack at all, as on Vercel.

/** Every page request whose path is a pack file or MK8 Mode's code chunk. */
function watchMk8Requests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/mk8/') || /\/assets\/mk8-[^/]*\.js$/.test(pathname))
      seen.push(pathname);
  });
  return seen;
}

/** The page has no horizontal or vertical overflow, and `selectors` are inside the viewport. */
async function expectFits(page: Page, selectors: string[]) {
  const viewport = page.viewportSize()!;
  const scroll = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(scroll.width).toBeLessThanOrEqual(viewport.width);
  expect(scroll.height).toBeLessThanOrEqual(viewport.height);
  for (const selector of selectors) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box, selector).not.toBeNull();
    expect(box.x, selector).toBeGreaterThanOrEqual(0);
    expect(box.y, selector).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y + box.height, selector).toBeLessThanOrEqual(viewport.height + 0.5);
  }
}

test.describe('MK8 Mode loader', () => {
  test('nothing of MK8 Mode loads until it is chosen; then progress, the MK8 title, and Back', async ({
    page,
  }) => {
    const mk8 = watchMk8Requests(page);
    const pack = await servePack(page, { hold: ['audio/ui/fixture-sine.m4a'] });
    await loadScenario(page, 'menu-title');
    const button = page.locator('.menus button.mk8-mode');
    await expect(button).toBeVisible();
    await expect(button).toContainText('NEW');
    // The title, Play and the rest never touch MK8 Mode's code or pack.
    await page.waitForLoadState('networkidle');
    expect(mk8).toEqual([]);

    await button.click();
    const bar = page.getByRole('progressbar');
    await expect(bar).toBeVisible();
    // One file is held back: the bar stops part-way.
    await expect
      .poll(async () => Number(await bar.getAttribute('aria-valuenow')))
      .toBeGreaterThan(0);
    expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(100);
    pack.release();
    await expect(page.locator('.mk8-scr-title')).toBeVisible();
    expect(pack.requested.sort()).toEqual([
      'audio/ui/fixture-sine.m4a',
      'manifest.json',
      'ui/fixture-blue.webp',
      'ui/fixture-red.webp',
    ]);

    await page.locator('.mk8-title-back').click();
    await expect(page.locator('.menu-title')).toBeVisible();
    await expect(page.locator('.menus button.mk8-mode')).toBeVisible();
  });

  test('a failed file shows the error banner; Retry fetches it and opens MK8 Mode', async ({
    page,
  }) => {
    const pack = await servePack(page, { failOnce: ['ui/fixture-red.webp'] });
    await loadScenario(page, 'mk8-mode');
    const banner = page.getByRole('alert');
    await expect(banner).toContainText("Couldn't load the MK8 pack");
    await expect(banner).toContainText('ui/fixture-red.webp');
    await expect(page.locator('.menu-mk8Loading')).toBeVisible();
    await banner.getByRole('button', { name: 'Retry' }).click();
    await page.evaluate(() => window.__game!.whenReady());
    await expect(page.locator('.mk8-scr-title')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(pack.requested.filter((p) => p === 'ui/fixture-red.webp')).toHaveLength(2);
    expect(pack.requested.filter((p) => p === 'ui/fixture-blue.webp')).toHaveLength(1);
  });

  test('without a pack (CI, previews, production) MK8 Mode says how to build it', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-mode');
    const screen = page.locator('.menu-mk8NotInstalled');
    await expect(screen).toContainText('MK8 pack not installed');
    await expect(screen).toContainText('pnpm mk8:build');
    await expect(screen).toContainText('.mk8-raw/');
    await expectFits(page, ['.mk8-back', '.mk8-steps']);
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('mk8-entry: the title with MK8 Mode selected; Enter opens it', async ({ page }) => {
    await servePack(page);
    await loadScenario(page, 'mk8-entry');
    const button = page.locator('.menus button.mk8-mode');
    await expect(button).toBeFocused();
    await expectFits(page, ['.menus button.mk8-mode', '.menus button.primary']);
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.__game!.whenReady());
    await expect(page.locator('.mk8-scr-title')).toBeVisible();
  });

  test('mk8-loading: the bar held at 50 %, fitting the screen', async ({ page }) => {
    const mk8 = watchMk8Requests(page);
    await loadScenario(page, 'mk8-loading');
    const bar = page.getByRole('progressbar');
    await expect(bar).toHaveAttribute('aria-valuenow', '50');
    await expect(page.locator('.mk8-progress-percent')).toHaveText('50 %');
    await expectFits(page, ['.mk8-progress', '.mk8-back']);
    // The scenario fetches nothing from the pack.
    expect(mk8.filter((p) => p.startsWith('/mk8/') && !p.startsWith('/mk8/fonts/'))).toEqual([]);
  });

  test('mk8-not-installed shows the build steps', async ({ page }) => {
    await loadScenario(page, 'mk8-not-installed');
    await expect(page.locator('.menu-mk8NotInstalled')).toContainText('pnpm mk8:build');
    await expectFits(page, ['.mk8-back']);
  });
});
