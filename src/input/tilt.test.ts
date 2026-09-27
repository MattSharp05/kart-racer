import { describe, expect, it } from 'vitest';
import { screenAngle, steerFromTilt, TILT_DEAD_ZONE_DEG, tiltAngle } from './tilt';

const DEFAULTS = { sensitivity: 25, neutral: 0 };

describe('steerFromTilt (MK-54)', () => {
  it('is 0 inside the dead zone around neutral', () => {
    expect(TILT_DEAD_ZONE_DEG).toBe(3);
    expect(steerFromTilt(0, DEFAULTS)).toBe(0);
    expect(steerFromTilt(2.9, DEFAULTS)).toBe(0);
    expect(steerFromTilt(-3, DEFAULTS)).toBe(0);
  });

  it('is linear from the dead zone to full lock at the sensitivity angle', () => {
    expect(steerFromTilt(14, DEFAULTS)).toBeCloseTo(0.5);
    expect(steerFromTilt(-14, DEFAULTS)).toBeCloseTo(-0.5);
    expect(steerFromTilt(25, DEFAULTS)).toBeCloseTo(1);
    expect(steerFromTilt(-25, DEFAULTS)).toBeCloseTo(-1);
  });

  it('follows the sensitivity', () => {
    expect(steerFromTilt(10, { sensitivity: 10, neutral: 0 })).toBeCloseTo(1);
    expect(steerFromTilt(10, { sensitivity: 40, neutral: 0 })).toBeCloseTo(7 / 37);
  });

  it('clamps to −1..1', () => {
    expect(steerFromTilt(60, DEFAULTS)).toBe(1);
    expect(steerFromTilt(-90, DEFAULTS)).toBe(-1);
  });

  it('measures from the calibrated neutral', () => {
    const calibrated = { sensitivity: 25, neutral: 10 };
    expect(steerFromTilt(10, calibrated)).toBe(0);
    expect(steerFromTilt(12, calibrated)).toBe(0);
    expect(steerFromTilt(35, calibrated)).toBeCloseTo(1);
    expect(steerFromTilt(-15, calibrated)).toBeCloseTo(-1);
    expect(steerFromTilt(0, calibrated)).toBeCloseTo(-7 / 22);
  });

  it('never returns NaN', () => {
    expect(steerFromTilt(Number.NaN, DEFAULTS)).toBe(0);
    expect(steerFromTilt(5, { sensitivity: 3, neutral: 0 })).toBe(1);
  });
});

describe('tiltAngle (MK-54)', () => {
  it('landscape 90° (top of the phone on the left): turning right raises beta', () => {
    expect(tiltAngle({ beta: 25, gamma: -40 }, 90)).toBeCloseTo(25);
    expect(tiltAngle({ beta: -10, gamma: -40 }, 90)).toBeCloseTo(-10);
  });

  it('landscape 270° (top on the right): the sign flips', () => {
    expect(tiltAngle({ beta: -25, gamma: 40 }, 270)).toBeCloseTo(25);
    expect(tiltAngle({ beta: 10, gamma: 40 }, 270)).toBeCloseTo(-10);
  });

  it('the same physical right turn steers right in both landscape directions', () => {
    const right90 = steerFromTilt(tiltAngle({ beta: 25, gamma: 0 }, 90), DEFAULTS);
    const right270 = steerFromTilt(tiltAngle({ beta: -25, gamma: 0 }, 270), DEFAULTS);
    expect(right90).toBeCloseTo(1);
    expect(right270).toBeCloseTo(1);
  });

  it('stays steady when the phone tips past upright and beta flips to 180 − beta', () => {
    expect(tiltAngle({ beta: 160, gamma: 80 }, 90)).toBeCloseTo(20);
    expect(tiltAngle({ beta: -170, gamma: 80 }, 90)).toBeCloseTo(-10);
  });

  it('portrait falls back to gamma; no reading is level', () => {
    expect(tiltAngle({ beta: 60, gamma: 12 }, 0)).toBeCloseTo(12);
    expect(tiltAngle({ beta: 60, gamma: 12 }, 180)).toBeCloseTo(-12);
    expect(tiltAngle({ beta: null, gamma: null }, 90)).toBe(0);
  });
});

describe('screenAngle (MK-54)', () => {
  it('uses screen.orientation.angle, else window.orientation', () => {
    expect(screenAngle(90, undefined, true)).toBe(90);
    expect(screenAngle(270, undefined, true)).toBe(270);
    expect(screenAngle(undefined, -90, true)).toBe(270);
    expect(screenAngle(undefined, 90, true)).toBe(90);
  });

  it('a landscape window reporting 0 counts as 90; portrait stays portrait', () => {
    expect(screenAngle(0, undefined, true)).toBe(90);
    expect(screenAngle(undefined, undefined, true)).toBe(90);
    expect(screenAngle(0, undefined, false)).toBe(0);
    expect(screenAngle(180, undefined, false)).toBe(180);
  });
});
