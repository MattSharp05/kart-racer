import { expect, test } from '@playwright/test';
import { getState, loadScenario, pause, setInput, step } from './helpers';

test.describe('scenario links', () => {
  test('empty loads with tick 0 and a stationary kart at the origin', async ({ page }) => {
    await loadScenario(page, 'empty', { paused: true });
    const state = await getState(page);
    expect(state.tick).toBe(0);
    expect(state.karts[0]?.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.karts[0]?.speed).toBe(0);
  });

  test('moving loads with the kart already at speed', async ({ page }) => {
    await loadScenario(page, 'moving', { paused: true });
    expect((await getState(page)).karts[0]?.speed).toBeGreaterThan(0);
  });

  test('paused=1 keeps the sim frozen', async ({ page }) => {
    await loadScenario(page, 'empty', { paused: true });
    await page.waitForTimeout(1000);
    expect((await getState(page)).tick).toBe(0);
  });

  test('an unknown scenario shows a banner listing valid names', async ({ page }) => {
    await page.goto('/?scenario=nope');
    const banner = page.getByRole('alert');
    await expect(banner).toContainText('Unknown scenario "nope"');
    await expect(banner).toContainText('empty');
    await expect(banner).toContainText('moving');
  });

  test('stepping 60 ticks with throttle moves the kart forward', async ({ page }) => {
    await loadScenario(page, 'empty');
    await pause(page);
    const before = await getState(page);
    await setInput(page, 0, { throttle: 1 });
    const after = await step(page, 60);
    expect(after.tick - before.tick).toBe(60);
    expect(after.karts[0]!.position.z).toBeLessThan(before.karts[0]!.position.z);
  });

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    await loadScenario(page, 'empty');
    expect(errors).toEqual([]);
  });
});
