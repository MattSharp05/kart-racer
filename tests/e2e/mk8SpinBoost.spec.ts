import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from './helpers';

// MK-108: anti-gravity spin boosts on the synthetic MK8 test ramp (no pack needed).

test.describe('MK8 spin boost (MK-108)', () => {
  for (const [scenario, karts] of [
    ['mk8-test-spinboost', [0, 1]],
    ['mk8-test-bumper', [0]],
  ] as const) {
    test(`${scenario}: the bump in anti-gravity gives a spin boost, drawn without errors`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await loadScenario(page, scenario, { paused: true });
      for (const id of karts) await setInput(page, id, { throttle: 1 });
      const boosted = new Set<number>();
      let fastest = 0;
      for (let i = 0; i < 30; i += 1) {
        const state = await step(page, 3);
        for (const id of karts) {
          const kart = state.karts[id]!;
          expect(kart.antigrav).toBe(true);
          if ((kart.spinBoostTimer ?? 0) > 0) boosted.add(id);
          if (id === 0) fastest = Math.max(fastest, kart.speed);
        }
      }
      expect([...boosted].sort()).toEqual([...karts]);
      // Faster than a 150cc kart drives on its own (28 m/s).
      expect(fastest).toBeGreaterThan(28 * 1.05);
      expect(errors).toEqual([]);
    });
  }
});
