import { describe, expect, it } from 'vitest';
import { tuning } from '../../tuning';
import * as blocks from './blocks';

describe('tuning.mk8 (MK-142)', () => {
  it('has every block’s keys, each from one block only', () => {
    const keys = Object.values(blocks).flatMap((block) => Object.keys(block));
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(tuning.mk8).sort()).toEqual(keys.sort());
  });

  it('keeps the key paths and values it had inline', () => {
    expect(tuning.mk8.goldenTime).toBe(7.5);
    expect(tuning.mk8.upTurnRate).toBe(14);
    expect(tuning.mk8.maxSlope).toBeCloseTo((50 * Math.PI) / 180);
    expect(tuning.mk8.statMap.neutral).toBe(3.25);
    expect(tuning.mk8.statMap.weightPerPoint).toBe(1);
  });

  it('is the live object the blocks hold, so `?tune=1` edits reach the sim', () => {
    expect(tuning.mk8.statMap).toBe(blocks.mk8StatMapTuning.statMap);
  });
});
