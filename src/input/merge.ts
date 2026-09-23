import type { InputFrame } from '../sim/types';

/**
 * Combines inputs from several devices (keyboard now, touch in MK-23): the stronger value
 * wins on each axis, buttons are OR-ed.
 */
export function mergeInputs(...frames: InputFrame[]): InputFrame {
  return frames.reduce(
    (merged, frame) => ({
      throttle: Math.max(merged.throttle, frame.throttle),
      brake: Math.max(merged.brake, frame.brake),
      steer: Math.abs(frame.steer) > Math.abs(merged.steer) ? frame.steer : merged.steer,
      drift: merged.drift || frame.drift,
      item: merged.item || frame.item,
      respawn: (merged.respawn ?? false) || (frame.respawn ?? false),
    }),
    { throttle: 0, brake: 0, steer: 0, drift: false, item: false, respawn: false },
  );
}
