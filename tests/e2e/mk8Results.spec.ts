import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario } from './helpers';

// MK-121: MK8 Mode's pause menu (`mk8-ui-pause`) and race results (`mk8-ui-results` for a VS race,
// `mk8-ui-standings` for a Grand Prix's points) on the synthetic test ramp: no pack (ADR 0009), so
// stand-in icons and synthesized sounds, but the player is still asked for the same sound ids.

const sounds = (page: Page) => page.evaluate(() => [...(window.__mk8?.sounds ?? [])]);
/** The scripted finish: kart ids in finishing order (`src/scenarios/mk8/raceScreens.ts`). */
const FINISH_ORDER = [3, 5, 0, 1, 7, 2, 6, 4];

/** Waits `n` animation frames (the game loop runs on them). */
const frames = (page: Page, n: number) =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );

const rowKarts = (page: Page) =>
  page
    .locator('.mk8-res-row')
    .evaluateAll((rows) => rows.map((r) => Number(r.getAttribute('data-kart'))));

/** Every box is at least 44 px and inside the viewport. */
async function expectTappable(page: Page, selector: string) {
  const viewport = page.viewportSize()!;
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
    expect(b.y, selector).toBeGreaterThanOrEqual(0);
    expect(b.y + b.h, selector).toBeLessThanOrEqual(viewport.height + 0.5);
    expect(b.x + b.w, selector).toBeLessThanOrEqual(viewport.width + 0.5);
  }
}

test.describe('MK8 pause menu', () => {
  test('stops the sim with the pause sound; Esc continues it with the unpause sound', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-pause');
    const pauseScr = page.locator('.mk8-scr-pause');
    await expect(pauseScr).toBeVisible();
    await expect(pauseScr.locator('.mk8-pause-opt')).toHaveText(['Continue', 'Restart', 'Quit']);
    expect(await sounds(page)).toContain('race/pause');
    const { tick } = await getState(page);
    expect((await getState(page)).phase).toBe('racing');
    await frames(page, 20);
    expect((await getState(page)).tick).toBe(tick);

    await page.keyboard.press('Escape');
    await expect(pauseScr).toHaveCount(0);
    expect(await sounds(page)).toContain('race/unpause');
    await frames(page, 20);
    expect((await getState(page)).tick).toBeGreaterThan(tick);
    // Esc closed the menu without opening it again behind it.
    await expect(page.locator('.mk8')).toHaveCount(0);
  });

  test('arrows move the frame; Restart starts again, Quit opens MK8 Mode', async ({ page }) => {
    await loadScenario(page, 'mk8-ui-pause');
    const options = page.locator('.mk8-pause-opt');
    await expect(options.nth(0)).toHaveClass(/is-selected/);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(2)).toHaveClass(/is-selected/);
    expect(await sounds(page)).toContain('ui/cursor');
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8-scr-title')).toBeVisible();

    await loadScenario(page, 'mk8-ui-pause');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8-scr-pause')).toHaveCount(0);
    const state = await getState(page);
    expect(state.phase).toBe('countdown');
  });

  test('touch: every option and the bar are ≥ 44 px; tap selects, tap again confirms', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'phones');
    await loadScenario(page, 'mk8-ui-pause');
    await expectTappable(page, '.mk8-pause-opt');
    await expectTappable(page, '.mk8-scr-pause .mk8-hint');
    const quit = page.locator('.mk8-pause-opt[data-option="quit"]');
    await quit.tap();
    await expect(quit).toHaveClass(/is-selected/);
    await page.locator('.mk8-scr-pause .mk8-hint-b').tap();
    await expect(page.locator('.mk8-scr-pause')).toHaveCount(0);
    expect(await sounds(page)).toContain('race/unpause');
  });
});

