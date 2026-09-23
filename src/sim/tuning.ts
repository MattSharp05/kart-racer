/**
 * All tunable numbers live here (CLAUDE.md → Conventions).
 *
 * `tuning` is a plain mutable object so the dev tuning panel (`?tune=1`) can edit it live.
 * Nothing else may write to it; tests and normal play always use these defaults.
 */

/** Fixed simulation rate (docs/TDD.md → Architecture). */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export type EngineClass = 50 | 100 | 150;

export const tuning = {
  /** Top speed on road by engine class, m/s. */
  topSpeed: { 50: 20, 100: 24, 150: 28 } as Record<EngineClass, number>,
  /** Seconds to reach 95% of top speed from rest at full throttle. */
  timeTo95: 2.5,
  /** Deceleration while braking forwards (or throttling while rolling backwards), m/s². */
  brakeDecel: 20,
  /** Deceleration when neither throttle nor brake is held, m/s². */
  coastDecel: 5,
  /** Reverse top speed as a fraction of forward top speed. */
  reverseFraction: 0.3,
  /** Yaw rate at full steer once the steering curve is at 1, rad/s. */
  maxYawRate: 1.7,
  /** Speed (fraction of top speed) at which steering reaches full strength. */
  steerFullAt: 0.25,
  /** Steering strength left at top speed (1 = no reduction). */
  steerAtTopSpeed: 0.75,
  /** How fast sideways sliding is cancelled, 1/s. Higher = grippier. */
  lateralGrip: 8,
  /** Fraction of along-wall speed kept after a head-on-ish wall hit (scaled by impact angle). */
  wallSpeedKeep: 0.6,
  /** Collision radius of a kart for kart-vs-kart bumps (MK-8), m. */
  kartRadius: 0.9,
  /** Kart footprint used against walls, m (matches the placeholder model incl. nose and wheels). */
  kartFront: 1.45,
  kartRear: 1.07,
  kartHalfWidth: 0.86,
  /** m/s² */
  gravity: 25,
};

export type Tuning = typeof tuning;
