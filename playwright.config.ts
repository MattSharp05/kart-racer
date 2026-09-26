import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/**
 * Online specs (MK-46) run on the desktop projects only: BroadcastChannel links pages of one
 * browser, and the phone/tablet projects add nothing to netcode coverage.
 *
 * They run in their own projects, one test at a time (MK-80): each is 2–4 software-GL pages racing
 * in real time, and two of them side by side on a 2–4 core CI runner starved each other's pages
 * (lost heartbeats, overlays that never updated, 300 s timeouts). CI runs each `*-online` project
 * as its own job, so they don't share the runner with the rest of the suite either.
 */
const ONLINE_SPECS = /[\\/]online[^\\/]*\.spec\.ts$/i;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] }, testIgnore: ONLINE_SPECS },
    {
      name: 'desktop-chrome-online',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ONLINE_SPECS,
      workers: 1,
    },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] }, testIgnore: ONLINE_SPECS },
    {
      name: 'desktop-webkit-online',
      use: { ...devices['Desktop Safari'] },
      testMatch: ONLINE_SPECS,
      workers: 1,
    },
    {
      name: 'iphone-landscape',
      use: { ...devices['iPhone 15 landscape'] },
      testIgnore: ONLINE_SPECS,
    },
    {
      name: 'pixel-landscape',
      use: { ...devices['Pixel 7 landscape'] },
      // Software WebGL at this phone's pixel ratio draws ~1 frame a second on the CI runner, and
      // every click waits for frames (~4 s each), so menu flows with many clicks need longer.
      timeout: 60_000,
      testIgnore: ONLINE_SPECS,
    },
    { name: 'ipad', use: { ...devices['iPad (gen 7) landscape'] }, testIgnore: ONLINE_SPECS },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
