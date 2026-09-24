import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from './quality';

function run(q: AdaptiveQuality, fps: number, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / fps) q.frame(1 / fps);
}

describe('adaptive quality', () => {
  it('drops the pixel ratio step by step when frames are slow, never below 1', () => {
    const applied: number[] = [];
    const q = new AdaptiveQuality(2, (r) => applied.push(r));
    run(q, 40, 10);
    expect(applied[0]).toBe(1.75);
    expect(q.pixelRatio).toBe(1);
  });

  it('switches on low-quality mode after 3 s under 45 fps, and not before', () => {
    const q = new AdaptiveQuality(2, () => {});
    run(q, 30, 2.5);
    expect(q.lowQuality).toBe(false);
    run(q, 30, 1.6);
    expect(q.lowQuality).toBe(true);
  });

  it('raises the pixel ratio back when frames are fast, up to the device ratio (max 2)', () => {
    const q = new AdaptiveQuality(3, () => {});
    run(q, 48, 6); // slow enough to drop resolution, not slow enough for low-quality mode
    run(q, 60, 10);
    expect(q.pixelRatio).toBe(2);
    expect(q.lowQuality).toBe(false);
  });

  it('ignores pauses and one-off hitches', () => {
    const q = new AdaptiveQuality(2, () => {});
    q.frame(0);
    q.frame(0.5);
    expect(q.pixelRatio).toBe(2);
  });
});
