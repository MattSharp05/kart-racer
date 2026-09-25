import { expect, test, type Page } from '@playwright/test';
import { loadScenario } from './helpers';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function storedSettings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('kart-racer:settings') ?? '{}'));
}

/** Seeds a saved profile before the page loads. */
async function withProfile(page: Page, nickname: string, colour: string) {
  await page.addInitScript(
    ([n, c]) =>
      localStorage.setItem(
        'kart-racer:settings',
        JSON.stringify({ version: 1, nickname: n, colour: c, deviceId: 'device-1' }),
      ),
    [nickname, colour] as const,
  );
}

test.describe('nickname and colour (MK-42)', () => {
  test('first launch: Matt + blue goes to the title, and a reload skips the screen', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.ready === true);
    await expect(page.locator('.menu-nickname')).toBeVisible();
    await expect(page.locator('.menu-title')).toHaveCount(0);
    await expect(page.locator('.nickname-swatches .swatch')).toHaveCount(8);

    await page.locator('.nickname-input').fill('Matt');
    await page.getByRole('radio', { name: 'Blue' }).click();
    await expect(page.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true');
    await page.locator('.menu-nickname button.primary').click();

    await expect(page.locator('.menu-title')).toBeVisible();
    // Still the first visit: the controls guide follows.
    await page.locator('.how-to-play button').click();
    await expect(page.locator('.name-chip')).toContainText('Matt');
    const settings = await storedSettings(page);
    expect(settings).toMatchObject({ nickname: 'Matt', colour: 'blue' });
    expect(settings.deviceId).toMatch(UUID);

    await page.reload();
    await page.waitForFunction(() => window.__game?.ready === true);
    await expect(page.locator('.menu-title')).toBeVisible();
    await expect(page.locator('.menu-nickname')).toHaveCount(0);
    await expect(page.locator('.name-chip')).toContainText('Matt');
    // The device id is generated once.
    expect((await storedSettings(page)).deviceId).toBe(settings.deviceId);
  });

  test('bad names show a friendly message and stay on the screen', async ({ page }) => {
    await loadScenario(page, 'first-launch');
    const input = page.locator('.nickname-input');
    const go = page.locator('.menu-nickname button.primary');
    const error = page.locator('.nickname-error');
    for (const [name, message] of [
      ['M', 'at least 2'],
      ['Matt!', 'letters, numbers'],
      ['sh1t', 'friendly'],
    ] as const) {
      await input.fill(name);
      await go.click();
      await expect(error).toContainText(message);
      await expect(page.locator('.menu-nickname')).toBeVisible();
    }
    await input.fill('  Matt  ');
    await expect(error).toBeEmpty();
    await input.press('Enter');
    await expect(page.locator('.menu-title')).toBeVisible();
    expect(await storedSettings(page)).toMatchObject({ nickname: 'Matt' });
  });

  test('typing a name with game keys (W A S D, M) types them and does not mute', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop-chrome' && info.project.name !== 'desktop-webkit');
    await loadScenario(page, 'first-launch');
    const input = page.locator('.nickname-input');
    await input.click();
    await page.keyboard.type('Swamp Dad');
    await expect(input).toHaveValue('Swamp Dad');
    expect((await storedSettings(page)).muted).toBe(false);
  });

  test('the name chip on the title edits the name; Back keeps the old one', async ({ page }) => {
    await withProfile(page, 'Matt', 'blue');
    await loadScenario(page, 'menu-title');
    const chip = page.locator('.name-chip');
    await expect(chip).toContainText('Matt');

    await chip.click();
    await expect(page.locator('.nickname-input')).toHaveValue('Matt');
    await expect(page.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true');
    await page.locator('.nickname-input').fill('Ed');
    await page.locator('.menu-nickname button', { hasText: 'Back' }).click();
    await expect(chip).toContainText('Matt');

    await chip.click();
    await page.locator('.nickname-input').fill('Ed');
    await page.getByRole('radio', { name: 'Green' }).click();
    await page.locator('.menu-nickname button', { hasText: 'Save' }).click();
    await expect(chip).toContainText('Ed');
    expect(await storedSettings(page)).toMatchObject({
      nickname: 'Ed',
      colour: 'green',
      deviceId: 'device-1',
    });
  });

  test('the first-launch scenario clears the saved name but keeps the device id', async ({
    page,
  }) => {
    await withProfile(page, 'Matt', 'blue');
    await loadScenario(page, 'first-launch');
    await expect(page.locator('.nickname-input')).toHaveValue('');
    expect(await storedSettings(page)).toMatchObject({ nickname: '', deviceId: 'device-1' });
  });

  test('fits a 667×375 phone, and the field stays visible with the keyboard open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await loadScenario(page, 'first-launch', { paused: true });
    const panel = page.locator('.menu-nickname');
    const input = page.locator('.nickname-input');
    await expect(panel).toBeVisible();
    const fits = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const small = [...el.querySelectorAll('button')]
        .map((b) => b.getBoundingClientRect())
        .filter((b) => b.width < 44 || b.height < 44);
      return {
        inside: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
        scrolls: el.scrollHeight > el.clientHeight + 1,
        small: small.length,
      };
    });
    expect(fits).toEqual({ inside: true, scrolls: false, small: 0 });

    // A landscape phone keyboard leaves roughly the top 40% of the screen.
    await input.focus();
    await page.setViewportSize({ width: 667, height: 150 });
    await expect
      .poll(() =>
        input.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight;
        }),
      )
      .toBe(true);
  });
});
