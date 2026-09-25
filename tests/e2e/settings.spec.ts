import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario } from './helpers';

const soundField = (page: Page) => page.locator('.menu-settings .sound-setting');

test.describe('settings screen (MK-43)', () => {
  test('title → Settings → mute → Back; mute survives a reload and matches the pause menu', async ({
    page,
  }) => {
    await loadScenario(page, 'menu-title');
    await page.locator('.menu-title button', { hasText: 'Settings' }).click();
    await expect(page.locator('.menu-settings')).toBeVisible();
    await expect(soundField(page)).toHaveAttribute('data-muted', 'false');
    await soundField(page).getByRole('button', { name: /Off/ }).click();
    await expect(soundField(page)).toHaveAttribute('data-muted', 'true');
    await expect(soundField(page).getByRole('button', { name: /Off/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Saved straight away, in the versioned settings object.
    const stored = await page.evaluate(() => localStorage.getItem('kart-racer:settings'));
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ version: 1, muted: true });
    await page.locator('.menu-settings button', { hasText: 'Back' }).click();
    await expect(page.locator('.menu-title')).toBeVisible();

    await page.reload();
    await page.waitForFunction(() => window.__game?.ready === true);
    await page.locator('.menu-title button', { hasText: 'Settings' }).click();
    await expect(soundField(page)).toHaveAttribute('data-muted', 'true');

    // The in-race mute button (pause menu) shows the same state.
    await loadScenario(page, 'menu-paused');
    await expect(page.locator('.menu-paused .sound-toggle')).toHaveAttribute('data-muted', 'true');
  });

  test('pause → Settings → Back returns to the paused race', async ({ page }) => {
    await loadScenario(page, 'menu-paused');
    const tick = (await getState(page)).tick;
    await page.locator('.menu-paused button', { hasText: 'Settings' }).click();
    await expect(page.locator('.menu-settings')).toBeVisible();
    expect(await page.evaluate(() => window.__game!.isPaused())).toBe(true);
    await page.locator('.menu-settings button', { hasText: 'Back' }).click();
    await expect(page.locator('.menu-paused')).toBeVisible();
    expect(await page.evaluate(() => window.__game!.isPaused())).toBe(true);
    expect((await getState(page)).tick).toBe(tick);
    // Still a working pause menu.
    await page.locator('.menu-paused button', { hasText: 'Resume' }).click();
    await expect(page.locator('.menus .menu-panel')).toHaveCount(0);
    expect(await page.evaluate(() => window.__game!.isPaused())).toBe(false);
  });

  test('Esc goes back, and the M key updates the sound setting', async ({ page }, info) => {
    test.skip(!info.project.name.startsWith('desktop'), 'keyboard');
    await loadScenario(page, 'settings');
    await expect(soundField(page)).toHaveAttribute('data-muted', 'false');
    await page.keyboard.press('m');
    await expect(soundField(page)).toHaveAttribute('data-muted', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('Profile shows the saved nickname; no nickname, no Profile', async ({ page }) => {
    await loadScenario(page, 'settings');
    await expect(page.locator('.settings-group[data-group="sound"]')).toBeVisible();
    await expect(page.locator('.settings-group[data-group="profile"]')).toHaveCount(0);
    await page.evaluate(() =>
      localStorage.setItem(
        'kart-racer:settings',
        JSON.stringify({ version: 1, muted: false, nickname: 'Matt', colour: 'blue' }),
      ),
    );
    await page.reload();
    await page.waitForFunction(() => window.__game?.ready === true);
    await expect(page.locator('.settings-profile')).toContainText('Matt');
  });

  test('fits 667×375 with 44 px targets, and scrolls inside the panel when short', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await loadScenario(page, 'settings', { paused: true });
    const panel = page.locator('.menu-settings');
    const measure = () =>
      panel.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const body = el.querySelector('.settings-body')!;
        const back = el.querySelector('.settings-back')!.getBoundingClientRect();
        const small = [...el.querySelectorAll('button')]
          .map((b) => b.getBoundingClientRect())
          .filter((b) => b.width > 0 && (b.width < 44 || b.height < 44));
        return {
          inside: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
          backInView: back.top >= 0 && back.bottom <= innerHeight,
          bodyScrolls: body.scrollHeight > body.clientHeight + 1,
          small: small.length,
        };
      });
    await expect(panel).toBeVisible();
    expect(await measure()).toEqual({
      inside: true,
      backInView: true,
      bodyScrolls: false,
      small: 0,
    });

    // More sections than fit (simulated with a very short screen): the groups scroll, Back stays.
    await page.setViewportSize({ width: 667, height: 200 });
    await expect.poll(async () => (await measure()).inside).toBe(true);
    const short = await measure();
    expect(short).toMatchObject({ inside: true, backInView: true, bodyScrolls: true });
  });
});
