import { expect, test, type Page } from '@playwright/test';
import { loadScenario, step } from './helpers';
import { servePack } from './mk8';

// MK-110: racers' voice lines on race events, on the synthetic test ramp. The fixture pack's voice
// lines are a synthesized sine (no Nintendo audio); `window.__mk8.sounds` records every voice line
// asked for (`voice/<racer>/<event>`), with or without the pack.

const voices = (page: Page) =>
  page.evaluate(() => (window.__mk8?.sounds ?? []).filter((id) => id.startsWith('voice/')));

function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('mk8-voices: the boost, fall and hit lines of the karts they happen to', async ({ page }) => {
  const errors = pageErrors(page);
  const pack = await servePack(page);
  await loadScenario(page, 'mk8-voices', { paused: true });
  await step(page, 4 * 60);
  // Mario (the player) boosts on the dash panel and is hit by the banana; Luigi falls nearby.
  expect(await voices(page)).toEqual(['voice/mario/boost', 'voice/luigi/fall', 'voice/mario/hit']);
  // The race's racers' lines load with the race.
  await expect
    .poll(() => pack.requested)
    .toEqual(
      expect.arrayContaining([
        'audio/voices.json',
        'audio/voice/mario/fixture-hit.m4a',
        'audio/voice/luigi/fixture-fall.m4a',
      ]),
    );
  expect(errors).toEqual([]);
});

test('without the pack, the same lines are asked for and stay silent, without errors', async ({
  page,
}) => {
  const errors = pageErrors(page);
  await loadScenario(page, 'mk8-voices', { paused: true });
  await step(page, 4 * 60);
  expect(await voices(page)).toEqual(['voice/mario/boost', 'voice/luigi/fall', 'voice/mario/hit']);
  expect(errors).toEqual([]);
});
