import { expect, test } from '@playwright/test';

test('mute toggles, is remembered after reload, and loading logs no audio errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scenario=menu-paused');
  await page.waitForFunction(() => window.__game?.ready === true);
  // The pause menu keeps the in-race mute button (Settings holds the other one since MK-43).
  const toggle = page.locator('.menu-paused .sound-toggle');
  await expect(toggle).toHaveAttribute('data-muted', 'false');
  await toggle.click(); // also the first gesture: audio starts here
  await expect(toggle).toHaveAttribute('data-muted', 'true');
  // Settings are one versioned object since MK-37.
  const stored = await page.evaluate(() => localStorage.getItem('kart-racer:settings'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ version: 1, muted: true });

  await page.reload();
  await page.waitForFunction(() => window.__game?.ready === true);
  await expect(page.locator('.menu-paused .sound-toggle')).toHaveAttribute('data-muted', 'true');

  // The M key toggles too.
  await page.keyboard.press('m');
  await expect(page.locator('.menu-paused .sound-toggle')).toHaveAttribute('data-muted', 'false');
  expect(errors.filter((e) => /audio/i.test(e))).toEqual([]);
});

test('a mute saved by the MVP (before MK-37) is still on after the settings migration', async ({
  page,
}) => {
  await page.goto('/?scenario=settings');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kart-racer:muted', '1');
  });
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready === true);
  await expect(page.locator('.menu-settings .sound-setting')).toHaveAttribute('data-muted', 'true');
});
