import { expect, test } from '@playwright/test';
import { SANDSTORM_LEAD_SECONDS } from '../../src/content/tracks/dune-canyon/scenarios';
import { DUNE_CANYON, duneCanyon } from '../../src/content/tracks/dune-canyon/sim';
import { groundAt } from '../../src/sim/track';
import { getState, loadScenario, setInput, step } from './helpers';

/** The full race is long; run it where it's quick (the unit test covers the AI every tick). */
const FULL_RACE = ['desktop-chrome'];

test.describe('Dune Canyon (MK-58)', () => {
  test('track-dune-canyon: an autopilot race finishes 3 laps with no console errors', async ({
    page,
  }, info) => {
    test.skip(!FULL_RACE.includes(info.project.name), 'full race runs on desktop-chrome');
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'track-dune-canyon', { paused: true });
    expect((await getState(page)).trackId).toBe('dune-canyon');
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    let state = await getState(page);
    for (let i = 0; i < 20 && state.karts[0]!.race.finishTick === undefined; i += 1) {
      state = await step(page, 900);
    }
    expect(state.karts[0]!.race.finishTick).toBeDefined();
    expect(state.karts[0]!.race.lapTimes).toHaveLength(3);
    await expect(page.locator('.menu-results')).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test('track-dune-canyon mid-race stays within 150 draw calls and 150k triangles', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loadScenario(page, 'track-dune-canyon', { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    await step(page, 600);
    // Let a real frame draw so renderer.info describes the race.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const info = await page.evaluate(() => window.__game!.renderInfo());
    expect(info.calls).toBeLessThan(150);
    expect(info.triangles).toBeLessThan(150_000);
  });

  test('dune-canyon-sandstorm: "SANDSTORM!" warns before the storm, then clears', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loadScenario(page, 'dune-canyon-sandstorm', { paused: true });
    const warning = page.locator('.hud-hazard-warning');
    await expect(warning).toBeHidden();
    // 1.5 s in: 2.5 s before the storm.
    await step(page, 90);
    await expect(warning).toHaveText('SANDSTORM!');
    await expect(warning).toBeVisible();
    // The storm is blowing: the warning is gone.
    await step(page, (SANDSTORM_LEAD_SECONDS - 1.5 + 1) * 60);
    await expect(warning).toBeHidden();
  });

  test('dune-canyon-shortcut: holding W carries the kart into the slot canyon', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'dune-canyon-shortcut', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const kart = (await step(page, 60)).karts[0]!;
    // A second later it's well inside the corridor, on its sandy floor.
    expect(kart.position.x).toBeLessThan(DUNE_CANYON.slot.x0 - 25);
    expect(Math.abs(kart.position.z - DUNE_CANYON.slot.z)).toBeLessThan(DUNE_CANYON.slot.halfWidth);
    expect(groundAt(duneCanyon, kart.position).surface).toBe('rough');
    expect(errors).toEqual([]);
  });

  test('dune-canyon-jump loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'dune-canyon-jump', { paused: true });
    expect((await getState(page)).trackId).toBe('dune-canyon');
    await step(page, 5);
    expect(errors).toEqual([]);
  });
});
