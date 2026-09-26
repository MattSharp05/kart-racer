import { expect, test, type Page } from '@playwright/test';
import { loadScenario, setInput, step } from './helpers';

/** Presses and releases the item button (2 ticks), holding `extra` inputs. */
async function useItem(page: Page, extra: Record<string, number> = {}) {
  await setInput(page, 0, { ...extra, item: true });
  await step(page, 1);
  await setInput(page, 0, extra);
  return step(page, 1);
}

// MK-66: Bubble Shield and Phase.
test.describe('Bubble Shield and Phase (MK-66)', () => {
  test('item-bubble-shield: the red shell pops the bubble, no spin-out', async ({ page }) => {
    await loadScenario(page, 'item-bubble-shield', { paused: true });
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'bubble-shield');
    let state = await useItem(page, { throttle: 1 });
    expect(state.karts[0]!.effects.map((e) => e.kind)).toEqual(['bubble-shield']);
    expect(state.karts[0]!.item.held).toBeNull();

    // The AI behind fires its red shell 3 s in; it reaches you and pops the bubble.
    let popped = false;
    for (let i = 0; i < 30 && !popped; i += 1) {
      state = await step(page, 10);
      popped = !state.karts[0]!.effects.some((e) => e.kind === 'bubble-shield');
      expect(state.karts[0]!.spinTimer).toBe(0);
    }
    expect(popped).toBe(true);
    expect(state.karts[1]!.item.held).toBeNull();
    state = await step(page, 30);
    expect(state.karts[0]!.spinTimer).toBe(0);
    expect(state.entities.some((e) => e.kind === 'shell')).toBe(false);
  });

  test('item-phase: drives through the banana and the stopped kart', async ({ page }) => {
    await loadScenario(page, 'item-phase', { paused: true });
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'phase');
    let state = await useItem(page, { throttle: 1 });
    expect(state.karts[0]!.effects.map((e) => e.kind)).toEqual(['phase']);
    const parked = { ...state.karts[1]!.position };
    for (let i = 0; i < 15; i += 1) {
      state = await step(page, 10);
      expect(state.karts[0]!.spinTimer).toBe(0);
    }
    // Past both, untouched: the banana is still there and the stopped kart hasn't moved.
    expect(state.entities.filter((e) => e.kind === 'banana')).toHaveLength(1);
    expect(state.karts[1]!.position.x).toBeCloseTo(parked.x, 3);
    expect(state.karts[1]!.position.z).toBeCloseTo(parked.z, 3);
    // Phase wears off after 3 s.
    state = await step(page, 40);
    expect(state.karts[0]!.effects).toHaveLength(0);
  });
});
