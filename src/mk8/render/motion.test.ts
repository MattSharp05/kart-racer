import { describe, expect, it } from 'vitest';
import {
  MOTION,
  REST_MOTION,
  motionInput,
  stepMotion,
  targetLean,
  trickRoll,
  type MotionInput,
  type MotionState,
} from './motion';

const DT = 1 / 60;
const DRIVING: MotionInput = {
  steer: 0,
  speedShare: 1,
  grounded: true,
  verticalSpeed: 0,
  spinning: false,
  trick: false,
  shellBehind: false,
};

function run(input: Partial<MotionInput>, ticks: number, from: MotionState = REST_MOTION) {
  let state = from;
  for (let i = 0; i < ticks; i++) state = stepMotion(state, { ...DRIVING, ...input }, DT);
  return state;
}

describe('racer motion (MK-101)', () => {
  it('leans into the turn: the lean follows the steering and is 0 going straight', () => {
    expect(targetLean(0, 1)).toBe(0);
    expect(targetLean(1, 1)).toBeCloseTo(MOTION.maxLean);
    expect(targetLean(-1, 1)).toBeCloseTo(-MOTION.maxLean);
    expect(targetLean(0.5, 1)).toBeCloseTo(MOTION.maxLean / 2);
    // Standing still, steering doesn't lean.
    expect(targetLean(1, 0)).toBe(0);

    const right = run({ steer: 1 }, 60);
    expect(right.lean).toBeCloseTo(MOTION.maxLean, 3);
    const left = run({ steer: -0.5 }, 60);
    expect(left.lean).toBeCloseTo(-MOTION.maxLean / 2, 3);
    // Back to straight: the lean returns to 0.
    expect(run({ steer: 0 }, 60, right).lean).toBeCloseTo(0, 3);
    expect(run({ steer: 0 }, 60).lean).toBe(0);
  });

  it('eases into the lean instead of snapping', () => {
    const one = run({ steer: 1 }, 1);
    expect(one.lean).toBeGreaterThan(0);
    expect(one.lean).toBeLessThan(MOTION.maxLean / 2);
  });

  it('squashes and bobs on a hard landing, then settles', () => {
    const falling = run({ grounded: false, verticalSpeed: -8 }, 10);
    expect(falling.squash).toBe(0);
    const landed = stepMotion(falling, DRIVING, DT);
    expect(landed.squash).toBeGreaterThan(0.2);
    expect(landed.bob).toBeLessThan(0);
    const later = run({}, 120, landed);
    expect(later.squash).toBeLessThan(0.001);
    expect(Math.abs(later.bob)).toBeLessThan(0.001);
  });

  it('ignores tiny drops (seams in the road)', () => {
    const hop = run({ grounded: false, verticalSpeed: -0.5 }, 2);
    const landed = stepMotion(hop, DRIVING, DT);
    expect(landed.squash).toBe(0);
    expect(landed.bob).toBe(0);
  });

  it('looks back while a shell is behind, and forward again after', () => {
    const looking = run({ shellBehind: true }, 60);
    expect(looking.look).toBeCloseTo(MOTION.lookBack, 2);
    expect(run({}, 60, looking).look).toBeCloseTo(0, 2);
  });

  it('spins while hit, then settles facing forward the short way', () => {
    const spinning = run({ spinning: true }, 20);
    expect(spinning.spin).toBeGreaterThan(0);
    const settled = run({}, 60, spinning);
    expect(Math.abs(settled.spin)).toBeLessThan(0.01);
    // Past half a turn it finishes the turn instead of unwinding.
    const late = stepMotion({ ...REST_MOTION, spin: 1.9 * Math.PI }, DRIVING, DT);
    expect(late.spin).toBeLessThan(0);
    expect(late.spin).toBeGreaterThan(-0.1 * Math.PI);
  });

  it('plays a trick roll in the air and ends it on landing', () => {
    const air = { grounded: false, trick: true };
    const mid = run(air, Math.round((MOTION.trickSeconds / 2) * 60));
    expect(mid.trick).toBeCloseTo(0.5, 1);
    expect(trickRoll(mid.trick)).toBeCloseTo(Math.PI, 0);
    const done = run(air, 60, mid);
    expect(done.trick).toBe(1);
    expect(trickRoll(done.trick)).toBe(0);
    expect(run({}, 1, done).trick).toBe(0);
    expect(trickRoll(0)).toBe(0);
  });

  it('reads its input from a sim kart', () => {
    const kart = {
      speed: -10,
      grounded: false,
      velocity: { x: 0, y: -3, z: 0 },
      spinTimer: 0.5,
      trick: 'done' as const,
    };
    expect(motionInput(kart, { steer: 0.4 }, 20, true)).toEqual({
      steer: 0.4,
      speedShare: 0.5,
      grounded: false,
      verticalSpeed: -3,
      spinning: true,
      trick: true,
      shellBehind: true,
    });
    expect(motionInput({ ...kart, grounded: true }, undefined, 0).steer).toBe(0);
    expect(motionInput({ ...kart, grounded: true }, undefined, 0).trick).toBe(false);
  });
});
