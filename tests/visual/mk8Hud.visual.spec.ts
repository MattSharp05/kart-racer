import { test } from '@playwright/test';
import { HUD_SHOTS, hudShot } from './mk8Hud';

// MK-127: MK8 Mode's race HUD, paused (the real sprites are checked locally with the pack).
for (const [name, ticks, shot] of HUD_SHOTS) {
  test(`${shot} (paused)`, async ({ page }) => {
    await hudShot(page, name, ticks, `${shot}.png`);
  });
}
