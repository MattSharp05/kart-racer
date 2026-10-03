import { expect, test, type Page } from '@playwright/test';
import { loadScenario, setInput, step } from './helpers';
import { servePack } from './mk8';

// MK-126: the Piranha Plant, coin item and Crazy 8 in MK8 races, with the synthetic fixture pack
// (`fixtures/mk8-pack/models/items/`; CI never has the real one, ADR 0009).

function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Presses and releases the player's item button (2 ticks). */
async function press(page: Page) {
  await setInput(page, 0, { item: true });
  await step(page, 1);
  await setInput(page, 0, { item: false });
  return step(page, 1);
}

test.describe('MK8 items: Piranha Plant, coin, Crazy 8', () => {
  test('piranha plant: out in front, it eats the banana, takes the coin and bites the kart', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    const pack = await servePack(page);
    await loadScenario(page, 'mk8-item-piranha', { paused: true });
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'piranha-plant');
    let state = await press(page);
    expect(state.karts[0]!.effects.some((e) => e.kind === 'piranha-plant')).toBe(true);
    expect(state.entities.some((e) => e.kind === 'banana')).toBe(false);
    await setInput(page, 0, { throttle: 1 });
    // Driving on, the plant bites the kart 22 m ahead: it spins out (for a moment).
    let bitten = false;
    for (let i = 0; i < 24 && !bitten; i += 1) {
      state = await step(page, 10);
      bitten = state.karts[1]!.spinTimer > 0;
    }
    expect(bitten).toBe(true);
    expect(state.karts[0]!.coins).toBe(1);
    expect(pack.requested).toContain('models/items/piranha-plant.glb');
    expect(errors).toEqual([]);
  });

  test('coin item: +2 coins', async ({ page }) => {
    await servePack(page);
    await loadScenario(page, 'mk8-item-coin', { paused: true });
    const state = await press(page);
    expect(state.karts[0]!.coins).toBe(5);
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', '');
  });

  test('crazy 8: the ring comes out (star and coin at once), then six presses use the rest', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    await servePack(page);
    await loadScenario(page, 'mk8-item-crazy8', { paused: true });
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'crazy-8');
    let state = await press(page);
    expect(state.karts[0]!.starTimer).toBeGreaterThan(0);
    expect(state.karts[0]!.coins).toBe(2);
    for (let i = 0; i < 6; i += 1) {
      expect(state.karts[0]!.item.held).toBe('crazy-8');
      state = await press(page);
      await step(page, 4);
    }
    expect(state.karts[0]!.item.held).toBeNull();
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', '');
    expect(errors).toEqual([]);
  });
});
