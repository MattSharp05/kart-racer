import { describe, expect, it } from 'vitest';
import { STEER_MAX_PX, steerFromDrag } from './touch';

describe('steerFromDrag', () => {
  it('is 0 with no drag', () => expect(steerFromDrag(0)).toBe(0));
  it('is analog up to the max', () => {
    expect(steerFromDrag(STEER_MAX_PX / 2)).toBeCloseTo(0.5);
    expect(steerFromDrag(-STEER_MAX_PX / 4)).toBeCloseTo(-0.25);
  });
  it('clamps to ±1 past the max', () => {
    expect(steerFromDrag(STEER_MAX_PX)).toBe(1);
    expect(steerFromDrag(500)).toBe(1);
    expect(steerFromDrag(-500)).toBe(-1);
  });
  it('respects a custom max', () => expect(steerFromDrag(40, 80)).toBeCloseTo(0.5));
});
