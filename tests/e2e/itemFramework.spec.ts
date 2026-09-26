import { expect, test, type Page } from '@playwright/test';
import { loadScenario, setInput, step } from './helpers';

/** Presses and releases the item button (2 ticks). */
async function useItem(page: Page) {
  await setInput(page, 0, { item: true });
  await step(page, 1);
  await setInput(page, 0, null);
  return step(page, 1);
}

// The item framework's worked example (MK-52): the dev-only Test kit.
test.describe('item framework', () => {
  test('item-framework-test: the slot counts down 3 uses; the homing bolt hits', async ({
    page,
  }) => {
    await loadScenario(page, 'item-framework-test', { paused: true });
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'test-kit');
    await expect(page.locator('.hud-item-uses')).toHaveText('×3');

    let state = await useItem(page);
    await expect(page.locator('.hud-item-uses')).toHaveText('×2');
    expect(state.entities.filter((e) => e.kind === 'item').map((e) => e.spec)).toEqual([
      'test-kit-bolt',
    ]);
    state = await step(page, 60);
    expect(state.karts[1]!.spinTimer).toBeGreaterThan(0);

    await useItem(page);
    await expect(page.locator('.hud-item-uses')).toHaveCount(0);
    state = await useItem(page);
    expect(state.karts[0]!.item.held).toBeNull();
    expect(state.karts[0]!.effects.map((e) => e.kind)).toEqual(['test-kit-shield']);
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', '');
  });

  test('backing into the ink puddle puts ink on your screen until it wears off', async ({
    page,
  }) => {
    await loadScenario(page, 'item-framework-test', { paused: true });
    for (let i = 0; i < 3; i += 1) await useItem(page);
    const overlay = page.locator('.hud-screen-effect[data-overlay="effect:test-kit-ink"]');
    await expect(overlay).toHaveCount(0);

    // The puddle is 3 m behind; you can touch your own after a second.
    await step(page, 60);
    await setInput(page, 0, { brake: 1 });
    let inked = false;
    for (let i = 0; i < 30 && !inked; i += 1) {
      const state = await step(page, 5);
      inked = state.karts[0]!.effects.some((e) => e.kind === 'test-kit-ink');
    }
    expect(inked).toBe(true);
    await setInput(page, 0, null);
    await expect(overlay).toHaveCount(1);
    await step(page, 3 * 60);
    await expect(overlay).toHaveCount(0);
  });
});
