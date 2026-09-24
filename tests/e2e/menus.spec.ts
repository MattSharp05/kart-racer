import { expect, test } from '@playwright/test';
import { getState, loadScenario } from './helpers';

test('title → kart select → engine class → race with 8 karts', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true);
  // First visit: the controls guide shows first.
  await page.locator('.how-to-play button').click();
  await page.locator('.menu-title button.primary').click();
  await expect(page.locator('.menu-kartSelect')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.locator('.menu-kartSelect button.primary').click();
  await expect(page.locator('.menu-ccSelect')).toBeVisible();
  await page.locator('.menu-ccSelect button', { hasText: '150' }).click();
  await expect(page.locator('.menus .menu-panel')).toHaveCount(0);
  const state = await getState(page);
  expect(state.karts).toHaveLength(8);
  expect(state.engineClass).toBe(150);
});

test('menu-paused: Resume closes the pause menu', async ({ page }) => {
  await loadScenario(page, 'menu-paused');
  await expect(page.locator('.menu-paused')).toBeVisible();
  await page.locator('.menu-paused button', { hasText: 'Resume' }).click();
  await expect(page.locator('.menu-paused')).toHaveCount(0);
});

test.describe('how to play (MK-32)', () => {
  test('shows on first load, Got it closes it, not shown again after reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.ready === true);
    const guide = page.locator('.how-to-play');
    await expect(guide).toBeVisible();
    await guide.locator('button').click();
    await expect(guide).toBeHidden();
    await page.reload();
    await page.waitForFunction(() => window.__game?.ready === true);
    await expect(page.locator('.menu-title')).toBeVisible();
    await expect(guide).toBeHidden();
    // Still reachable from the title screen.
    await page.locator('.menu-title button', { hasText: 'How to play' }).click();
    await expect(guide).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(guide).toBeHidden();
  });

  test('the pause menu has How to play', async ({ page }) => {
    await loadScenario(page, 'menu-paused');
    await page.locator('.menu-paused button', { hasText: 'How to play' }).click();
    await expect(page.locator('.how-to-play')).toBeVisible();
    await page.locator('.how-to-play button').click();
    await expect(page.locator('.menu-paused')).toBeVisible();
  });

  test('shows the controls for this device and fits without scrolling', async ({ page }) => {
    await loadScenario(page, 'menu-how-to-play');
    const card = page.locator('.how-to-play-card');
    await expect(card).toBeVisible();
    const touch = await page.evaluate(() => document.body.classList.contains('touch'));
    await expect(page.locator('.how-to-play-controls')).toHaveClass(touch ? /touch/ : /keyboard/);
    // Poll: on slow CI browsers the layout can still be settling (fonts) on the first check.
    await expect
      .poll(() =>
        card.evaluate(
          (el) =>
            el.scrollHeight <= el.clientHeight + 1 &&
            el.getBoundingClientRect().bottom <= window.innerHeight &&
            el.getBoundingClientRect().top >= 0,
        ),
      )
      .toBe(true);
  });
});
