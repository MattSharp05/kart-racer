import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from './helpers';

// MK-109: coins on the synthetic MK8 test ramp (no pack needed).

test.describe('MK8 coins (MK-109)', () => {
  test('mk8-test-coins: driving down the coin line takes its 5 coins, drawn without errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'mk8-test-coins', { paused: true });
    const start = await step(page, 1);
    expect(start.coins).toHaveLength(10);
    expect(start.karts[0]!.coins).toBe(0);
    await setInput(page, 0, { throttle: 1 });
    let state = start;
    for (let i = 0; i < 24; i += 1) state = await step(page, 10);
    expect(state.karts[0]!.coins).toBe(5);
    expect(state.coins!.filter((c) => c.respawnTimer > 0)).toHaveLength(5);
    expect(errors).toEqual([]);
  });

  test('mk8-test-coins-hit: a shell hit drops 3 coins that another kart can take', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadScenario(page, 'mk8-test-coins-hit', { paused: true });
    await setInput(page, 0, { item: true });
    let state = await step(page, 2);
    await setInput(page, 0, { item: false });
    for (let i = 0; i < 9 && state.karts[1]!.coins !== 2; i += 1) state = await step(page, 10);
    expect(state.karts[1]!.coins).toBe(2);
    expect(state.coins!.filter((c) => c.life !== undefined)).toHaveLength(3);
    // Drive through the dropped coins.
    await setInput(page, 0, { throttle: 1 });
    for (let i = 0; i < 12 && (state.karts[0]!.coins ?? 0) === 0; i += 1) {
      state = await step(page, 10);
    }
    expect(state.karts[0]!.coins).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
