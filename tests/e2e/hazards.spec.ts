import { expect, test } from '@playwright/test';
import { hazardTest } from '../../src/content/tracks/hazard-test/sim';
import { trackGeometry } from '../../src/sim/track';
import { tuning } from '../../src/sim/tuning';
import { getState, loadScenario, setInput, step } from './helpers';

const geometry = trackGeometry(hazardTest);

test.describe('track hazards and surfaces (MK-49)', () => {
  test('hazard-test: driving into the oncoming traffic kart spins the kart out', async ({
    page,
  }) => {
    // Software WebGL on CI is slow; keep round trips few.
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await loadScenario(page, 'hazard-test', { paused: true });
    expect((await getState(page)).trackId).toBe('hazard-test');
    await setInput(page, 0, { throttle: 1 });
    let spun = false;
    // The spin lasts 60 ticks, so sampling every 30 can't miss it.
    for (let i = 0; i < 16 && !spun; i += 1) {
      const kart = (await step(page, 30)).karts[0]!;
      spun = kart.spinTimer > 0;
    }
    expect(spun).toBe(true);
    expect(errors).toEqual([]);
  });

  test('surface-conveyor: the belt carries a stopped kart to the right', async ({ page }) => {
    await loadScenario(page, 'surface-conveyor', { paused: true });
    const before = geometry.project((await getState(page)).karts[0]!.position).lateral;
    const after = geometry.project((await step(page, 60)).karts[0]!.position).lateral;
    expect(after - before).toBeGreaterThan(tuning.surfaces.conveyorSpeed * 0.8);
  });

  for (const name of ['surface-ice', 'surface-sand', 'hazard-crusher', 'hazard-sandstorm']) {
    test(`${name} loads on the hazard track without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await loadScenario(page, name, { paused: true });
      expect((await getState(page)).trackId).toBe('hazard-test');
      await step(page, 5);
      expect(errors).toEqual([]);
    });
  }
});
