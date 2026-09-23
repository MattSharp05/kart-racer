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
  /** Seconds to reach 95% of top speed from rest at full throttle (for a stat-3 kart). */
  timeTo95: 2.5,
  /** How much each kart stat point away from 3 changes the physics (MK-7). */
  stats: {
    /** Top speed ±3% per point (±6% at 1 or 5). */
    speedPerPoint: 0.03,
    /** Time to top speed −12% per point (faster) above 3. */
    accelerationPerPoint: 0.12,
    /** Turn rates ±6% per point. */
    handlingPerPoint: 0.06,
  },
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
  wallSpeedKeep: 0.7,
  /** Hits more head-on than this (0 = grazing, 1 = straight in) bounce back instead of sliding. */
  wallHeadOn: 0.8,
  /** Bounce-back speed on a head-on hit, as a fraction of the impact speed. */
  wallBounce: 0.2,
  /** Top speed on grass as a fraction of road top speed. */
  offroadSpeed: 0.55,
  /** Top speed in deep grass (shortcut infields) as a fraction of road top speed. */
  roughSpeed: 0.4,
  /** Extra deceleration when faster than the grass top speed, m/s². */
  offroadDecel: 15,
  /** Collision radius of a kart for kart-vs-kart bumps (MK-8), m. */
  kartRadius: 0.9,
  /** Kart footprint used against walls, m (matches the placeholder model incl. nose and wheels). */
  kartFront: 1.45,
  kartRear: 1.07,
  kartHalfWidth: 0.86,
  /** m/s² */
  gravity: 25,

  // --- Drift & boost (MK-6) ---
  /** Upward speed of the hop when drift is pressed, m/s. */
  hopVelocity: 4,
  /** Drifting is only allowed above this fraction of top speed (and cancels below it). */
  driftMinSpeed: 0.4,
  /** |steer| needed when pressing drift to start a drift instead of a plain hop. */
  driftSteerThreshold: 0.3,
  /** Yaw rate while drifting with neutral steer, rad/s. */
  driftYaw: 1.5,
  /** Steering into the drift adds, and away from it subtracts, up to this much yaw, rad/s. */
  driftYawRange: 0.6,
  /** Sideways grip while drifting (lower than normal, so the kart slides outward), 1/s. */
  driftGrip: 2.5,
  /** Extra charge rate when steering fully into the drift (1 = double speed). */
  driftChargeBonus: 0.5,
  /** Seconds of charge needed for tier 1 (blue), 2 (orange), 3 (purple). */
  driftTiers: [0.8, 1.6, 2.6] as [number, number, number],
  /** Mini-turbo boost length for tier 1, 2, 3, s. */
  miniTurboSeconds: [0.6, 1.0, 1.4] as [number, number, number],
  /** Top speed multiplier while boosting. */
  boostSpeed: 1.3,
  /** How quickly a boost pulls speed up to the boosted top speed, 1/s. */
  boostAccelRate: 4,
  /** A wall hit harder than this (m/s into the wall) cancels a drift. */
  driftWallCancel: 3,

  // --- Track features (MK-10) ---
  /** Boost from driving over a boost pad, s. */
  boostPadSeconds: 1.0,
  /** Leaving the ground faster than this upward (m/s) counts as a ramp launch (enables a trick). */
  trickMinLaunch: 3,
  /** Tap drift within this long after a ramp launch to do a trick, s. */
  trickWindow: 0.4,
  /** Boost on landing after a trick, s. */
  trickBoostSeconds: 0.4,
  /** Leaving a ramp's lip launches the kart upward at this fraction of its speed. */
  rampLaunch: 0.28,
  /** A grounded kart stays glued to the ground over drops up to this per tick, m. */
  groundSnap: 0.15,
  /** A kart further than this past a wall line is on its far side (e.g. a shortcut), not in it, m. */
  wallMaxPenetration: 3,
};

export type Tuning = typeof tuning;
