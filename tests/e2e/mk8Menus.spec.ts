import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-116: MK8 Mode's title and mode select (`mk8-ui-title`, `mk8-ui-mode`). No real pack here
// (ADR 0009): the logo and racers are stand-ins and the sounds synthesized, but the player is
// still asked for the same ids (`window.__mk8.sounds`), and the chosen mode is in
// `window.__mk8.flow`.

const sounds = (page: Page) => page.evaluate(() => [...(window.__mk8?.sounds ?? [])]);
const chosenMode = (page: Page) => page.evaluate(() => window.__mk8?.flow?.mode);

async function settled(page: Page, n: number) {
  await expect(page.locator('.mk8')).toHaveAttribute('data-depth', String(n));
  await expect(page.locator('.mk8')).toHaveAttribute('data-transitioning', 'false');
}

const modeTiles = (page: Page) => page.locator('.mk8-scr-modes .mk8-tile');
const next = (page: Page) => page.locator('.mk8-scr-character-next');

/** Every box is at least 44 px (when `tap`) and inside the viewport. */
async function expectFits(page: Page, selector: string, tap = true) {
  const viewport = page.viewportSize()!;
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  expect(boxes.length, selector).toBeGreaterThan(0);
  for (const b of boxes) {
    if (tap) expect(Math.min(b.w, b.h), selector).toBeGreaterThanOrEqual(44);
    expect(b.x, selector).toBeGreaterThanOrEqual(0);
    expect(b.y, selector).toBeGreaterThanOrEqual(0);
    expect(b.y + b.h, selector).toBeLessThanOrEqual(viewport.height + 0.5);
    expect(b.x + b.w, selector).toBeLessThanOrEqual(viewport.width + 0.5);
  }
}

test.describe('MK8 title and mode select', () => {
  test('keyboard: Enter starts, arrows pick a mode, Enter passes it on, Esc walks back out', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-title');
    await settled(page, 1);
    const title = page.locator('.mk8-scr-title');
    await expect(title).toBeVisible();
    await expect(title.locator('.mk8-title-racers .mk8-art')).toHaveCount(12);
    // No pack: our own wordmark, never Nintendo art.
    await expect(title.locator('.mk8-title-logo-stand-in')).toBeVisible();
    await expect(title.locator('.mk8-title-press')).toContainText('to start');

    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8-wipe')).toHaveClass(/go/);
    await settled(page, 2);
    await expect(page.locator('.mk8-scr-modes')).toBeVisible();
    await expect(modeTiles(page)).toHaveText([/Grand Prix/, /VS Race/, /Time Trial/, /Online/]);
    await expect(modeTiles(page).nth(0)).toHaveAttribute('aria-current', 'true');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(modeTiles(page).nth(2)).toHaveClass(/is-selected/);
    await expect(modeTiles(page).nth(0)).not.toHaveClass(/is-selected/);
    expect(await chosenMode(page)).toBeUndefined();

    await page.keyboard.press('Enter');
    await settled(page, 3);
    await expect(next(page)).toBeVisible();
    await expect(next(page).locator('.mk8-body')).toHaveAttribute('data-mode', 'time-trial');
    await expect(next(page).locator('.mk8-hdr')).toContainText('Time Trial');
    expect(await chosenMode(page)).toBe('time-trial');

    await page.keyboard.press('Escape');
    await settled(page, 2);
    // The mode select kept its selection.
    await expect(modeTiles(page).nth(2)).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Backspace');
    await settled(page, 1);
    await expect(title).toBeVisible();

    expect(await sounds(page)).toEqual([
      'ui/decide',
      'ui/cursor',
      'ui/cursor',
      'ui/decide',
      'ui/back',
      'ui/back',
    ]);

    // Back on the title leaves MK8 Mode for the Kart Racer title.
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('touch: a tap starts, a tap selects, a tap on the selected mode confirms, B goes back', async ({
    page,
  }, info) => {
    await loadScenario(page, 'mk8-ui-title');
    await settled(page, 1);
    const press = (locator: Locator) =>
      info.project.use.hasTouch ? locator.tap() : locator.click();

    await press(page.locator('.mk8-title-press'));
    await settled(page, 2);
    await press(modeTiles(page).nth(1));
    await expect(modeTiles(page).nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.mk8')).toHaveAttribute('data-depth', '2');
    await press(modeTiles(page).nth(1));
    await settled(page, 3);
    expect(await chosenMode(page)).toBe('vs');
    await expect(next(page).locator('.mk8-body')).toHaveAttribute('data-mode', 'vs');

    await press(next(page).locator('.mk8-hint-b'));
    await settled(page, 2);
    // The A hint confirms the selected tile.
    await press(modeTiles(page).nth(3));
    await press(page.locator('.mk8-scr-modes .mk8-hint-a'));
    await settled(page, 3);
    expect(await chosenMode(page)).toBe('online');
    await press(next(page).locator('.mk8-hint-b'));
    await settled(page, 2);
    await press(page.locator('.mk8-scr-modes .mk8-hint-b'));
    await settled(page, 1);

    expect(await sounds(page)).toEqual([
      'ui/decide',
      'ui/cursor',
      'ui/decide',
      'ui/back',
      'ui/cursor',
      'ui/decide',
      'ui/back',
      'ui/back',
    ]);
    // The corner button returns to the Kart Racer title (and doesn't start MK8 Mode).
    await press(page.locator('.mk8-title-back'));
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('mk8-ui-mode opens on the mode select, over the title', async ({ page }) => {
    await loadScenario(page, 'mk8-ui-mode');
    await settled(page, 2);
    await expect(page.locator('.mk8-scr-modes')).toBeVisible();
    await expect(page.locator('.mk8-modes-side .mk8-modes-art')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await settled(page, 1);
    await expect(page.locator('.mk8-scr-title')).toBeVisible();
  });

  test('tap targets are at least 44 px and everything fits the screen', async ({ page }) => {
    await loadScenario(page, 'mk8-ui-title');
    await settled(page, 1);
    await expectFits(page, '.mk8-title-back');
    await expectFits(page, '.mk8-title-press .mk8-slant', false);
    await expectFits(page, '.mk8-title-racers .mk8-art', false);
    await page.keyboard.press('Enter');
    await settled(page, 2);
    await expectFits(page, '.mk8-scr-modes .mk8-tile');
    await expectFits(page, '.mk8-scr-modes .mk8-hint');
    await expectFits(page, '.mk8-modes-side', false);
  });

  test('the MK8 Mode button loads the pack and opens on the title, then the mode select', async ({
    page,
  }) => {
    await servePack(page);
    await loadScenario(page, 'mk8-entry');
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.__game!.whenReady());
    await settled(page, 1);
    await expect(page.locator('.mk8-scr-title')).toBeVisible();
    await page.keyboard.press(' ');
    await settled(page, 2);
    await expect(page.locator('.mk8-scr-modes')).toBeVisible();
  });
});
