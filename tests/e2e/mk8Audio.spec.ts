import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// MK-94: MK8 Mode's AAC `.m4a` decodes with Web Audio (the WebKit projects stand in for Safari).
// The fixture is a synthesized tone encoded by the pipeline (tools/mk8/audio.ts), not game audio.
test('an MK8 pipeline .m4a decodes with decodeAudioData', async ({ page }) => {
  const base64 = readFileSync(new URL('./fixtures/mk8-tone.m4a', import.meta.url)).toString(
    'base64',
  );
  await page.goto('/dev.html');
  const decoded = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const context = new OfflineAudioContext(1, 44_100, 44_100);
    const buffer = await context.decodeAudioData(bytes.buffer);
    let peak = 0;
    for (const v of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
    return { duration: buffer.duration, channels: buffer.numberOfChannels, peak };
  }, base64);
  expect(decoded.channels).toBe(1);
  expect(decoded.duration).toBeGreaterThan(0.4);
  expect(decoded.duration).toBeLessThan(0.7);
  expect(decoded.peak).toBeGreaterThan(0.2);
});
