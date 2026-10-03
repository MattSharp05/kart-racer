import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario } from './helpers';

// MK-105: racing on an MK8 mesh course. In CI on the synthetic test ramp (no Nintendo asset): a
// race from the countdown where the player, on the route autopilot, finishes 3 laps with laps and
// positions counted; Mario Kart Stadium's scenarios without a pack say so. With the real pack
// (local only) `mk8Stadium.spec.ts` drives Stadium itself.

/** Steps the race `ticks` at a time (rendering now and then) until kart 0 finishes, or gives up. */
async function raceToFinish(page: Page, maxSeconds: number) {
  return page.evaluate((limit) => {
    const game = window.__game!;
    game.setAutopilot(0, true);
    const laps: number[] = [];
    const positions = new Set<number>();
    for (let tick = 0; tick < limit * 60; tick += 60) {
      const state = game.step(60, { render: tick % 600 === 0 });
      const kart = state.karts[0]!;
      if (!laps.includes(kart.race.lap)) laps.push(kart.race.lap);
      positions.add(state.positions.indexOf(0) + 1);
      if (kart.race.finishTick !== undefined) break;
    }
    const state = game.getState();
    const kart = state.karts[0]!;
    return {
      finished: kart.race.finishTick !== undefined,
      lapTimes: kart.race.lapTimes.length,
      laps,
      positionsSeen: positions.size,
      phase: state.phase,
      sorted: [...state.positions].sort(),
    };
  }, maxSeconds);
}

test.describe('MK8 course racing (MK-105)', () => {
  test('mk8-test-race: the player on the autopilot finishes 3 laps; laps and positions count', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-test-race', { paused: true });
    const start = await getState(page);
    expect(start.trackId).toBe('mk8-test-ramp');
    expect(start.phase).toBe('countdown');
    expect(start.karts).toHaveLength(8);
    expect(start.itemSet).toBe('mk8');
    expect(start.entities.filter((e) => e.kind === 'itemBox').length).toBeGreaterThan(0);
    const result = await raceToFinish(page, 240);
    expect(result).toMatchObject({
      finished: true,
      lapTimes: 3,
      laps: [0, 1, 2, 3, 4],
      phase: 'finished',
      sorted: [0, 1, 2, 3, 4, 5, 6, 7],
    });
    expect(result.positionsSeen).toBeGreaterThan(1);
  });

  for (const name of [
    'mk8-stadium-race',
    'mk8-stadium-free',
    'mk8-stadium-antigrav',
    'mk8-stadium-final-lap',
  ]) {
    test(`${name} without a pack shows "MK8 pack not installed"`, async ({ page }) => {
      await loadScenario(page, name);
      await expect(page.locator('.menu-mk8NotInstalled')).toContainText('MK8 pack not installed');
    });
  }
});
