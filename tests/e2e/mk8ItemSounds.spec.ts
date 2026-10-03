import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario, step } from './helpers';
import { servePack } from './mk8';

// MK-129: MK8 races' item sounds and AI item use, on the synthetic test ramp. The fixture pack's
// item sounds are a synthesized sine (no Nintendo audio); `window.__mk8.sounds` records every MK8
// sound asked for. Without the pack the same race plays our synth's sounds instead.

const sounds = (page: Page) => page.evaluate(() => [...(window.__mk8?.sounds ?? [])]);
const itemSounds = async (page: Page) =>
  (await sounds(page)).filter((id) => id.startsWith('items/'));

function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('mk8-race-all-items: the AI use their items, each sounding from the pack', async ({
  page,
}) => {
  const errors = pageErrors(page);
  const pack = await servePack(page);
  await loadScenario(page, 'mk8-race-all-items', { paused: true });
  expect(pack.requested).toContain('audio/items/shell-throw.m4a');
  const start = await getState(page);
  expect(start.karts.every((k) => k.controller === 'ai')).toBe(true);
  expect(start.karts.every((k) => k.item.held !== null)).toBe(true);

  await step(page, 8 * 60);
  const heard = await itemSounds(page);
  expect(heard).toEqual(
    expect.arrayContaining(['items/mushroom-use', 'items/banana-drop', 'items/shell-throw']),
  );
  expect(errors).toEqual([]);
});

test('without the pack, the race runs and our synth plays the item sounds', async ({ page }) => {
  const errors = pageErrors(page);
  await loadScenario(page, 'mk8-race-all-items', { paused: true });
  const state = await step(page, 4 * 60);
  expect(state.karts.some((k) => k.item.held === null)).toBe(true);
  expect(await itemSounds(page)).toEqual([]);
  expect(errors).toEqual([]);
});
