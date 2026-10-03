import { test } from '@playwright/test';
import { HUD_SHOTS, hudShot } from './mk8Hud';

// MK-127: the MK8 race HUD on a phone, around the touch controls.
for (const [name, ticks, shot] of HUD_SHOTS) {
  test(`${shot} on phones (paused)`, async ({ page }, info) => {
    await hudShot(page, name, ticks, `${shot}-${info.project.name}.png`);
  });
}
