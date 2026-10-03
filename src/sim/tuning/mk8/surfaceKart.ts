// Surface-frame kart physics on mesh tracks (MK-99, ADR 0011; numbers from the MK-92 spike): part
// of `tuning.mk8` (`./index.ts`).
export const mk8SurfaceKartTuning = {
  /** How fast `up` turns towards the ground's normal while grounded, 1/s (exponential). */
  upTurnRate: 14,
  /** …and back towards +Y in the air, 1/s. */
  airUpTurnRate: 4,
  /** Off anti-gravity ground, gravity keeps pulling along −up this long, s (short gaps). */
  antigravAirHold: 0.35,
  /** Plain ground steeper than this (from level) is a wall, radians (50°). */
  maxSlope: (50 * Math.PI) / 180,
  /** A grounded kart stays on plain ground that drops away by up to this per tick, m. */
  groundSnap: 0.3,
  /** …and on anti-gravity ground (holds it through convex bits), m. */
  antigravSnap: 1.5,
  /** The four wheel rays start this far ahead/behind and either side of the kart's centre, m. */
  wheelForward: 1,
  wheelRight: 0.7,
  /**
   * The ground rays start this far above the kart along up, m: half-way round a 90° corner a
   * wheel ray from 1 m up would start under the floor it should find.
   */
  probeLift: 2,
  /** The climb ray (finds a wall or ceiling ahead to drive onto) starts this high, m… */
  climbLift: 0.4,
  /** …and reaches this far past the kart's nose (plus a tick's travel), m. */
  climbReach: 1,
  /** Ground ahead turned more than this from the kart's up is a new surface to climb, radians. */
  climbAngle: (20 * Math.PI) / 180,
  /** Wall query sphere: radius, and how high above the road its centre sits, m. */
  wallRadius: 0.9,
  wallLift: 0.5,
  /** Karts further apart than this along their up don't bump (a floor and a ceiling), m. */
  bumpHeight: 1.5,
  /** In the air longer than this, a kart has fallen off the course, s. */
  fallSeconds: 3,
};
