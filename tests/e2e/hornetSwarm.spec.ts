import { expect, test } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import { loadScenario, setInput, step } from './helpers';

const hornets = (state: TestState) =>
  state.entities.filter((e) => e.kind === 'item' && e.spec === 'hornet-swarm');
const stung = (state: TestState) =>
  state.karts.filter((k) => k.effects.some((e) => e.kind === 'hornet-swarm')).map((k) => k.id);

// MK-67: Hornet Swarm.
test.describe('Hornet Swarm (MK-67)', () => {
  test('item-hornet-swarm: one hornet per kart ahead, each stung, no spin-out', async ({
    page,
  }) => {
    await loadScenario(page, 'item-hornet-swarm', { paused: true });
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'hornet-swarm');
    await setInput(page, 0, { throttle: 1, item: true });
    let state = await step(page, 1);
    await setInput(page, 0, { throttle: 1 });
    expect(state.karts[0]!.item.held).toBeNull();
    expect(hornets(state).map((h) => (h.kind === 'item' ? h.targetId : -1))).toEqual([1, 2, 3]);

    const hit = new Set<number>();
    // A sting's wobble lasts 36 ticks: stepping 30 at a time sees every one.
    for (let i = 0; i < 12 && hit.size < 3; i += 1) {
      state = await step(page, 30);
      for (const id of stung(state)) hit.add(id);
      expect(state.karts.every((k) => k.spinTimer === 0)).toBe(true);
    }
    expect([...hit].sort()).toEqual([1, 2, 3]);
    state = await step(page, 30);
    expect(hornets(state)).toHaveLength(0);
  });

  test('item-hornet-swarm-incoming: the HUD warns you, and you are stung, no spin-out', async ({
    page,
  }) => {
    await loadScenario(page, 'item-hornet-swarm-incoming', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const incoming = page.locator('.hud-incoming');
    await expect(incoming).toBeHidden();
    // The AI behind sets its swarm off 2 s in.
    let state = await step(page, 119);
    for (let i = 0; i < 20 && hornets(state).length === 0; i += 1) state = await step(page, 6);
    expect(hornets(state).map((h) => (h.kind === 'item' ? h.targetId : -1))).toEqual([0, 0, 0]);
    await expect(incoming).toBeVisible();
    await expect(incoming).toHaveAttribute('data-items', 'hornet-swarm');

    let wobbled = false;
    for (let i = 0; i < 12 && hornets(state).length > 0; i += 1) {
      state = await step(page, 20);
      wobbled ||= stung(state).includes(0);
      expect(state.karts[0]!.spinTimer).toBe(0);
    }
    expect(wobbled).toBe(true);
    await expect(incoming).toBeHidden();
  });
});
