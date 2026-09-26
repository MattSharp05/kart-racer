import { expect, test } from '@playwright/test';
import { scenarios } from '../../src/scenarios';
import { getState, loadScenario, pause, setInput, step } from './helpers';

/** Every scenario, in /dev's order (grouped by heading, registry order within a group). */
const ALL_SCENARIOS = devOrder(scenarios.list().map(({ name, group }) => ({ name, group })));
/**
 * Up to ~5 s a scenario (a full track's scenery on a busy CI runner, desktop or phone): a chunk of 3
 * stays near half of the desktop projects' default 30 s. Six Canopy Rush / Cog Works scenarios in
 * one test took 31 s on desktop-chrome in CI (MK-80).
 */
const SCENARIOS_PER_TEST = 3;

/** The names grouped as /dev shows them: groups in first-seen order. */
function devOrder(list: { name: string; group: string }[]): string[] {
  const groups = new Map<string, string[]>();
  for (const { name, group } of list) groups.set(group, [...(groups.get(group) ?? []), name]);
  return [...groups.values()].flat();
}

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

  test('/dev lists exactly the registered scenarios', async ({ page }) => {
    await page.goto('/dev.html');
    const listed = await page
      .locator('[data-scenario]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-scenario')!));
    expect(listed.length).toBeGreaterThan(10);
    expect(listed).toEqual(ALL_SCENARIOS);
  });
});

/**
 * Every scenario loads without errors (MK-80): in chunks of a few, so the chunks spread over the
 * workers and each stays well inside its test timeout (one test for all ~100 took 3.5–4 min
 * on pixel-landscape and grew with every track and item). The test above checks the chunks cover
 * exactly what /dev lists.
 */
test.describe('every scenario loads', () => {
  for (let first = 0; first < ALL_SCENARIOS.length; first += SCENARIOS_PER_TEST) {
    const names = ALL_SCENARIOS.slice(first, first + SCENARIOS_PER_TEST);
    test(`${first + 1}–${first + names.length}: ${names.join(', ')}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      for (const name of names) {
        await loadScenario(page, name, { paused: true });
        expect(await page.evaluate(() => window.__game!.scenario), name).toBe(name);
        expect(errors, name).toEqual([]);
      }
    });
  }
});
