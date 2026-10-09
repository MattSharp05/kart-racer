import { describe, expect, it } from 'vitest';
import { REMOTE_PAD } from '../config';
import { calibratedNeutral, padSteer, parsePadPrefs } from './steering';

describe('phone controller steering (MK-147)', () => {
  const { tiltDeadZoneDeg: dead, tiltSensitivityDeg: full } = REMOTE_PAD;

  it('steers straight inside the dead zone around level', () => {
    expect(padSteer(0, 0)).toBe(0);
    expect(padSteer(dead - 0.1, 0)).toBe(0);
    expect(padSteer(-(dead - 0.1), 0)).toBe(0);
  });

  it('turns linearly past the dead zone to full lock at the sensitivity', () => {
    const half = (dead + full) / 2;
    expect(padSteer(half, 0)).toBeCloseTo(0.5, 5);
    expect(padSteer(-half, 0)).toBeCloseTo(-0.5, 5);
    expect(padSteer(full, 0)).toBe(1);
    expect(padSteer(full + 40, 0)).toBe(1);
    expect(padSteer(-(full + 40), 0)).toBe(-1);
  });

  it('calibration makes the current angle level', () => {
    const neutral = calibratedNeutral(12);
    expect(padSteer(12, neutral)).toBe(0);
    expect(padSteer(12 + full, neutral)).toBe(1);
    expect(padSteer(12 - (dead + full) / 2, neutral)).toBeCloseTo(-0.5, 5);
  });

  it('keeps the calibrated level within range', () => {
    expect(calibratedNeutral(90)).toBe(REMOTE_PAD.tiltNeutralMaxDeg);
    expect(calibratedNeutral(-90)).toBe(-REMOTE_PAD.tiltNeutralMaxDeg);
    expect(calibratedNeutral(Number.NaN)).toBe(0);
  });

  it('reads saved prefs, falling back to tilt and level', () => {
    expect(parsePadPrefs(null)).toEqual({ steering: 'tilt', neutral: 0 });
    expect(parsePadPrefs('{"steering":"touch","neutral":7}')).toEqual({
      steering: 'touch',
      neutral: 7,
    });
    expect(parsePadPrefs('{"steering":"wheel","neutral":"x"}')).toEqual({
      steering: 'tilt',
      neutral: 0,
    });
    expect(parsePadPrefs('not json')).toEqual({ steering: 'tilt', neutral: 0 });
    expect(parsePadPrefs('{"neutral":500}').neutral).toBe(REMOTE_PAD.tiltNeutralMaxDeg);
  });
});
