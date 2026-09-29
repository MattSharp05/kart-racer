import { expect, test } from '@playwright/test';
import { loadScenario, step } from './helpers';

/**
 * Draw-call and triangle budgets on every race track (MK-71). Unlike frame rate (CI draws WebGL in
 * software, so fps there measures SwiftShader), these are the same on every machine. The heaviest
 * frames are at the start, with the whole pack in view, so the race is sampled on the grid, just
 * after GO and then through the first lap; every sample must stay within budget.
 * The throttled-phone frame-time check is opt-in: `tests/soak/phoneAllTracks.spec.ts`.
 */
const TRACKS = [
  'sunny-circuit',
  'dune-canyon',
  'frostpeak-pass',
  'neon-harbour',
  'canopy-rush',
  'cog-works',
];
/** Per-frame budgets (docs/TDD.md → Perf): draw calls and triangles. */
const MAX_CALLS = 150;
const MAX_TRIANGLES = 150_000;
/** Ticks stepped before each sample: the grid in countdown, just after GO, then along lap 1. */
const SAMPLE_STEPS = [0, 250, 300, 600, 600];
/** Draw calls and triangles are the same at any size; these run where drawing is quick. */
const PROJECTS = ['desktop-chrome', 'pixel-landscape'];

test.describe('perf budgets on every track (MK-71)', { tag: '@full' }, () => {
  for (const track of TRACKS) {
    test(`track-${track}: every sampled frame stays within ${MAX_CALLS} draw calls and ${MAX_TRIANGLES / 1000}k triangles`, async ({
      page,
    }, info) => {
      test.skip(!PROJECTS.includes(info.project.name), 'budgets are device-independent');
      test.setTimeout(60_000);
      await loadScenario(page, `track-${track}`, { paused: true });
      await page.evaluate(() => window.__game!.setAutopilot(0, true));
      const samples: { tick: number; calls: number; triangles: number }[] = [];
      for (const ticks of SAMPLE_STEPS) {
        const state = await step(page, ticks);
        // Let a real frame draw so renderer.info describes this moment.
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        );
        const { calls, triangles } = await page.evaluate(() => window.__game!.renderInfo());
        samples.push({ tick: state.tick, calls, triangles });
      }
      console.log(`${track} (${info.project.name}): ${JSON.stringify(samples)}`);
      for (const sample of samples) {
        expect(sample.calls, `draw calls at tick ${sample.tick}`).toBeLessThan(MAX_CALLS);
        expect(sample.triangles, `triangles at tick ${sample.tick}`).toBeLessThan(MAX_TRIANGLES);
      }
    });
  }
});
