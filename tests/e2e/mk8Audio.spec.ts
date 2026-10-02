// MK8 audio (MK-94): the pipeline's `.m4a` (AAC in MP4) decodes with Web Audio's
// decodeAudioData, Safari included (desktop-webkit project). The fixture is a synthesized sine
// converted by tools/mk8/audio.ts (`convertAudio`), never a game file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'mk8-sine.m4a');

test('a pipeline .m4a decodes with decodeAudioData', async ({ page }) => {
  await page.goto('/dev.html');
  const base64 = readFileSync(FIXTURE).toString('base64');
  const decoded = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const context = new OfflineAudioContext(1, 44100, 44100);
    const buffer = await context.decodeAudioData(bytes.buffer);
    let peak = 0;
    for (const sample of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(sample));
    return { channels: buffer.numberOfChannels, seconds: buffer.duration, peak };
  }, base64);
  expect(decoded.channels).toBe(1);
  // 0.5 s tone, the 0.25 s of silence on each side trimmed by the pipeline.
  expect(decoded.seconds).toBeGreaterThan(0.45);
  expect(decoded.seconds).toBeLessThan(0.6);
  expect(decoded.peak).toBeGreaterThan(0.3);
});
