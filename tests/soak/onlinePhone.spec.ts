import { devices, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { autopilotAll, stepAll } from '../e2e/online';
import { openBadRoom } from './room';

/**
 * Phone check (MK-73): can a mid-range phone's CPU keep an online race at ≥ 30 fps on every real
 * track? One client of a 4-player room on the bad network (200 ms RTT, 50 ms jitter, 8 % loss)
 * runs on a Pixel 7 landscape profile with its CPU throttled 4× (Chrome DevTools' "mid-range
 * mobile"), predicting and re-simulating at real speed, while the host and the other clients race
 * alongside it.
 *
 * Method: a machine without a GPU draws WebGL with SwiftShader on the CPU, and DevTools throttling
 * also multiplies the time the page waits for it, so frame rate itself only measures SwiftShader
 * here (~10 fps unthrottled at this size in CI's image). So the page is stepped instead, and each
 * part of a frame's main-thread work is timed on the throttled CPU:
 * - `tickMs`: one tick of the client (prediction, input packet, smoothing, HUD state), 60 a second;
 * - `snapshotMs`: handling one snapshot (apply, compare, re-simulate: the netdebug average), 20 a
 *   second;
 * - `renderMs`: one drawn frame's JavaScript (the game's requestAnimationFrame callback: scene
 *   update and three.js submitting ~85 draw calls; the GPU's work happens after it), one per frame.
 * The CPU's frame rate is then (1000 ms − 60 × tickMs − 20 × snapshotMs) / renderMs.
 */

const PIXEL = devices['Pixel 7 landscape'];
const TRACKS = ['sunny-circuit', 'dune-canyon', 'frostpeak-pass'];
/** 4× CPU throttle: Chrome DevTools' "mid-range mobile" preset. */
const THROTTLE = 4;
/** Seconds of racing measured, after the countdown and a few seconds to settle. */
const MEASURE_SECONDS = 20;
const SETTLE_TICKS = 6 * 60;
const MIN_FPS = 30;
/** Real speed: 3 ticks per 50 ms (the network lag is real time). */
const CHUNK = 3;
const ROUND_MS = 50;
/** Draw every this many rounds (drawing every round would queue SwiftShader work up). */
const DRAW_EVERY = 4;

function median(values: number[], q = 0.5): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

/** A drawn frame's callback takes at least this long, ms (the paused loop's idle ones don't). */
const DRAWN_FRAME_MS = 0.5;

/** Times every requestAnimationFrame callback of the context's pages, ms. */
async function timeFrames(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __frameMs: number[] };
    w.__frameMs = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        const start = performance.now();
        callback(time);
        w.__frameMs.push(performance.now() - start);
      });
  });
}

/**
 * Steps the phone's page `CHUNK` ticks (timed, ms per tick) and, if `draw`, asks for a redraw
 * (its next animation frames draw the race, timed by `timeFrames`).
 */
function stepPhone(page: Page, draw: boolean): Promise<number> {
  return page.evaluate(
    ([ticks, redraw]) => {
      const game = window.__game!;
      const start = performance.now();
      game.step(ticks, { render: false });
      const tickMs = (performance.now() - start) / ticks;
      if (redraw) game.step(0, { render: true });
      return tickMs;
    },
    [CHUNK, draw] as const,
  );
}

test.describe('online phone check (MK-73)', () => {
  for (const track of TRACKS) {
    test(`a 4×-throttled Pixel 7 client's CPU keeps ≥ ${MIN_FPS} fps online on ${track}`, async ({
      browser,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'CPU throttling is a Chrome DevTools feature');
      test.setTimeout(480_000);
      const context = await browser.newContext({
        viewport: PIXEL.viewport,
        deviceScaleFactor: PIXEL.deviceScaleFactor,
        isMobile: PIXEL.isMobile,
        hasTouch: PIXEL.hasTouch,
        userAgent: PIXEL.userAgent,
      });
      await timeFrames(context);
      const room = await openBadRoom(context, 4, `phone-${track}-${Date.now()}`, {
        scenario: `net-bad-4p-${track}`,
        laps: 3,
        netdebug: true,
      });
      const phone = room.clients[0]!;
      const others = room.pages.filter((p) => p !== phone);
      await autopilotAll(room.pages);
      const cdp = await context.newCDPSession(phone);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

      const ticks: number[] = [];
      const rounds = SETTLE_TICKS / CHUNK + (MEASURE_SECONDS * 60) / CHUNK;
      for (let round = 0; round < rounds; round += 1) {
        const started = Date.now();
        await stepAll(others, CHUNK);
        const settled = round >= SETTLE_TICKS / CHUNK;
        if (round === SETTLE_TICKS / CHUNK) {
          await phone.evaluate(() => {
            (window as unknown as { __frameMs: number[] }).__frameMs.length = 0;
          });
        }
        const tickMs = await stepPhone(phone, round % DRAW_EVERY === 0);
        if (settled) ticks.push(tickMs);
        const wait = ROUND_MS - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }

      const overlay = await phone.evaluate(() => {
        void window.__game!.step(0);
        return document.querySelector('[data-testid="net-debug"]')?.textContent ?? '';
      });
      const snapshotMs = Number(/snapshot ([\d.]+) ms/.exec(overlay)?.[1] ?? NaN);
      const state = await phone.evaluate(() => window.__game!.getState());
      const renders = (
        await phone.evaluate(() => (window as unknown as { __frameMs: number[] }).__frameMs)
      ).filter((ms) => ms >= DRAWN_FRAME_MS);
      const tickMs = ticks.reduce((a, b) => a + b, 0) / ticks.length;
      const renderMs = median(renders);
      const busyPerSecond = 60 * tickMs + 20 * snapshotMs;
      const cpuFps = (1000 - busyPerSecond) / renderMs;
      console.log(
        `${track} at ${THROTTLE}× CPU: tick ${tickMs.toFixed(2)} ms (p95 ` +
          `${median(ticks, 0.95).toFixed(2)}), snapshot ${snapshotMs.toFixed(2)} ms, draw ` +
          `${renderMs.toFixed(1)} ms (p95 ${median(renders, 0.95).toFixed(1)}) → sim + net ` +
          `${busyPerSecond.toFixed(0)} ms/s, CPU frame rate ${cpuFps.toFixed(0)} fps ` +
          `(frame at 30 fps: ${(busyPerSecond / 30 + renderMs).toFixed(1)} ms of 33.3)\n${overlay}`,
      );
      expect(state.phase).toBe('racing');
      expect(Number.isFinite(snapshotMs)).toBe(true);
      expect(cpuFps).toBeGreaterThanOrEqual(MIN_FPS);
      await context.close();
    });
  }
});
