/** Longest frame we try to catch up on; anything slower drops time instead (avoids the spiral of death). */
export const MAX_STEPS_PER_FRAME = 5;

/** Guards against float drift making an exact 1/60 s frame count as slightly less than one tick. */
const EPSILON = 1e-9;

export interface AccumulatorResult {
  /** Fixed ticks to run this frame. */
  steps: number;
  /** Leftover time carried into the next frame, seconds. */
  accumulator: number;
  /** Render interpolation factor between the previous and current tick, 0..1. */
  alpha: number;
}

/** Fixed-timestep accumulator: how many `dt` ticks fit into the time that has passed. */
export function advanceAccumulator(
  accumulator: number,
  frameSeconds: number,
  dt: number,
  maxSteps = MAX_STEPS_PER_FRAME,
): AccumulatorResult {
  let acc = accumulator + Math.max(0, frameSeconds);
  let steps = 0;
  while (acc + EPSILON >= dt && steps < maxSteps) {
    acc -= dt;
    steps += 1;
  }
  // Hit the cap: drop the backlog rather than carrying it into the next frame.
  if (acc + EPSILON >= dt) acc = 0;
  acc = Math.max(0, acc);
  return { steps, accumulator: acc, alpha: acc / dt };
}
