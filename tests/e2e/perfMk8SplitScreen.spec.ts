import { expect, test, type Page } from '@playwright/test';
import { step } from './helpers';
import { servePack } from './mk8';

/**
 * MK8 split-screen budgets (MK-148): 4 players' views on an MK8 course. Every view draws the
 * whole course and field (MK8's post-processing is off in split-screen, and 3–4 views step quality
 * down: pixel ratio ≤ 1, low-quality mode), so draw calls and triangles add up over the views.
 * CI checks the synthetic test ramp with the fixture pack's racers, karts and items (ADR 0009);
 * Mario Kart Stadium runs locally on the real pack:
 * `MK8_OUT=<pack> pnpm exec playwright test tests/e2e/perfMk8SplitScreen.spec.ts`.
 *
 * Per view, a split frame may cost at most `MAX_CALLS_PER_VIEW` × the 1-view race's draw calls
 * (a view draws nearly what the whole screen did, a little less off its narrower frustum), and the
 * whole 4-view frame at most `frameRatio` × the 1-view frame's time on the same machine (CI
 * draws WebGL in software: absolute frame times there measure SwiftShader). Budgets from the
 * measured baseline (MK-148 Test report: the test ramp's 4 views peaked at 285 draw calls and 75k
 * triangles against 94 and 20k for 1 view, the frame 1.9× as long).
 */
const PACK = process.env.MK8_OUT;
/** Ticks stepped before each sample: the grid in countdown, just after GO, then along lap 1. */
const SAMPLE_STEPS = [0, 250, 300, 300, 300];
const VIEWS = 4;
const MAX_CALLS_PER_VIEW = 1.1;

interface Budget {
  calls: number;
  triangles: number;
  frameRatio: number;
}

/** The test ramp's 4 views, with the fixture pack. */
const RAMP: Budget = { calls: 400, triangles: 120_000, frameRatio: 3 };
/** Stadium's: TDD v3's MK8 course budget per view (`perfAllTracks.spec.ts`), times the views. */
const STADIUM: Budget = { calls: 300 * VIEWS, triangles: 400_000 * VIEWS, frameRatio: 4 };
/** Frames timed per measurement (after a few to settle). */
const TIMED_FRAMES = 60;
const PROJECTS = ['desktop-chrome'];

interface Sample {
  tick: number;
  calls: number;
  triangles: number;
}

async function open(page: Page, scenario: string): Promise<void> {
  await page.goto(`/?scenario=${scenario}&paused=1`);
  await page.waitForFunction(() => window.__game?.ready === true);
  await page.evaluate(() => window.__game!.whenReady());
  await page.evaluate(() => {
    const game = window.__game!;
    game.getState().slotKarts.forEach((_, slot) => game.setAutopilot(slot, true));
  });
}

async function sample(page: Page): Promise<Sample[]> {
  const samples: Sample[] = [];
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

/** Mean real frame time (ms) of the running race, measured over `TIMED_FRAMES` frames. */
async function frameMs(page: Page): Promise<number> {
  return page.evaluate(async (count) => {
    const game = window.__game!;
    game.resume();
    const times: number[] = [];
    await new Promise<void>((done) => {
      let last = 0;
      let seen = 0;
      const frame = (time: number) => {
        seen += 1;
        if (seen > 10) times.push(time - last);
        last = time;
        if (times.length >= count) done();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    game.pause();
    return times.reduce((a, b) => a + b, 0) / times.length;
  }, TIMED_FRAMES);
}

/** The 1-view race, then the 4-view one: their samples and frame times, logged and checked. */
async function compare(page: Page, single: string, split: string, budget: Budget): Promise<void> {
  await open(page, single);
  const one = await sample(page);
  const oneMs = await frameMs(page);
  await open(page, split);
  const four = await sample(page);
  const { views, steppedDown } = await page.evaluate(() => window.__game!.renderInfo());
  expect(views).toHaveLength(VIEWS);
  expect(steppedDown).toBe(true);
  const fourMs = await frameMs(page);
  console.log(
    `${split}: ${JSON.stringify(four)}, frame ${fourMs.toFixed(1)} ms; ${single}: ${JSON.stringify(one)}, frame ${oneMs.toFixed(1)} ms`,
  );
  const mostCalls = Math.max(...one.map((s) => s.calls));
  four.forEach((s) => {
    expect(s.calls, `draw calls at tick ${s.tick}`).toBeLessThan(budget.calls);
    expect(s.calls, `draw calls at tick ${s.tick} vs 1 view`).toBeLessThanOrEqual(
      Math.ceil(mostCalls * VIEWS * MAX_CALLS_PER_VIEW),
    );
    expect(s.triangles, `triangles at tick ${s.tick}`).toBeLessThan(budget.triangles);
  });
  expect(fourMs, 'mean 4-view frame time vs 1 view').toBeLessThan(oneMs * budget.frameRatio);
}

test.describe('MK8 split-screen perf budgets (MK-148)', () => {
  test('mk8-local-4p on the test ramp (fixture pack): within budget, and per view about 1 view’s draw calls', async ({
    page,
  }, info) => {
    test.skip(!PROJECTS.includes(info.project.name), 'budgets are device-independent');
    test.setTimeout(120_000);
    await servePack(page);
    await compare(page, 'mk8-test-race', 'mk8-local-4p', RAMP);
  });

  test('mk8-stadium-4p on the real pack: within budget, frame time ≤ 4× the 1-view race (local only)', async ({
    page,
  }, info) => {
    test.skip(!PACK, 'needs the real MK8 pack: MK8_OUT=<pack>');
    test.skip(!PROJECTS.includes(info.project.name), 'budgets are device-independent');
    test.setTimeout(300_000);
    await servePack(page, { dir: PACK });
    await compare(page, 'mk8-stadium-race', 'mk8-stadium-4p', STADIUM);
  });
});
