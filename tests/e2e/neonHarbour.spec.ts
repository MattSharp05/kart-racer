import { expect, test } from '@playwright/test';
import { TRAFFIC_MEET_SECONDS } from '../../src/content/tracks/neon-harbour/scenarios';
import { NEON_HARBOUR, neonHarbour } from '../../src/content/tracks/neon-harbour/sim';
import { groundAt } from '../../src/sim/track';
import { getState, loadScenario, setInput, step } from './helpers';

/** The full race is long; run it where it's quick (the unit test covers the AI every tick). */
const FULL_RACE = ['desktop-chrome'];

test.describe('Neon Harbour (MK-60)', () => {
  test('track-neon-harbour: an autopilot race finishes 3 laps with no console errors', async ({
    page,
  }, info) => {
    test.skip(!FULL_RACE.includes(info.project.name), 'full race runs on desktop-chrome');
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'track-neon-harbour', { paused: true });
    expect((await getState(page)).trackId).toBe('neon-harbour');
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

  test('track-neon-harbour mid-race stays within 150 draw calls and 150k triangles', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loadScenario(page, 'track-neon-harbour', { paused: true });
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

  test('neon-harbour-traffic: holding W, the oncoming car spins you out', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'neon-harbour-traffic', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const state = await step(page, Math.round((TRAFFIC_MEET_SECONDS + 0.5) * 60));
    expect(state.karts[0]!.spinTimer).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('neon-harbour-warehouse: holding W carries the kart into the warehouse', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'neon-harbour-warehouse', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const kart = (await step(page, 45)).karts[0]!;
    // Under a second later it's inside, on the warehouse's cluttered floor.
    const { warehouse } = NEON_HARBOUR;
    expect(kart.position.x).toBeLessThan(warehouse.x1);
    expect(kart.position.x).toBeGreaterThan(warehouse.x0);
    expect(groundAt(neonHarbour, kart.position).surface).toBe('rough');
    expect(errors).toEqual([]);
  });
});
