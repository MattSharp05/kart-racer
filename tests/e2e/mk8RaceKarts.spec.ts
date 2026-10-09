import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-136: MK8 races draw each racer's pack model in its loadout's kart (the synthetic fixture pack
// here), loaded with the race; without a pack the primitive stand-ins drive.

/** TDD v3's per-course draw call budget at the grid (desktop). */
const DRAW_CALL_BUDGET = 300;

const built = (page: Page) => page.evaluate(() => window.__mk8?.raceKarts?.built() ?? []);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

test.describe('MK8 racers in races (MK-136)', () => {
  test('mk8-test-race with the pack: all 8 karts are the racers’ models, within the draw budget', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const { requested } = await servePack(page);
    await loadScenario(page, 'mk8-test-race', { paused: true });
    const state = await getState(page);
    expect(state.karts).toHaveLength(8);
    // Loaded with the race: the models are there before its first frame.
    expect(requested.filter((p) => p.startsWith('models/racers/')).length).toBeGreaterThan(0);
    await page.evaluate(() => window.__game!.step(1, { render: true }));
    const racers = state.karts.map((k) => k.kartType);
    expect((await built(page)).slice(0, 8).sort()).toEqual([...racers].sort());
    const info = await page.evaluate(() => window.__game!.renderInfo());
    expect(info.calls).toBeLessThan(DRAW_CALL_BUDGET);
    // They drive: a second of racing, drawn, with no errors.
    await page.evaluate(() => {
      window.__game!.setAutopilot(0, true);
      window.__game!.step(240, { render: true });
    });
    expect(errors).toEqual([]);
  });

  test('without a pack the race draws the stand-ins, with no errors', async ({ page }) => {
    const errors = watchErrors(page);
    await loadScenario(page, 'mk8-test-race', { paused: true });
    await page.evaluate(() => window.__game!.step(60, { render: true }));
    expect(await built(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

// With the real pack (local only, ADR 0009): `MK8_OUT=<pack> pnpm test:e2e tests/e2e/mk8RaceKarts.spec.ts`.
const PACK = process.env.MK8_OUT;

test.describe('MK8 racers in races on the real pack (MK-136, local only)', () => {
  test.skip(!PACK, 'needs the real MK8 pack: MK8_OUT=<pack>');
  test.setTimeout(180_000);

  for (const quality of ['full', 'low'] as const) {
    test(`mk8-stadium-race (${quality} quality): 8 MK8 racers in their karts, within the budget`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      const { requested } = await servePack(page, { dir: PACK });
      await page.goto(
        `/?scenario=mk8-stadium-race&paused=1${quality === 'low' ? '&quality=low' : ''}`,
      );
      await page.waitForFunction(() => window.__game?.ready === true);
      await page.evaluate(() => window.__game!.whenReady());
      const state = await getState(page);
      expect(state.karts.every((k) => k.kartType.startsWith('mk8-'))).toBe(true);
      await page.evaluate(() => window.__game!.step(1, { render: true }));
      expect((await built(page)).slice(0, 8).sort()).toEqual(
        state.karts.map((k) => k.kartType).sort(),
      );
      const racerFiles = requested.filter((p) => p.startsWith('models/racers/'));
      if (quality === 'low') expect(racerFiles.every((p) => p.endsWith('-low.glb'))).toBe(true);
      const info = await page.evaluate(() => window.__game!.renderInfo());
      console.log(
        `Stadium grid (${quality}), real karts: ${info.calls} calls, ${info.triangles} tris`,
      );
      expect(info.calls).toBeLessThan(DRAW_CALL_BUDGET);
      await page.evaluate(() => {
        window.__game!.setAutopilot(0, true);
        window.__game!.step(600, { render: true });
      });
      expect(errors).toEqual([]);
    });
  }
});
