import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/**
 * Opt-in netcode runs (MK-73, `pnpm test:soak`): the 10-race browser soak at `net-bad` and the
 * throttled-phone frame rate check. Too long and too timing-sensitive for CI's parallel runners:
 * run them alone (one worker), ideally in CI's Playwright image, and report the numbers they print.
 */
export default defineConfig({
  ...base,
  testDir: 'tests/soak',
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
