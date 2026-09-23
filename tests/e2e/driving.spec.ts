import { expect, test } from '@playwright/test';
import { scenarios } from '../../src/scenarios';
import { footprintOffsets } from '../../src/sim/kart';
import { step as simStep } from '../../src/sim/step';
import { tuning } from '../../src/sim/tuning';
import { NEUTRAL_INPUT } from '../../src/sim/types';
import { getState, loadScenario, pause, setInput, step } from './helpers';

/** Distance the pure sim (run here in Node) predicts for `ticks` of full throttle on the test pad. */
function predictedDistance(ticks: number): number {
  let state = scenarios.get('test-pad')!.setup(1).state;
  for (let i = 0; i < ticks; i += 1) {
    state = simStep(state, [{ ...NEUTRAL_INPUT, throttle: 1 }]).state;
  }
  return -state.karts[0]!.position.z;
}

test.describe('driving on the test pad', () => {
  test('full throttle for 120 ticks moves the distance the physics model predicts (±5%)', async ({
    page,
  }) => {
    await loadScenario(page, 'test-pad', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const state = await step(page, 120);
    const travelled = -state.karts[0]!.position.z;
    const expected = predictedDistance(120);
    expect(travelled).toBeGreaterThan(expected * 0.95);
    expect(travelled).toBeLessThan(expected * 1.05);
    expect(state.karts[0]!.position.x).toBeCloseTo(0, 5);
  });

  for (const name of ['test-pad-wall', 'test-pad-wall-angled']) {
    test(`${name}: the kart's whole footprint stays inside the wall`, async ({ page }) => {
      await loadScenario(page, name, { paused: true });
      await setInput(page, 0, { throttle: 1 });
      for (let i = 0; i < 6; i += 1) {
        const kart = (await step(page, 10)).karts[0]!;
        for (const o of footprintOffsets(kart.heading)) {
          expect(Math.abs(kart.position.x + o.x)).toBeLessThanOrEqual(100 + 1e-9);
          expect(Math.abs(kart.position.z + o.z)).toBeLessThanOrEqual(100 + 1e-9);
        }
      }
    });
  }

  test('holding W and D on the real keyboard drives forward and turns right', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Keyboard controls are desktop-only; touch controls arrive in MK-23.');
    await loadScenario(page, 'test-pad', { paused: true });
    await page.keyboard.down('KeyW');
    await step(page, 60);
    await page.keyboard.down('KeyD');
    const state = await step(page, 60);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');
    expect(state.karts[0]!.position.z).toBeLessThan(-5);
    expect(state.karts[0]!.heading).toBeLessThan(0);
  });
});

test.describe('tuning panel', () => {
  test('?tune=1 shows the panel and a new top speed takes effect immediately', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Dev tuning panel is used on desktop.');
    await page.goto('/?scenario=test-pad&paused=1&tune=1');
    await page.waitForFunction(() => window.__game?.ready === true);
    const panel = page.locator('.lil-gui.lil-root');
    await expect(panel).toBeVisible();

    const input = panel.locator('.lil-controller', { hasText: '100cc' }).locator('input');
    await input.fill('40');
    await input.press('Enter');

    await pause(page);
    await setInput(page, 0, { throttle: 1 });
    // 2.5 s: long enough to pass the old top speed, short enough not to reach the wall.
    const state = await step(page, 150);
    expect(state.karts[0]!.speed).toBeGreaterThan(tuning.topSpeed[100] + 5);
  });
});

test('no console errors while driving', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  await loadScenario(page, 'test-pad');
  await setInput(page, 0, { throttle: 1, steer: 0.5 });
  await page.waitForTimeout(500);
  expect((await getState(page)).tick).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
