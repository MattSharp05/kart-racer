import { expect, test } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import { loadScenario, setInput, step } from './helpers';

const boomerangs = (state: TestState) =>
  state.entities.filter((e) => e.kind === 'item' && e.spec.startsWith('boomerang'));

// MK-69: Boomerang.
test.describe('Boomerang (MK-69)', () => {
  test('item-boomerang: spins out the AI on the way out, then comes back and is caught', async ({
    page,
  }) => {
    await loadScenario(page, 'item-boomerang', { paused: true });
    const slot = page.locator('.hud-item');
    await expect(slot).toHaveAttribute('data-item', 'boomerang');
    await setInput(page, 0, { throttle: 1, item: true });
    let state = await step(page, 1);
    await setInput(page, 0, { throttle: 1 });
    expect(state.karts[0]!.item.held).toBeNull();
    expect(boomerangs(state)).toHaveLength(1);

    // Out: it reaches the AI 15 m ahead within half a second and spins it out.
    let hitAi = false;
    for (let i = 0; i < 6 && !hitAi; i += 1) {
      state = await step(page, 6);
      hitAi = state.karts[1]!.spinTimer > 0;
    }
    expect(hitAi).toBe(true);
    expect(boomerangs(state)).toHaveLength(1);

    // Back: caught within 4 s, never hitting you, and it's in your slot again for one more throw.
    for (let i = 0; i < 24 && boomerangs(state).length > 0; i += 1) {
      state = await step(page, 10);
      expect(state.karts[0]!.spinTimer).toBe(0);
    }
    expect(boomerangs(state)).toHaveLength(0);
    expect(state.karts[0]!.item).toMatchObject({ held: 'boomerang', uses: 1 });
    await expect(slot).toHaveAttribute('data-item', 'boomerang');
  });
});
