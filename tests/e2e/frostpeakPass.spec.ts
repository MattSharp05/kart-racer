import { expect, test } from '@playwright/test';
import { SNOWBALL_LEAD_SECONDS } from '../../src/content/tracks/frostpeak-pass/scenarios';
import { FROSTPEAK_PASS, frostpeakPass } from '../../src/content/tracks/frostpeak-pass/sim';
import { groundAt } from '../../src/sim/track';
import { getState, loadScenario, setInput, step } from './helpers';

/** The full race is long; run it where it's quick (the unit test covers the AI every tick). */
const FULL_RACE = ['desktop-chrome'];

test.describe('Frostpeak Pass (MK-59)', () => {
  test('track-frostpeak-pass: an autopilot race finishes 3 laps with no console errors', async ({
    page,
  }, info) => {
    test.skip(!FULL_RACE.includes(info.project.name), 'full race runs on desktop-chrome');
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'track-frostpeak-pass', { paused: true });
    expect((await getState(page)).trackId).toBe('frostpeak-pass');
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

  test('track-frostpeak-pass mid-race stays within 150 draw calls and 150k triangles', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loadScenario(page, 'track-frostpeak-pass', { paused: true });
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

  test('frostpeak-snowballs: holding W, the rolling snowball spins you out', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'frostpeak-snowballs', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const state = await step(page, Math.round((SNOWBALL_LEAD_SECONDS + 0.5) * 60));
    expect(state.karts[0]!.spinTimer).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('frostpeak-tunnel: holding W carries the kart into the tunnel', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'frostpeak-tunnel', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const kart = (await step(page, 60)).karts[0]!;
    // A second later it's under the snowbank, on the tunnel's snowy floor.
    const { tunnel } = FROSTPEAK_PASS;
    expect(kart.position.z).toBeGreaterThan(tunnel.z0);
    expect(kart.position.x).toBeGreaterThan(tunnel.x0);
    expect(kart.position.x).toBeLessThan(tunnel.x1);
    expect(groundAt(frostpeakPass, kart.position).surface).toBe('rough');
    expect(errors).toEqual([]);
  });

  test('frostpeak-ice loads onto the frozen lake without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'frostpeak-ice', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const kart = (await step(page, 120)).karts[0]!;
    expect(groundAt(frostpeakPass, kart.position).surface).toBe('ice');
    expect(errors).toEqual([]);
  });
});
