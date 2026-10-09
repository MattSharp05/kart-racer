import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-124: Thwomps. In CI on the synthetic test ramp's Thwomp (no pack needed); Thwomp Ruins itself
// on the real MK8 pack, local only (ADR 0009): `MK8_OUT=<pack> pnpm test:e2e tests/e2e/mk8Ruins.spec.ts`.
const PACK = process.env.MK8_OUT;

/** TDD v3's per-course budgets at the grid (desktop), as for the other Mushroom Cup courses. */
const DRAW_CALL_BUDGET = 320;
const TRIANGLE_BUDGET = 400_000;

/** Steps kart 0 under `input` until it's flattened (or `ticks` run): whether, when, and where. */
function runUnderThwomp(page: Page, throttle: number, ticks: number) {
  return page.evaluate(
    ({ throttle, ticks }) => {
      const game = window.__game!;
      game.setInput(0, { throttle });
      for (let i = 0; i < ticks; i += 1) {
        const kart = game.step(1).karts[0]!;
        if (kart.squashTimer !== undefined)
          return { squashed: true, tick: game.getState().tick, speed: kart.speed };
      }
      return {
        squashed: false,
        tick: game.getState().tick,
        speed: game.getState().karts[0]!.speed,
      };
    },
    { throttle, ticks },
  );
}

test.describe('Thwomps (MK-124)', () => {
  test('mk8-test-thwomp: left under it, the kart is flattened as it lands, then drives on', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-test-thwomp', { paused: true });
    expect((await getState(page)).trackId).toBe('mk8-test-thwomp');
    await page.evaluate(() => window.__game!.step(1, { render: true }));
    const squash = await runUnderThwomp(page, 0, 180);
    expect(squash).toMatchObject({ squashed: true, speed: 0 });
    expect(squash.tick).toBeGreaterThan(100);
    // Drawn flat (and the scene draws without errors while it is).
    await page.evaluate(() => window.__game!.step(1, { render: true }));
    // Over after 1.5 s: the throttle gets it going again.
    const after = await page.evaluate(() => {
      const game = window.__game!;
      game.setInput(0, { throttle: 1 });
      const kart = game.step(150).karts[0]!;
      return { squashTimer: kart.squashTimer ?? null, speed: kart.speed };
    });
    expect(after.squashTimer).toBeNull();
    expect(after.speed).toBeGreaterThan(5);
  });

  test('mk8-test-thwomp: driving straight out from under it escapes', async ({ page }) => {
    await loadScenario(page, 'mk8-test-thwomp', { paused: true });
    expect(await runUnderThwomp(page, 1, 180)).toMatchObject({ squashed: false });
  });

  for (const name of ['mk8-ruins-race', 'mk8-ruins-thwomp']) {
    test(`${name} without a pack shows "MK8 pack not installed"`, async ({ page }) => {
      test.skip(!!PACK, 'the pack is installed');
      await loadScenario(page, name);
      await expect(page.locator('.menu-mk8NotInstalled')).toContainText('MK8 pack not installed');
    });
  }
});

test.describe('Thwomp Ruins on the real pack (MK-124, local only)', () => {
  test.skip(!PACK, 'needs the real MK8 pack: MK8_OUT=<pack>');
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    await servePack(page, { dir: PACK });
  });

  test('mk8-ruins-race: within the draw and triangle budgets at the grid; the player finishes 3 laps', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ruins-race', { paused: true });
    const state = await getState(page);
    expect(state.trackId).toBe('mk8-ruins');
    await page.evaluate(() => window.__game!.step(1, { render: true }));
    const info = await page.evaluate(() => window.__game!.renderInfo());
    console.log(`Thwomp Ruins at the grid: ${info.calls} draw calls, ${info.triangles} triangles`);
    expect(info.calls).toBeLessThan(DRAW_CALL_BUDGET);
    expect(info.triangles).toBeLessThan(TRIANGLE_BUDGET);
    const result = await page.evaluate(() => {
      const game = window.__game!;
      game.setAutopilot(0, true);
      // A lap takes the autopilot about 75 s (MK-128: the traced lap at 3× scale).
      for (let tick = 0; tick < 280 * 60; tick += 60) {
        if (game.step(60).karts[0]!.race.finishTick !== undefined) break;
      }
      const kart = game.getState().karts[0]!;
      return { finished: kart.race.finishTick !== undefined, laps: kart.race.lapTimes.length };
    });
    expect(result).toEqual({ finished: true, laps: 3 });
  });

  test('mk8-ruins-wall: through the anti-gravity tunnel and up the spiral, then off on the glider', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ruins-wall', { paused: true });
    const seen = await page.evaluate(() => {
      const game = window.__game!;
      game.setAutopilot(0, true);
      let antigrav = false;
      let glide = false;
      for (let i = 0; i < 200 && !(antigrav && glide); i += 1) {
        const kart = game.step(15).karts[0]!;
        antigrav ||= kart.antigrav === true;
        glide ||= kart.glide !== undefined;
      }
      return { antigrav, glide };
    });
    expect(seen).toEqual({ antigrav: true, glide: true });
  });

  test('mk8-ruins-free: the flooded channel is under water', async ({ page }) => {
    await loadScenario(page, 'mk8-ruins-free', { paused: true });
    const water = await page.evaluate(() => {
      const game = window.__game!;
      game.setAutopilot(0, true);
      for (let i = 0; i < 300; i += 1) if (game.step(15).karts[0]!.inWater === true) return true;
      return false;
    });
    expect(water).toBe(true);
  });
});
