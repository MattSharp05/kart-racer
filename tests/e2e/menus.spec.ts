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
    const measure = () =>
      card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          fits:
            el.scrollHeight <= el.clientHeight + 1 && r.bottom <= window.innerHeight && r.top >= 0,
          detail: `top ${r.top} bottom ${r.bottom} scroll ${el.scrollHeight}/${el.clientHeight} viewport ${window.innerHeight}`,
        };
      });
    await expect
      .poll(async () => (await measure()).fits)
      .toBe(true)
      .catch(async () => {
        throw new Error(`How to play doesn't fit: ${(await measure()).detail}`);
      });
  });
});

test.describe('menus QA round 2 (MK-25)', () => {
  test('race-finished: Race again restarts with the same kart and engine class', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem('kart-racer:prefs', JSON.stringify({ kart: 'pixie', engineClass: 150 })),
    );
    await loadScenario(page, 'race-finished');
    await page.locator('.menu-results button', { hasText: 'Race again' }).click();
    await expect(page.locator('.menus .menu-panel')).toHaveCount(0);
    const state = await getState(page);
    expect(state.phase).toBe('countdown');
    expect(state.karts).toHaveLength(8);
    expect(state.karts[0]!.kartType).toBe('pixie');
    expect(state.engineClass).toBe(150);
  });

  test('Esc pauses (the tick stops), Resume continues, Quit returns to the title', async ({
    page,
  }) => {
    await loadScenario(page, 'race-full-100cc');
    await page.waitForFunction(() => window.__game!.getState().tick > 10);
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-paused')).toBeVisible();
    const pausedAt = (await getState(page)).tick;
    await page.waitForTimeout(300);
    expect((await getState(page)).tick).toBe(pausedAt);
    await page.locator('.menu-paused button', { hasText: 'Resume' }).click();
    await page.waitForFunction((t) => window.__game!.getState().tick > t + 5, pausedAt);
    await page.keyboard.press('Escape');
    await page.locator('.menu-paused button', { hasText: 'Quit' }).click();
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('every menu fits the screen with buttons at least 44 px', async ({ page }) => {
    for (const name of [
      'menu-title',
      'menu-kart-select',
      'menu-cc-select',
      'menu-paused',
      'settings',
    ]) {
      await loadScenario(page, name, { paused: true });
      const panel = page.locator('.menu-panel');
      await expect(panel).toBeVisible();
      const result = await panel.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const small = [...el.querySelectorAll('button')]
          .map((b) => b.getBoundingClientRect())
          .filter((b) => b.width > 0 && (b.width < 44 || b.height < 44));
        return {
          inside: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
          scrolls: el.scrollHeight > el.clientHeight + 1,
          small: small.length,
        };
      });
      expect(result, name).toEqual({ inside: true, scrolls: false, small: 0 });
    }
  });
});
