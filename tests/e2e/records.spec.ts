import { expect, test, type Page } from '@playwright/test';
import { loadScenario, step } from './helpers';

/** Loads the scenario, lets the autopilot cross the line and waits for the results screen. */
async function finishRace(page: Page, scenario: string) {
  await loadScenario(page, scenario, { paused: true });
  await page.evaluate(() => window.__game!.setAutopilot(0, true));
  const state = await step(page, 360);
  expect(state.phase).toBe('finished');
  const results = page.locator('.menu-results');
  await expect(results).toBeVisible();
  return results;
}

test.describe('track records (MK-44)', () => {
  test('race-final-straight: "New record!" on a fresh profile, not on a second, equal run', async ({
    page,
  }) => {
    let results = await finishRace(page, 'race-final-straight');
    await expect(results.locator('.new-record')).toHaveText('New record!');
    await expect(results.locator('.record.new')).toHaveCount(2);

    // Same profile (localStorage survives the reload), same deterministic run: no faster.
    results = await finishRace(page, 'race-final-straight');
    await expect(results.locator('.records')).toBeVisible();
    await expect(results.locator('.new-record')).toHaveCount(0);
    await expect(results.locator('.record.new')).toHaveCount(0);
  });

  test('records-has-best: beats the saved race record, the lap record stands', async ({ page }) => {
    const results = await finishRace(page, 'records-has-best');
    await expect(results.locator('.new-record')).toHaveText('New record!');
    await expect(results.locator('.record.new')).toContainText('Race record');
    await expect(results.locator('.record.new')).toContainText('(was 2:40.000)');
    await expect(results.locator('.record:not(.new)')).toHaveText('Lap record 0:48.000');
  });
});
