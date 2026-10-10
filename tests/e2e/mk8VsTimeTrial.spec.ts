import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario, step } from './helpers';

// MK-131: MK8 VS Race settings and Time Trial, without a pack (ADR 0009): the settings screen up to
// the race it starts (our track standing in for the course), a Time Trial on the synthetic test
// ramp, finished Time Trials against saved records, and the records on the course cards.

async function settled(page: Page, n: number) {
  await expect(page.locator('.mk8')).toHaveAttribute('data-depth', String(n));
  await expect(page.locator('.mk8')).toHaveAttribute('data-transitioning', 'false');
}

const row = (page: Page, id: string) => page.locator(`.mk8-scr-vs .mk8-vs-row[data-row=${id}]`);
const results = (page: Page) => page.locator('.mk8-scr-results');

test.describe('MK8 VS Race and Time Trial (MK-131)', () => {
  test('VS settings: class, bananas only and hard CPU carry into the race', async ({ page }) => {
    await loadScenario(page, 'mk8-vs-settings');
    // Title, mode, players (MK-148), character, kart, then the settings.
    await settled(page, 6);
    await expect(page.locator('.mk8-scr-vs .mk8-hdr')).toContainText('VS Race');
    await expect(page.locator('.mk8-scr-vs .mk8-vs-value')).toHaveText([
      '150cc',
      'Normal items',
      'Normal',
    ]);
    await expect(row(page, 'cc')).toHaveAttribute('aria-current', 'true');

    // 200cc, then Items: four to the right is "Bananas only"; CPU: one left of Normal… wraps to Hard.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.mk8-scr-vs .mk8-vs-value')).toHaveText([
      '200cc',
      'Bananas only',
      'Hard',
    ]);
    // The ◀ arrow on the items row goes back to Shells only, and ▶ to Bananas again.
    await row(page, 'items').locator('.mk8-vs-arrow').first().click();
    await expect(row(page, 'items').locator('.mk8-vs-value')).toHaveText('Shells only');
    await row(page, 'items').locator('.mk8-vs-arrow').last().click();
    await expect(row(page, 'items').locator('.mk8-vs-value')).toHaveText('Bananas only');

    await page.keyboard.press('Enter');
    await settled(page, 7);
    await expect(page.locator('.mk8-scr-cup .mk8-hdr .mk8-sub')).toHaveText('200cc');
    expect(await page.evaluate(() => window.__mk8?.flow)).toMatchObject({
      mode: 'vs',
      engineClass: 200,
      vs: { items: 'bananas', cpu: 'hard' },
    });

    // The Mushroom Cup, then Mario Kart Stadium (Sunny Circuit stands in without a pack).
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8-cup')).toHaveAttribute('data-phase', 'course');
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8')).toHaveCount(0);
    const state = await getState(page);
    expect(state).toMatchObject({ trackId: 'sunny-circuit', engineClass: 200, itemSet: 'mk8' });
    expect(state.karts).toHaveLength(8);
    expect(state.itemPool).toEqual(['banana', 'triple-banana']);
  });

  test('Time Trial: alone, no item boxes, three mushrooms and the clock with lap splits', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-tt-ramp', { paused: true });
    const state = await getState(page);
    expect(state.karts).toHaveLength(1);
    expect(state.karts.some((k) => k.controller === 'ai')).toBe(false);
    expect(state.entities.some((e) => e.kind === 'itemBox')).toBe(false);
    expect(state.timeTrial).toBe(true);
    expect(state.karts[0]?.item).toMatchObject({ held: 'triple-mushroom', uses: 3 });

    const hud = page.locator('.mk8-hud');
    await expect(hud.locator('.mk8-hud-timer')).toBeVisible();
    await expect(hud.locator('.mk8-hud-clock')).toHaveText('0:00.000');
    await expect(hud.locator('.mk8-hud-position')).toBeHidden();
    await step(page, 300);
    await expect(hud.locator('.mk8-hud-clock')).not.toHaveText('0:00.000');
  });

  test('a faster Time Trial replaces the records, with "New record!"', async ({ page }) => {
    await loadScenario(page, 'mk8-tt-new-record');
    await expect(results(page)).toBeVisible({ timeout: 10_000 });
    await expect(results(page).locator('.mk8-res-banner')).toHaveText('New record!');
    await expect(results(page).locator('.mk8-res-row')).toHaveCount(1);
    await expect(results(page).locator('.mk8-res-notes li')).toHaveText([
      /Lap 1\s+0:25\.400/,
      /Lap 2\s+0:24\.800/,
      /Lap 3\s+0:28\.200/,
      /Best race\s+1:18\.400\s+NEW/,
      /Best lap\s+0:24\.800\s+NEW/,
    ]);
    await expect(results(page).locator('.mk8-res-choice')).toHaveText(['Retry', 'Quit']);
  });

  test('a slower Time Trial keeps the records, no banner', async ({ page }) => {
    await loadScenario(page, 'mk8-tt-slower');
    await expect(results(page)).toBeVisible({ timeout: 10_000 });
    await expect(results(page).locator('.mk8-res-banner')).toHaveCount(0);
    await expect(results(page).locator('.mk8-res-notes li').nth(3)).toHaveText(
      /Best race\s+1:15\.000$/,
    );
    await expect(results(page).locator('.mk8-res-notes li').nth(4)).toHaveText(
      /Best lap\s+0:24\.000$/,
    );
  });

  test('the course cards show the Time Trial bests', async ({ page }) => {
    await loadScenario(page, 'mk8-tt-courses');
    await settled(page, 5);
    const cards = page.locator('.mk8-scr-cup .mk8-course');
    await expect(cards.locator('.mk8-course-best')).toHaveText([
      'Best 1:15.000',
      'Best —',
      'Best —',
      'Best —',
    ]);
    // A course not drivable on this build (Thwomp Ruins until MK-124) is not installed: it can't
    // start, the others can.
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8-cup')).toHaveAttribute('data-phase', 'course');
    const ruins = page.locator('.mk8-scr-cup .mk8-course[data-course=ruins]');
    if (await ruins.evaluate((el) => el.classList.contains('is-skipped'))) {
      await expect(ruins.locator('.mk8-skipped')).toHaveText('Not installed');
      await ruins.click();
      await ruins.click();
      await expect(page.locator('.mk8-cup')).toHaveAttribute('data-phase', 'course');
      await expect(page.locator('.mk8-scr-course-loading')).toHaveCount(0);
    }
  });
});