test.describe('MK8 race results', () => {
  test('rows follow the sim’s finishing order, your row yellow, with the VS choices', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-results', { paused: true });
    const screen = page.locator('.mk8-scr-results');
    await expect(screen).toHaveAttribute('data-phase', 'done');
    const { positions } = await getState(page);
    expect(positions).toEqual(FINISH_ORDER);
    expect(await rowKarts(page)).toEqual(FINISH_ORDER);
    await expect(page.locator('.mk8-res-n')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8']);
    await expect(page.locator('.mk8-res-row.is-you')).toHaveAttribute('data-kart', '0');
    await expect(page.locator('.mk8-res-row').nth(0).locator('.mk8-res-time')).toHaveText(
      '1:18.417',
    );
    await expect(page.locator('.mk8-res-choice')).toHaveText(['Next course', 'Retry', 'Quit']);
    // No points in a VS race.
    await expect(page.locator('.mk8-res-pts')).toHaveCount(0);
  });

  test('rows slide in, then OK picks a choice: Retry races again', async ({ page }) => {
    await loadScenario(page, 'mk8-ui-results');
    const screen = page.locator('.mk8-scr-results');
    await expect(screen).toHaveAttribute('data-phase', 'done');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.mk8-res-choice[data-choice="retry"]')).toHaveClass(/is-selected/);
    await page.keyboard.press('Enter');
    await expect(screen).toHaveCount(0);
    expect((await getState(page)).phase).toBe('countdown');
  });

  test('Grand Prix: points count up into the totals and the standings re-sort', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-standings');
    const screen = page.locator('.mk8-scr-results');
    await expect(screen).toHaveAttribute('data-phase', /rows|points|standings/);
    await expect(screen).toHaveAttribute('data-phase', 'done', { timeout: 10_000 });
    // A cup's first race: the standings are the race order, with MK8's points.
    expect(await rowKarts(page)).toEqual(FINISH_ORDER);
    await expect(page.locator('.mk8-res-plus')).toHaveText([
      '+15',
      '+12',
      '+10',
      '+9',
      '+8',
      '+7',
      '+6',
      '+5',
    ]);
    await expect(page.locator('.mk8-res-pts')).toHaveText([
      '15',
      '12',
      '10',
      '9',
      '8',
      '7',
      '6',
      '5',
    ]);
    await expect(page.locator('.mk8-res-choice')).toHaveText(['Next race', 'Quit']);
    await expect(screen.locator('.mk8-hdr')).toContainText('Race 1 / 4');
  });

  test('OK during the animation skips to the end; Quit (confirmed) opens MK8 Mode', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-standings');
    const screen = page.locator('.mk8-scr-results');
    await expect(screen).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(screen).toHaveAttribute('data-phase', 'done');
    await expect(page.locator('.mk8-res-pts').first()).toHaveText('15');
    // Esc doesn't leave the results.
    await page.keyboard.press('Escape');
    await expect(screen).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    // MK-130: quitting a Grand Prix asks first ("Keep racing" selected).
    await expect(page.locator('.mk8')).toHaveAttribute('data-depth', '2');
    await expect(page.locator('.mk8')).toHaveAttribute('data-transitioning', 'false');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8-scr-title')).toBeVisible();
  });

  test('touch: the choices and the bar are ≥ 44 px and fit; tap twice confirms', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'phones');
    await loadScenario(page, 'mk8-ui-results', { paused: true });
    await expect(page.locator('.mk8-scr-results')).toHaveAttribute('data-phase', 'done');
    await expectTappable(page, '.mk8-res-choice');
    await expectTappable(page, '.mk8-scr-results .mk8-hint');
    // Every row fits on the phone's screen.
    const viewport = page.viewportSize()!;
    const bottoms = await page
      .locator('.mk8-res-row')
      .evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().bottom));
    for (const bottom of bottoms) expect(bottom).toBeLessThanOrEqual(viewport.height);
    const quit = page.locator('.mk8-res-choice[data-choice="quit"]');
    await quit.tap();
    await expect(quit).toHaveClass(/is-selected/);
    await quit.tap();
    await expect(page.locator('.mk8-scr-title')).toBeVisible();
  });
});
