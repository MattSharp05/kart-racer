import { expect, test, type Page } from '@playwright/test';
import { loadScenario } from './helpers';

// MK-104: the MK8 UI kit's style guide (`mk8-ui-kit`). No pack here (CI never has one, ADR 0009):
// the tiles show stand-ins and the sounds are the synthesized fallbacks, but the player is still
// asked for the same ids, which `window.__mk8.sounds` records.

const sounds = (page: Page) => page.evaluate(() => [...(window.__mk8?.sounds ?? [])]);
const depth = (page: Page) => page.locator('.mk8').getAttribute('data-depth');

/** Waits for the wipe to finish on `depth` screens. */
async function settled(page: Page, n: number) {
  await expect(page.locator('.mk8')).toHaveAttribute('data-depth', String(n));
  await expect(page.locator('.mk8')).toHaveAttribute('data-transitioning', 'false');
}

const kitTiles = (page: Page) => page.locator('.mk8-scr-kit .mk8-tile');
const charTiles = (page: Page) => page.locator('.mk8-scr-characters .mk8-tile');

test.describe('MK8 UI kit', () => {
  test('keyboard: arrows move, Enter pushes behind the wipe, Esc pops, sounds play', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-kit');
    await settled(page, 1);
    await expect(kitTiles(page).nth(0)).toHaveAttribute('aria-current', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(kitTiles(page).nth(1)).toHaveClass(/is-selected/);
    await expect(kitTiles(page).nth(0)).not.toHaveClass(/is-selected/);
    // Up at the top stays put (no cursor sound).
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    expect(await sounds(page)).toEqual(['ui/cursor', 'ui/cursor']);

    await page.keyboard.press('Enter');
    // The wipe runs before the next screen shows.
    await expect(page.locator('.mk8-wipe')).toHaveClass(/go/);
    await settled(page, 2);
    await expect(page.locator('.mk8-scr-characters')).toBeVisible();
    await expect(page.locator('.mk8-wipe')).not.toHaveClass(/go/);

    // 4-wide grid: right, then down lands on the second row.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(charTiles(page).nth(5)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.mk8-scr-characters .mk8-nameplate b')).toHaveText('Toad');
    await page.keyboard.press('Enter');
    await settled(page, 3);
    await expect(page.locator('.mk8-scr-ready .mk8-nameplate b')).toHaveText('Toad');

    await page.keyboard.press('Escape');
    await settled(page, 2);
    // The screen below kept its selection.
    await expect(charTiles(page).nth(5)).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Backspace');
    await settled(page, 1);
    await expect(kitTiles(page).nth(0)).toHaveAttribute('aria-current', 'true');

    expect(await sounds(page)).toEqual([
      'ui/cursor',
      'ui/cursor',
      'ui/decide',
      'ui/cursor',
      'ui/cursor',
      'ui/decide',
      'ui/name-appear',
      'ui/back',
      'ui/back',
    ]);

    // Back on the first screen leaves MK8 Mode.
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('touch: a tap selects, a tap on the selected tile confirms, B pops', async ({
    page,
  }, info) => {
    await loadScenario(page, 'mk8-ui-kit');
    await settled(page, 1);
    const press = (locator: ReturnType<Page['locator']>) =>
      info.project.use.hasTouch ? locator.tap() : locator.click();

    await press(kitTiles(page).nth(2));
    await expect(kitTiles(page).nth(2)).toHaveAttribute('aria-current', 'true');
    expect(await depth(page)).toBe('1');
    await press(kitTiles(page).nth(2));
    await settled(page, 2);

    await press(charTiles(page).nth(3));
    await expect(page.locator('.mk8-scr-characters .mk8-nameplate b')).toHaveText('Daisy');
    // The A hint confirms the selected tile.
    await press(page.locator('.mk8-scr-characters .mk8-hint-a'));
    await settled(page, 3);
    await press(page.locator('.mk8-scr-ready .mk8-hint-b'));
    await settled(page, 2);
    await press(page.locator('.mk8-scr-characters .mk8-hint-b'));
    await settled(page, 1);

    expect(await sounds(page)).toEqual([
      'ui/cursor',
      'ui/decide',
      'ui/cursor',
      'ui/decide',
      'ui/name-appear',
      'ui/back',
      'ui/back',
    ]);
    await press(page.locator('.mk8-scr-kit .mk8-hint-b'));
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('tap targets are at least 44 px and everything fits the screen', async ({ page }) => {
    await loadScenario(page, 'mk8-ui-kit');
    await settled(page, 1);
    const viewport = page.viewportSize()!;
    const check = async (selector: string) => {
      const boxes = await page.locator(selector).evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
      expect(boxes.length, selector).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(Math.min(b.w, b.h), selector).toBeGreaterThanOrEqual(44);
        expect(b.x, selector).toBeGreaterThanOrEqual(0);
        expect(b.y + b.h, selector).toBeLessThanOrEqual(viewport.height + 0.5);
        expect(b.x + b.w, selector).toBeLessThanOrEqual(viewport.width + 0.5);
      }
    };
    await check('.mk8-scr-kit .mk8-tile');
    await check('.mk8-scr-kit .mk8-hint');
    await page.keyboard.press('Enter');
    await settled(page, 2);
    await check('.mk8-scr-characters .mk8-tile');
    await check('.mk8-scr-characters .mk8-hint');
  });

  test('reduced motion: no wipe, no pulse', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadScenario(page, 'mk8-ui-kit');
    await settled(page, 1);
    const animation = await kitTiles(page)
      .nth(0)
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
    await page.keyboard.press('Enter');
    // The next screen is there at once.
    expect(await depth(page)).toBe('2');
    await expect(page.locator('.mk8-wipe')).not.toHaveClass(/go/);
    await expect(page.locator('.mk8-scr-characters')).toBeVisible();
  });
});
