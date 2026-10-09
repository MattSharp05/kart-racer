import { expect, test, type Page } from '@playwright/test';
import { loadScenario, step } from './helpers';

/**
 * Split-screen budgets (MK-145): 4 players' views on every original track. Every view draws the
 * whole scene, so draw calls and triangles add up over the views (the quality step-down for 3–4
 * views keeps them in budget). Sampled like `perfAllTracks.spec.ts`: on the grid, just after GO,
 * then along lap 1, every kart on its autopilot.
 *
 * Frame time: CI draws WebGL in software, so absolute fps there measures SwiftShader. The check is
 * relative instead: a 4-view frame may take at most `MAX_FRAME_RATIO` × the same track's 1-view
 * frame on the same machine. Budgets from the measured baseline (MK-145 Test report).
 *
 * Software GL is slow on the busiest tracks: on Canopy Rush in CI's image a 4-view frame takes
 * ~650 ms (1 view ~250 ms), and SwiftShader spreads every page over all the cores, so two of these
 * tests side by side (Canopy Rush and Neon Harbour on main) each ran several times slower and
 * overran 90 s. The tests run one after another in one worker and time 20 frames; alone, Canopy
 * Rush takes ~60 s. Neon Harbour (most draw calls) sits closest to the ratio: 3.0–3.5× over
 * three runs in CI's image beside a busy second worker (Canopy Rush 2.3–2.4×, the rest ≤ 2.2×).
 */
const TRACKS = [
  'sunny-circuit',
  'dune-canyon',
  'frostpeak-pass',
  'neon-harbour',
  'canopy-rush',
  'cog-works',
];
/** Per-frame budgets for all 4 views together. */
const MAX_CALLS = 300;
const MAX_TRIANGLES = 540_000;
const MAX_FRAME_RATIO = 3.5;
const SAMPLE_STEPS = [0, 250, 300, 600, 600];
/** Frames timed per measurement, after `SETTLE_FRAMES` untimed ones. */
const TIMED_FRAMES = 20;
const SETTLE_FRAMES = 3;
/** Two scenario loads, 1,750 stepped ticks and ~50 software-GL frames: up to 2 min in CI's image. */
const TEST_TIMEOUT_MS = 240_000;
const PROJECTS = ['desktop-chrome'];

function splitScenario(track: string): string {
  return track === 'sunny-circuit' ? 'local-4p' : `local-4p-${track}`;
}

/** Mean real frame time (ms) of the running race, measured over `TIMED_FRAMES` frames. */
async function frameMs(page: Page): Promise<number> {
  return page.evaluate(
    async ({ count, settle }) => {
      const game = window.__game!;
      game.resume();
      const times: number[] = [];
      await new Promise<void>((done) => {
        let last = 0;
        let seen = 0;
        const frame = (time: number) => {
          seen += 1;
          if (seen > settle) times.push(time - last);
          last = time;
          if (times.length >= count) done();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      game.pause();
      return times.reduce((a, b) => a + b, 0) / times.length;
    },
    { count: TIMED_FRAMES, settle: SETTLE_FRAMES },
  );
}

async function sample(page: Page) {
  const samples: { tick: number; calls: number; triangles: number }[] = [];
  for (const ticks of SAMPLE_STEPS) {
    const state = await step(page, ticks);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const { calls, triangles } = await page.evaluate(() => window.__game!.renderInfo());
    samples.push({ tick: state.tick, calls, triangles });
  }
  return samples;
}

test.describe('split-screen perf budgets on every track (MK-145)', () => {
  // In order in one worker (not `serial`: a failing track doesn't skip the rest).
  test.describe.configure({ mode: 'default' });
  for (const track of TRACKS) {
    test(
      `4 views on ${track}: within ${MAX_CALLS} draw calls, ${MAX_TRIANGLES / 1000}k triangles and ${MAX_FRAME_RATIO}× the 1-view frame time`,
      // Sunny Circuit on every PR; the other tracks on main (like perfAllTracks).
      track === 'sunny-circuit' ? {} : { tag: '@full' },
      async ({ page }, info) => {
        test.skip(!PROJECTS.includes(info.project.name), 'budgets are device-independent');
        test.setTimeout(TEST_TIMEOUT_MS);
        await loadScenario(page, `track-${track}`, { paused: true });
        await page.evaluate(() => window.__game!.setAutopilot(0, true));
        await step(page, 300);
        const single = await frameMs(page);

        await loadScenario(page, splitScenario(track), { paused: true });
        await page.evaluate(() => window.__game!.setAutopilot(0, true));
        const samples = await sample(page);
        const { views, steppedDown } = await page.evaluate(() => window.__game!.renderInfo());
        expect(views).toHaveLength(4);
        expect(steppedDown).toBe(true);
        const split = await frameMs(page);
        console.log(
          `${track} 4 views: ${JSON.stringify(samples)}; frame ${split.toFixed(1)} ms vs 1 view ${single.toFixed(1)} ms`,
        );
        for (const s of samples) {
          expect(s.calls, `draw calls at tick ${s.tick}`).toBeLessThan(MAX_CALLS);
          expect(s.triangles, `triangles at tick ${s.tick}`).toBeLessThan(MAX_TRIANGLES);
        }
        expect(split, 'mean 4-view frame time vs 1 view').toBeLessThan(single * MAX_FRAME_RATIO);
      },
    );
  }
});
