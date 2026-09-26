import { expect, test } from '@playwright/test';
import { CANOPY_RUSH, canopyRush } from '../../src/content/tracks/canopy-rush/sim';
import { insidePolygon } from '../../src/sim/splineTrack';
import { trackGeometry } from '../../src/sim/track';
import { getState, loadScenario, setInput, step } from './helpers';

/** The full race is long; run it where it's quick (the unit test covers the AI every tick). */
const FULL_RACE = ['desktop-chrome'];

test.describe('Canopy Rush (MK-61)', () => {
  test('track-canopy-rush: an autopilot race finishes 3 laps with no console errors', async ({
    page,
  }, info) => {
    test.skip(!FULL_RACE.includes(info.project.name), 'full race runs on desktop-chrome');
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'track-canopy-rush', { paused: true });
    expect((await getState(page)).trackId).toBe('canopy-rush');
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

  test('track-canopy-rush mid-race stays within 150 draw calls and 150k triangles', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loadScenario(page, 'track-canopy-rush', { paused: true });
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

  test('canopy-bridge: holding W, the sway pushes you off and you are put back at the bridge start', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'canopy-bridge', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    // Over the edge in the second half of the bridge, then lifted back.
    const kart = (await step(page, 200)).karts[0]!;
    expect(kart.respawnTimer).toBeGreaterThan(0);
    const geometry = trackGeometry(canopyRush);
    const { from } = CANOPY_RUSH.bridges.b1;
    const start = CANOPY_RUSH.tAt(from.x, from.z);
    expect(geometry.project(kart.position).t).toBeCloseTo(start, 3);
    expect(errors).toEqual([]);
  });

  test('canopy-shortcut: holding W drops the kart into the ruins below', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'canopy-shortcut', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const kart = (await step(page, 150)).karts[0]!;
    expect(kart.respawnTimer).toBe(0);
    expect(kart.position.y).toBeCloseTo(CANOPY_RUSH.floorY, 1);
    expect(insidePolygon(kart.position.x, kart.position.z, [...CANOPY_RUSH.ruinsFloor])).toBe(true);
    expect(errors).toEqual([]);
  });
});
