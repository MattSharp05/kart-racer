import { clamp, wrapAngleDelta } from './math';
import type { TrackGeometry } from './splineTrack';
import { NEUTRAL_INPUT, type InputFrame, type KartState } from './types';

/** How far ahead along the centreline the autopilot aims, m. */
const LOOK_AHEAD = 12;
/** Steering per radian of heading error. */
const STEER_GAIN = 2.5;

/**
 * Simple centreline follower (pure pursuit). Used by tests, and later by the finished-player
 * auto-drive (MK-12). The real AI driver is MK-14.
 */
export function autopilotInput(
  kart: KartState,
  geometry: TrackGeometry,
  throttle = 1,
  lateral = 0,
): InputFrame {
  const here = geometry.project(kart.position);
  const target = geometry.pointAt((here.s + LOOK_AHEAD) / geometry.length, lateral);
  const desired = Math.atan2(-(target.x - kart.position.x), -(target.z - kart.position.z));
  const error = wrapAngleDelta(desired - kart.heading);
  // Positive steer turns right, which lowers the heading.
  return { ...NEUTRAL_INPUT, throttle, steer: clamp(-error * STEER_GAIN, -1, 1) };
}
