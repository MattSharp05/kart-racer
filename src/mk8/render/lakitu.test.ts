import { describe, expect, it } from 'vitest';
import { tuning } from '../../sim/tuning';
import { LAKITU, cueTicks, lakituPose } from './lakitu';

const SECOND = 60;

describe('Lakitu (MK-101)', () => {
  it('holds the start light through the countdown: a red lamp a second, then green, then leaves', () => {
    const countdown = (tick: number) => lakituPose({ kind: 'countdown', tick });
    expect(countdown(0).visible).toBe(true);
    expect(countdown(0).light).toEqual({ red: 1, green: false });
    expect(countdown(SECOND).light).toEqual({ red: 2, green: false });
    expect(countdown(2 * SECOND + 30).light).toEqual({ red: 3, green: false });
    const go = tuning.countdownSeconds * SECOND;
    expect(countdown(go).light).toEqual({ red: 0, green: true });
    expect(countdown(go).sign).toBeNull();
    // Flies in from above, hovers, then flies out.
    expect(countdown(0).offset[1]).toBeGreaterThan(countdown(SECOND).offset[1]);
    expect(countdown(SECOND).offset[1]).toBeCloseTo(LAKITU.hover[1]);
    expect(countdown(cueTicks('countdown') - 1).offset[1]).toBeGreaterThan(LAKITU.hover[1] + 4);
    expect(countdown(cueTicks('countdown')).visible).toBe(false);
    expect(lakituPose({ kind: 'hidden' }).visible).toBe(false);
  });

  it('shows the lap sign: the lap number, or FINAL LAP', () => {
    expect(lakituPose({ kind: 'lap', tick: 30, lap: 2, final: false }).sign).toBe('2');
    const final = lakituPose({ kind: 'lap', tick: 30, lap: 3, final: true });
    expect(final.sign).toBe('FINAL LAP');
    expect(final.light).toBeNull();
    expect(lakituPose({ kind: 'lap', tick: cueTicks('lap'), lap: 2, final: false }).visible).toBe(
      false,
    );
  });

  it('fishes a kart out: comes down over it, lifts it on the line, drops it', () => {
    const total = cueTicks('fishing');
    expect(total).toBe(Math.round(tuning.respawnSeconds * SECOND));
    const at = (share: number) => lakituPose({ kind: 'fishing', tick: Math.floor(share * total) });
    // Coming down: over the kart (no sideways offset), line paying out, nothing hooked.
    expect(at(0.1).offset[0]).toBe(0);
    expect(at(0.1).offset[1]).toBeGreaterThan(LAKITU.fishHeight);
    expect(at(0.1).carrying).toBe(false);
    expect(at(0.1).line).toBeGreaterThan(0);
    // Holding: the line reaches the kart and lifts it.
    const holding = at(0.6);
    expect(holding.carrying).toBe(true);
    expect(holding.line).toBe(LAKITU.fishHeight);
    expect(holding.lift).toBeGreaterThan(0);
    expect(holding.offset[1]).toBeCloseTo(LAKITU.fishHeight + holding.lift);
    // Dropped: the kart is let go and he flies away.
    const dropped = at(0.95);
    expect(dropped.carrying).toBe(false);
    expect(dropped.lift).toBe(0);
    expect(dropped.offset[1]).toBeGreaterThan(holding.offset[1]);
    expect(lakituPose({ kind: 'fishing', tick: total }).visible).toBe(false);
  });
});
