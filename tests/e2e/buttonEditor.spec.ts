import { expect, test, type Page } from '@playwright/test';
import { loadScenario } from './helpers';

const isPhone = (name: string) => name === 'iphone-landscape';
const SETTINGS_KEY = 'kart-racer:settings';

/** The editor's copy of a button (the race's own controls are hidden under the menus). */
const editorButton = (page: Page, name: string) =>
  page.locator(`.menu-buttonEditor .touch-${name}`);

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox();
  if (!b) throw new Error(`${selector} has no box`);
  return b;
}

/** Drags an editor button by (dx, dy) with pointer events, as a finger would. */
async function drag(page: Page, name: string, dx: number, dy: number) {
  const b = await box(page, `.menu-buttonEditor .touch-${name}`);
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  const el = editorButton(page, name);
  const pointer = { pointerId: 7, bubbles: true, isPrimary: true };
  await el.dispatchEvent('pointerdown', { ...pointer, clientX: x, clientY: y });
  await el.dispatchEvent('pointermove', { ...pointer, clientX: x + dx / 2, clientY: y + dy / 2 });
  await el.dispatchEvent('pointermove', { ...pointer, clientX: x + dx, clientY: y + dy });
  await el.dispatchEvent('pointerup', { ...pointer, clientX: x + dx, clientY: y + dy });
}

/** A race with the saved settings (no scenario storage), its touch controls showing. */
async function openRace(page: Page) {
  await loadScenario(page, 'sunny-start', { paused: true });
  await expect(page.locator('.touch-controls')).toBeVisible();
}

function expectNear(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(Math.abs(actual.x - expected.x), `x ${actual.x} vs ${expected.x}`).toBeLessThanOrEqual(4);
  expect(Math.abs(actual.y - expected.y), `y ${actual.y} vs ${expected.y}`).toBeLessThanOrEqual(4);
}

test.describe('button editor (MK-57)', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright needs the fixtures argument
  test.beforeEach(({}, info) => {
    test.skip(!isPhone(info.project.name));
    // Several page loads: slow on the software-GL pixel-landscape job.
    test.setTimeout(60_000);
  });

  test('drag Drift, save, and a race has Drift at the saved spot', async ({ page }) => {
    await loadScenario(page, 'button-editor');
    await expect(page.locator('.menu-buttonEditor')).toBeVisible();
    const start = await box(page, '.menu-buttonEditor .touch-drift');
    const item = await box(page, '.menu-buttonEditor .touch-item');

    // Dropped on Item: snaps back.
    await drag(page, 'drift', item.x - start.x, item.y - start.y);
    expectNear(await box(page, '.menu-buttonEditor .touch-drift'), start);

    // Into free space: stays there.
    await drag(page, 'drift', -220, -90);
    const moved = await box(page, '.menu-buttonEditor .touch-drift');
    expectNear(moved, { x: start.x - 220, y: start.y - 90 });

    // Dragged off the bottom of the screen: kept on it.
    await drag(page, 'brake', 0, 400);
    const brake = await box(page, '.menu-buttonEditor .touch-brake');
    expect(brake.y + brake.height).toBeLessThanOrEqual(page.viewportSize()!.height);

    await page.locator('.button-editor-save').click();
    // Back to Settings, over the pause menu.
    await expect(page.locator('.menu-settings')).toBeVisible();
    const stored = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY);
    expect(JSON.parse(stored ?? '{}').buttons.positions.drift).toBeTruthy();

    await openRace(page);
    expectNear(await box(page, '.touch-controls .touch-drift'), moved);
  });

  test('Settings → Customise buttons: 150 % makes the buttons 1.5×; Reset restores the defaults', async ({
    page,
  }) => {
    await openRace(page);
    const defaults = await box(page, '.touch-controls .touch-drift');

    await loadScenario(page, 'settings');
    await page.locator('.menu-settings .settings-buttons-edit').click();
    await page.locator('.button-editor-size').fill('150');
    await expect(page.locator('.button-editor-size-label')).toHaveText('Size 150%');
    await page.locator('.button-editor-save').click();
    await expect(page.locator('.menu-settings')).toBeVisible();

    await openRace(page);
    const big = await box(page, '.touch-controls .touch-drift');
    expect(big.width).toBeCloseTo(defaults.width * 1.5, 0);
    expect(big.height).toBeCloseTo(defaults.height * 1.5, 0);

    await loadScenario(page, 'button-editor');
    await drag(page, 'drift', -200, -80);
    await page.locator('.button-editor-reset').click();
    await expect(page.locator('.button-editor-size-label')).toHaveText('Size 100%');
    await page.locator('.button-editor-save').click();

    await openRace(page);
    const reset = await box(page, '.touch-controls .touch-drift');
    expectNear(reset, defaults);
    expect(reset.width).toBeCloseTo(defaults.width, 0);
  });

  test('long-press sizes one button; Hand: Left mirrors a custom layout', async ({ page }) => {
    await loadScenario(page, 'race-touch-custom', { paused: true });
    await expect(page.locator('.touch-controls')).toHaveAttribute('data-layout', 'custom');
    const vw = page.viewportSize()!.width;
    const right = await box(page, '.touch-controls .touch-drift');

    // The same layout, left-handed: mirrored across the middle of the screen.
    const settings = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY);
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
      SETTINGS_KEY,
      JSON.stringify({
        ...JSON.parse(settings ?? '{}'),
        version: 1,
        hand: 'left',
        buttons: {
          scale: 1.25,
          sizes: { drift: 1, item: 0.8, brake: 1 },
          positions: { drift: { x: 24, y: 40 }, item: { x: 40, y: 18 }, brake: { x: 8, y: 18 } },
        },
      }),
    ] as const);
    await openRace(page);
    const left = await box(page, '.touch-controls .touch-drift');
    expectNear(left, { x: vw - right.x - right.width, y: right.y });

    // Long-press Item in the editor: the slider now sizes Item alone.
    await loadScenario(page, 'button-editor');
    const item = editorButton(page, 'item');
    const drift = await box(page, '.menu-buttonEditor .touch-drift');
    const b = await box(page, '.menu-buttonEditor .touch-item');
    await item.dispatchEvent('pointerdown', {
      pointerId: 9,
      bubbles: true,
      clientX: b.x + b.width / 2,
      clientY: b.y + b.height / 2,
    });
    await expect(item).toHaveClass(/selected/);
    await item.dispatchEvent('pointerup', { pointerId: 9, bubbles: true });
    // The layout saved above (left hand) has Item at 80 %.
    await expect(page.locator('.button-editor-size-label')).toHaveText('Item size 80%');
    await page.locator('.button-editor-size').fill('120');
    const bigger = await box(page, '.menu-buttonEditor .touch-item');
    expect(bigger.width).toBeCloseTo(b.width * 1.5, 0);
    // Drift is untouched.
    expect((await box(page, '.menu-buttonEditor .touch-drift')).width).toBeCloseTo(drift.width, 0);
  });
});
