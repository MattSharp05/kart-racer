import { expect, test } from '@playwright/test';
import type { SimEvent } from '../../src/sim/types';
import { getState, loadScenario, setInput, step } from './helpers';

async function events(page: import('@playwright/test').Page): Promise<SimEvent[]> {
  return page.evaluate(() => window.__game!.events());
}

test.describe('drift & mini-turbo', () => {
  test('releasing a purple drift fires a tier-3 mini-turbo and boosts', async ({ page }) => {
    await loadScenario(page, 'drift-charged-purple', { paused: true });
    await events(page); // clear
    await setInput(page, 0, { throttle: 1, drift: false });
    const state = await step(page, 1);
    expect(await events(page)).toContainEqual({ type: 'miniTurbo', kartId: 0, tier: 3 });
    expect(state.karts[0]!.boostTimer).toBeGreaterThan(1);
  });

  test('holding the drift keeps charging', async ({ page }) => {
    await loadScenario(page, 'drift-charged-blue', { paused: true });
    const before = (await getState(page)).karts[0]!.drift.charge;
    await setInput(page, 0, { throttle: 1, drift: true, steer: 1 });
    const after = (await step(page, 30)).karts[0]!;
    expect(after.drift.direction).toBe(1);
    expect(after.drift.charge).toBeGreaterThan(before);
  });

  test('Space + D on the keyboard starts a drift from drift-ready', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard controls are desktop-only; touch controls arrive in MK-23.');
    await loadScenario(page, 'drift-ready', { paused: true });
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await page.keyboard.down('Space');
    const state = await step(page, 20);
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    expect(state.karts[0]!.drift.direction).toBe(1);
  });

  test('200cc brake-drift: braking in a drift keeps the drift and most of the speed (MK-96)', async ({
    page,
  }) => {
    await loadScenario(page, 'drive-200cc', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const rolling = await step(page, 90);
    expect(rolling.engineClass).toBe(200);
    // Faster than 150cc's top speed (28 m/s) after 1.5 s, still on the road.
    expect(rolling.karts[0]!.speed).toBeGreaterThan(30);
    await setInput(page, 0, { throttle: 1, drift: true, steer: 1 });
    await step(page, 1);
    await setInput(page, 0, { throttle: 1, drift: true, brake: 1 });
    const kart = (await step(page, 20)).karts[0]!;
    // A plain brake would have shed ~7 m/s and dropped the drift's tightness.
    expect(kart.drift.direction).toBe(1);
    expect(kart.speed).toBeGreaterThan(28);
  });
});
