import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/** Screenshot tests: chromium only, run in the Playwright Docker image in CI so pixels match. */
export default defineConfig({
  ...base,
  testDir: 'tests/visual',
  testIgnore: [],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  projects: [
    { name: 'visual-chrome', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile/ },
    // Touch controls (MK-23) on phones.
    { name: 'visual-iphone', use: { ...devices['iPhone 15 landscape'] }, testMatch: /mobile/ },
    { name: 'visual-pixel', use: { ...devices['Pixel 7 landscape'] }, testMatch: /mobile/ },
  ],
});
