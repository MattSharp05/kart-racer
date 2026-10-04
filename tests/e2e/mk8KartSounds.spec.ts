import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario, setInput, step } from './helpers';
import { servePack } from './mk8';

// MK-111: MK8 races' kart, drift and terrain sounds on the synthetic test ramp. The fixture pack's
// kart sounds are a synthesized sine (no Nintendo audio); `window.__mk8.sounds` records every pack
// sound played, `window.__mk8KartLoops` the engine and terrain loops started and stopped.

const kartSounds = (page: Page) =>
  page.evaluate(() =>
    (window.__mk8?.sounds ?? []).filter((id) => /^(kart|terrain|drift)\//.test(id)),
  );

function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Accelerates, drifts right over the dash panel long enough for blue sparks, before the tunnel. */
async function driveAndDrift(page: Page): Promise<void> {
  await setInput(page, 0, { throttle: 1 });
  await step(page, 30);
  await setInput(page, 0, { throttle: 1, drift: true, steer: 1 });
  await step(page, 1);
  // Steering out of it: a wide drift, clear of the wall.
  await setInput(page, 0, { throttle: 1, drift: true, steer: -1 });
  await step(page, 50);
  await setInput(page, 0, { throttle: 1 });
  await step(page, 20);
}

test('mk8-test-free: the dash panel, drift and sparks sound from the pack', async ({ page }) => {
  const errors = pageErrors(page);
  const pack = await servePack(page);
  await loadScenario(page, 'mk8-test-free', { paused: true });
  await driveAndDrift(page);
  const heard = await kartSounds(page);
  expect(heard).toEqual(
    expect.arrayContaining([
      'kart/standard-kart/boost',
      'drift/start',
      'drift/blue',
      'kart/standard-kart/mini-turbo',
    ]),
  );
  // The bank's kart sounds load with the first race (the samples above only play once loaded).
  expect(pack.requested).toContain('audio/kart/standard-kart/accel.m4a');
  expect(errors).toEqual([]);
});

test('without the pack, our synth plays the kart sounds', async ({ page }) => {
  const errors = pageErrors(page);
  await loadScenario(page, 'mk8-test-free', { paused: true });
  await driveAndDrift(page);
  expect((await getState(page)).karts[0]!.position.x).toBeGreaterThan(14);
  expect(await kartSounds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('once audio starts, the engine loop plays while the race runs and stops when paused', async ({
  page,
}) => {
  await servePack(page);
  await loadScenario(page, 'mk8-test-free');
  // Audio starts on the first key press (a gesture).
  await page.keyboard.press('Shift');
  const loops = () => page.evaluate(() => [...(window.__mk8KartLoops ?? [])]);
  await expect.poll(loops).toContain('start kart/standard-kart/idle');
  await page.evaluate(() => window.__game?.pause());
  await expect.poll(loops).toContain('stop kart/standard-kart/idle');
});
