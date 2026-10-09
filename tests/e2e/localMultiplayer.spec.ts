import { expect, test, type Page } from '@playwright/test';
import type { InputFrame } from '../../src/sim/types';
import { getState, loadScenario, step } from './helpers';

/** Countdown (3 s) and a moment more, in ticks. */
const PAST_GO = 4 * 60 + 30;

function setSlotInput(page: Page, slot: number, frame: Partial<InputFrame> | null) {
  return page.evaluate(([s, f]) => window.__game!.setSlotInput(s, f), [slot, frame] as const);
}

// MK-144: up to 4 people on one screen, each slot's controller driving its own kart.
test.describe('local multiplayer (MK-144)', () => {
  test('local-2p: each slot drives only its own kart, the AI fill the grid', async ({ page }) => {
    await loadScenario(page, 'local-2p', { paused: true });
    const start = await getState(page);
    expect(start.slotKarts).toEqual([0, 1]);
    expect(start.karts.map((k) => k.controller)).toEqual([
      'local',
      'local',
      'ai',
      'ai',
      'ai',
      'ai',
      'ai',
      'ai',
    ]);
    expect(await setSlotInput(page, 1, { throttle: 1 })).toBe(true);
    const state = await step(page, PAST_GO);
    expect(state.karts[1]!.speed).toBeGreaterThan(3);
    // P1's keyboard is idle: kart 0 stays on the line.
    expect(state.karts[0]!.speed).toBeLessThan(0.5);
    expect(state.karts[0]!.race.throttleSince).toBeUndefined();
  });

  test('local-4p: four players, P2–P4 drive themselves until a test takes over', async ({
    page,
  }) => {
    await loadScenario(page, 'local-4p', { paused: true });
    await setSlotInput(page, 3, { brake: 1 });
    const state = await step(page, PAST_GO + 60);
    expect(state.slotKarts).toEqual([0, 1, 2, 3]);
    expect(state.karts.filter((k) => k.controller === 'ai')).toHaveLength(4);
    expect(state.karts[1]!.speed).toBeGreaterThan(3);
    expect(state.karts[2]!.speed).toBeGreaterThan(3);
    expect(state.karts[3]!.speed).toBeLessThan(0.5);
  });

  test('pause from P2 pauses the race for everyone and says who paused', async ({ page }) => {
    await loadScenario(page, 'local-2p');
    await expect(page.locator('.menus .menu-panel')).toHaveCount(0);
    expect(await page.evaluate(() => window.__game!.pressPause(1))).toBe(true);
    await expect(page.locator('.menu-paused')).toBeVisible();
    await expect(page.locator('.menu-paused .pause-note')).toHaveText('Paused by P2');
    expect(await page.evaluate(() => window.__game!.isPaused())).toBe(true);
    const tick = (await getState(page)).tick;
    await page.waitForTimeout(300);
    expect((await getState(page)).tick).toBe(tick);
    await page.locator('.menu-paused button', { hasText: 'Resume' }).click();
    await expect(page.locator('.menu-paused')).toHaveCount(0);
    expect(await page.evaluate(() => window.__game!.isPaused())).toBe(false);
  });

  test('local-2p-paused opens on the pause menu from P2', async ({ page }) => {
    await loadScenario(page, 'local-2p-paused');
    await expect(page.locator('.menu-paused .pause-note')).toHaveText('Paused by P2');
  });

  test('local-2p-results: every player has a marked row and a place in the title', async ({
    page,
  }) => {
    await loadScenario(page, 'local-2p-results');
    const results = page.locator('.menu-results');
    await expect(results).toBeVisible();
    await expect(results.locator('h2')).toHaveText('P1 2nd · P2 5th');
    await expect(results.locator('li[data-player]')).toHaveCount(2);
    await expect(results.locator('li[data-player="1"]')).toContainText('(P1)');
    await expect(results.locator('li[data-player="2"]')).toContainText('(P2)');
  });

  test('race setup: Players 2, each player picks a racer, the race has 2 local karts', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loadScenario(page, 'local-setup');
    const select = page.locator('.menu-racerSelect');
    await expect(select.locator('.players-option button[aria-pressed="true"]')).toHaveText('2');
    await select.locator('.players-option button[data-players="3"]').click();
    await expect(select.locator('.players-option button[aria-pressed="true"]')).toHaveText('3');
    await page.keyboard.press('2');
    await expect(select.locator('.players-option button[aria-pressed="true"]')).toHaveText('2');
    await expect(select.locator('h2')).toHaveText('P1, choose your racer');
    await select.locator('button.primary').click();
    await expect(select.locator('h2')).toHaveText('P2, choose your racer');
    await expect(select.locator('.players-option')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await select.locator('button.primary').click();
    await expect(page.locator('.menu-ccSelect')).toBeVisible();
    await page.locator('.menu-ccSelect button', { hasText: '100' }).click();
    await page.locator('.menu-trackSelect button.primary').click();
    await expect(page.locator('.menus .menu-panel')).toHaveCount(0);
    const state = await getState(page);
    expect(state.karts).toHaveLength(8);
    expect(state.slotKarts).toEqual([0, 1]);
    expect(state.karts.filter((k) => k.controller === 'local')).toHaveLength(2);
  });

  test(
    'a 4-player race runs to the results with every player on them',
    { tag: '@full' },
    async ({ page }) => {
      test.setTimeout(180_000);
      await loadScenario(page, 'local-4p', { paused: true });
      await page.evaluate(() => window.__game!.setAutopilot(0, true));
      let state = await getState(page);
      for (let i = 0; i < 200 && state.phase !== 'finished'; i += 1) {
        state = await page.evaluate(() => window.__game!.step(600, { render: false }));
      }
      expect(state.phase).toBe('finished');
      await page.evaluate(() => window.__game!.resume());
      const results = page.locator('.menu-results');
      await expect(results).toBeVisible({ timeout: 10_000 });
      await expect(results.locator('li[data-player]')).toHaveCount(4);
      await expect(results.locator('h2')).toContainText('P4');
    },
  );
});
