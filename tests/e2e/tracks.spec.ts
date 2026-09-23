import { expect, test } from '@playwright/test';
import { autopilotInput } from '../../src/sim/autopilot';
import { testOval } from '../../src/sim/data/tracks/testOval';
import { trackGeometry } from '../../src/sim/track';
import { getState, loadScenario, setInput, step } from './helpers';

const geometry = trackGeometry(testOval);

test.describe('test oval (track system)', () => {
  test('an autopilot lap of the oval stays on the road the whole way', async ({ page }) => {
    test.setTimeout(60_000);
    await loadScenario(page, 'oval-start', { paused: true });
    let state = await getState(page);
    let lastS = geometry.project(state.karts[0]!.position).s;
    let travelled = 0;
    // Re-aim every 10 ticks, driven from Node with the same pure sim helpers.
    while (travelled < geometry.length) {
      await setInput(page, 0, autopilotInput(state.karts[0]!, geometry));
      state = await step(page, 10);
      const p = geometry.project(state.karts[0]!.position);
      expect(p.surface).toBe('road');
      let ds = p.s - lastS;
      if (ds < -geometry.length / 2) ds += geometry.length;
      travelled += ds;
      lastS = p.s;
      expect(state.tick).toBeLessThan(3000);
    }
  });

  test('driving into the outer wall at 45° keeps the kart inside the track', async ({ page }) => {
    await loadScenario(page, 'oval-wall', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    for (let i = 0; i < 6; i += 1) {
      const kart = (await step(page, 10)).karts[0]!;
      const p = geometry.project(kart.position);
      expect(Math.abs(p.lateral)).toBeLessThan(geometry.wallOffset(p.width));
    }
  });

  test('oval-overview loads the top-down view without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await loadScenario(page, 'oval-overview', { paused: true });
    expect((await getState(page)).trackId).toBe('test-oval');
    expect(errors).toEqual([]);
  });
});
