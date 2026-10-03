import { expect, test, type Page } from '@playwright/test';
import { loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-135: on the site the MK8 pack is behind a server-checked password (ADR 0009 as amended).
// `servePack({ password })` runs the real gate and login handlers from `api/` on the fixture pack.

const PASSWORD = 'let-me-race';
const FIXTURE_FILES = [
  'manifest.json',
  'ui/fixture-blue.webp',
  'ui/fixture-red.webp',
  'audio/ui/fixture-sine.m4a',
  'models/items/banana.glb',
];

/** Fetches pack URLs from the page (same origin, its cookies): status and body length. */
function fetchFromPage(page: Page, paths: string[]) {
  return page.evaluate(async (list) => {
    const out: [string, number, number][] = [];
    for (const path of list) {
      const response = await fetch(`/mk8/${path}`);
      out.push([path, response.status, (await response.arrayBuffer()).byteLength]);
    }
    return out;
  }, paths);
}

test.describe('MK8 pack password (MK-135)', () => {
  test('without the cookie every pack URL is 401 with no body, and MK8 Mode asks for the password', async ({
    page,
  }) => {
    const pack = await servePack(page, { password: PASSWORD });
    await loadScenario(page, 'mk8-mode');
    await expect(page.locator('.mk8-scr-password')).toBeVisible();
    await expect(page.getByLabel('Enter the password to play MK8 Mode')).toBeVisible();
    // Only the manifest was tried, and refused.
    expect(pack.requested).toEqual(['manifest.json (401)']);
    for (const [path, status, bytes] of await fetchFromPage(page, FIXTURE_FILES)) {
      expect(status, path).toBe(401);
      expect(bytes, path).toBe(0);
    }
    // The shipped OFL font stays public.
    const font = await page.evaluate(async () => (await fetch('/mk8/fonts/fonts.css')).status);
    expect(font).toBe(200);
  });

  test('a wrong password shows an error; the right one sets the cookie and loads the pack', async ({
    page,
    context,
  }) => {
    const pack = await servePack(page, { password: PASSWORD });
    await loadScenario(page, 'mk8-mode');
    const field = page.getByLabel('Enter the password to play MK8 Mode');
    await field.fill('not-it');
    await page.locator('.mk8-password-ok').click();
    await expect(page.locator('.mk8-password-error')).toHaveText('Wrong password. Try again.');
    expect(await context.cookies()).toEqual([]);

    await field.fill(PASSWORD);
    await field.press('Enter');
    await expect(page.locator('.menu-mk8Placeholder')).toBeVisible();
    const [cookie] = await context.cookies();
    expect(cookie?.name).toBe('mk8_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    // The page's script can't read it.
    expect(await page.evaluate(() => document.cookie)).not.toContain('mk8_session');
    expect(pack.requested.filter((p) => !p.endsWith('(401)')).sort()).toEqual([
      'audio/ui/fixture-sine.m4a',
      'manifest.json',
      'ui/fixture-blue.webp',
      'ui/fixture-red.webp',
    ]);
    // With the cookie the files come through.
    for (const [path, status, bytes] of await fetchFromPage(page, FIXTURE_FILES)) {
      expect(status, path).toBe(200);
      expect(bytes, path).toBeGreaterThan(0);
    }
  });

  test('the mk8-password scenario: the box fits, Escape goes back to the title', async ({
    page,
  }) => {
    await servePack(page, { password: PASSWORD });
    await loadScenario(page, 'mk8-password');
    const viewport = page.viewportSize()!;
    for (const selector of ['.mk8-password-input', '.mk8-password-ok', '.mk8-hint-b']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box, selector).not.toBeNull();
      expect(box.y + box.height, selector).toBeLessThanOrEqual(viewport.height + 0.5);
      expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width + 0.5);
    }
    await page.locator('.mk8-password-input').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-title')).toBeVisible();
  });
});
