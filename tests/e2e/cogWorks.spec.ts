import { expect, test } from '@playwright/test';
import { BELTS, COG_WORKS, cogWorks } from '../../src/content/tracks/cog-works/sim';
import { trackGeometry } from '../../src/sim/track';
import { getState, loadScenario, setInput, step } from './helpers';

/** The full race is long; run it where it's quick (the unit test covers the AI every tick). */
const FULL_RACE = ['desktop-chrome'];

test.describe('Cog Works (MK-62)', () => {
  test('track-cog-works: an autopilot race finishes 3 laps with no console errors', async ({
    page,
  }, info) => {
    test.skip(!FULL_RACE.includes(info.project.name), 'full race runs on desktop-chrome');
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'track-cog-works', { paused: true });
    expect((await getState(page)).trackId).toBe('cog-works');
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

  test('track-cog-works mid-race stays within 150 draw calls and 150k triangles', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loadScenario(page, 'track-cog-works', { paused: true });
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

  test('cog-works-crushers: holding W, the first piston squashes you', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'cog-works-crushers', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const kart = (await step(page, 120)).karts[0]!;
    expect(kart.spinTimer).toBeGreaterThan(0);
    expect(Math.abs(kart.position.x - COG_WORKS.pistonX[0])).toBeLessThan(4);
    expect(errors).toEqual([]);
  });

  test('cog-works-conveyor: the backward belt drags you back', async ({ page }) => {
    test.setTimeout(60_000);
    await loadScenario(page, 'cog-works-conveyor', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const geometry = trackGeometry(cogWorks);
    // Onto the belt, then a second along it.
    const on = (await step(page, 40)).karts[0]!.position;
    const end = (await step(page, 60)).karts[0]!.position;
    expect(geometry.project(end).lateral).toBeGreaterThan(BELTS.backward.lateralMin);
    const moved = Math.hypot(end.x - on.x, end.z - on.z);
    expect(moved).toBeLessThan(26);
  });
});
