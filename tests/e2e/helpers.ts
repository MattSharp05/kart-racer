import type { Page } from '@playwright/test';
import type { InputFrame } from '../../src/sim/types';
import type { TestState } from '../../src/game/testApi';

export interface LoadOptions {
  seed?: number;
  paused?: boolean;
}

/** Opens the game in a scenario and waits until `window.__game` is ready. */
export async function loadScenario(page: Page, name: string, options: LoadOptions = {}) {
  const params = new URLSearchParams({ scenario: name });
  if (options.seed !== undefined) params.set('seed', String(options.seed));
  if (options.paused) params.set('paused', '1');
  await page.goto(`/?${params}`);
  await page.waitForFunction(() => window.__game?.ready === true);
}

export function getState(page: Page): Promise<TestState> {
  return page.evaluate(() => window.__game!.getState());
}

export async function pause(page: Page): Promise<void> {
  await page.evaluate(() => window.__game!.pause());
}

/** Runs exactly `ticks` sim ticks and returns the resulting state. */
export function step(page: Page, ticks: number): Promise<TestState> {
  return page.evaluate((n) => window.__game!.step(n), ticks);
}

export async function setInput(
  page: Page,
  kartId: number,
  frame: Partial<InputFrame> | null,
): Promise<void> {
  await page.evaluate(([id, f]) => window.__game!.setInput(id, f), [kartId, frame] as const);
}

/** First launch (MK-42): fills in the Nickname screen so the plain URL goes on to the title. */
export async function enterNickname(page: Page, nickname = 'Tester'): Promise<void> {
  await page.locator('.nickname-input').fill(nickname);
  await page.locator('.menu-nickname button.primary').click();
}
