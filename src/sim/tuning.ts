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
  /** Radius of each of a kart's two bump circles (kart-vs-kart, MK-8), m. */
  kartRadius: 0.85,
  /** The two bump circles sit this far in front of / behind the kart's centre, m. */
  bumpCircleOffset: 0.55,
  /** Kart mass for bumps = 1 + weight stat × this. */
  bumpMassPerWeight: 0.6,
  /** Bounciness of kart-vs-kart bumps (0 = dead stop, 1 = perfectly elastic). */
  bumpBounce: 0.35,
  /** A bump that changes a drifting kart's speed by more than this (m/s) cancels the drift. */
  bumpDriftCancel: 4,
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
  // --- Surfaces & hazards (MK-49) ---
  surfaces: {
    /** Ice: sideways grip (and drift grip) × this, so karts slide much further. */
    iceGrip: 0.15,
    /** Sand: top speed as a fraction of road top speed. */
    sandSpeed: 0.7,
    /** Sand: while drifting, the kart's yaw wobbles by up to this, rad/s… */
    sandWobble: 0.5,
    /** …this many times a second. */
    sandWobbleHz: 3,
    /** Conveyor belt speed: karts on it are carried this fast along the belt, m/s. */
    conveyorSpeed: 6,
  },
  hazards: {
    /** A kart touches a hazard when its centre comes within this of the hazard's collider, m. */
    kartRadius: 1,
    /** Karts flying more than this above a hazard's base clear it (e.g. off a ramp), m. */
    clearance: 2.5,
    /** Bumped karts bounce off at this fraction of their speed into the hazard. */
    bumpBounce: 0.5,
    /** Minimum push-back speed of a bump, m/s (so a stopped kart is still shoved clear). */
    bumpMinSpeed: 3,
    /** Crushers squash karts under them once this far down (0 = up, 1 = closed). */
    crusherSquashAt: 0.8,
    /** Crusher cycle: share of the period spent dropping and rising (the rest is open/closed). */
    crusherMoveFraction: 0.1,
    /** A squashed kart spins out this many times as long as an item hit. */
    squashSpinFactor: 1.5,
    /** A hazard with a HUD warning (a sandstorm) shows it this long before it switches on, s. */
    warningSeconds: 3,
  },
  // --- Respawn (MK-13) ---
  /** Being carried back to the track takes this long, s. */
  respawnSeconds: 1.5,
  /** The kart is lifted from this high above the road and lowered onto it, m. */
  respawnLift: 4,
  invulnerableSeconds: 1,
  /** Falling this far below the track surface means the kart has fallen off, m. */
  fallDepth: 5,
  /** Off every surface (beyond the edge) this long = fallen off, s. */
  outSeconds: 0.5,
  respawnCooldownSeconds: 3,
  /** Karts respawning at the same spot are spread across the road this far apart, m. */
  respawnSpacing: 3.5,
  // --- Items (MK-16+) ---
  /** Driving within this distance of a box's centre picks it up, m. */
  itemBoxRadius: 1.8,
  itemBoxRespawnSeconds: 2,
  rouletteSeconds: 1.5,
  mushroomSeconds: 1.5,
  // --- Hits & bananas (MK-17) ---
  spinSeconds: 1,
  /** Speed kept when hit (fraction). */
  hitSpeedFactor: 0.3,
  /** Invulnerability after a spin-out ends, s. */
  hitInvulnerableSeconds: 1,
  bananaDropDistance: 2,
  bananaThrowDistance: 20,
  bananaFlightSeconds: 0.5,
  /** Kart centre within this of a banana = hit, m. */
  bananaRadius: 1.3,
  bananaOwnerImmuneSeconds: 0.5,
  maxBananas: 20,
  // --- Star & lightning (MK-20) ---
  starSeconds: 6,
  starSpeed: 1.2,
  /** A starred kart hits karts whose centres come this close, m. */
  starHitRadius: 2.2,
  /** Lightning shrink time: the leader's and last place's (linear in between), s. */
  shrinkSecondsFirst: 8,
  shrinkSecondsLast: 3,
  shrinkSpeed: 0.7,
  /** A full-size kart runs over a shrunk one this close, m. */
  squashRadius: 2.2,
  // --- Shells (MK-18, MK-19) ---
  /** Green shell speed as a multiple of the race's top speed. */
  greenShellSpeed: 1.6,
  redShellSpeed: 1.5,
  greenShellBounces: 5,
  greenShellLife: 8,
  redShellLife: 12,
  /** The thrower is immune to their own shell this long, s. */
  shellOwnerImmuneSeconds: 0.3,
  /** Shell centre within this of a kart centre = hit, m. */
  shellHitRadius: 1.6,
  /** Shell vs banana/shell contact distance, m. */
  shellBlockRadius: 1.2,
  shellRadius: 0.5,
  /** Spawn distance in front of (or behind) the thrower, m. */
  shellSpawnDistance: 2.5,
  /** Red shell: follows the track until this close to its target, then flies straight at it, m. */
  redHomingRange: 25,
  /** Red shell: look-ahead along the track while following it, m. */
  redLookAhead: 8,
  /** Red shell: max turn rate, rad/s. */
  redTurnRate: 6,
  // --- General item entities (MK-52) ---
  /** An entity touches a kart only within this height difference, m. */
  itemHitHeight: 2,
  /** After an effect (a shield) blocks a hit, the kart can't be hit for this long, s. */
  blockedHitInvulnerableSeconds: 0.5,
  // --- AI (MK-14) ---
  ai: {
    /** Look-ahead along the racing line = base + speed × this, m. */
    lookAheadBase: 7,
    lookAheadPerSpeed: 0.45,
    steerGain: 2.6,
    /** Max sideways grip the AI plans corners with, m/s² (× skill). */
    cornerGrip: 26,
    /** How far ahead it checks for tight corners, m. */
    brakeHorizon: 45,
    /**
     * Corners with a slippery surface on the line ahead are planned with cornerGrip × (that
     * surface's grip ^ this): 0 ignores it, 1 trusts the full grip loss (MK-59: ice).
     */
    lowGripCaution: 0.6,
    /**
     * Difficulty per engine class. The AI's top speed follows the cc table like the player's, and
     * skill (corner speed, cruise speed) is spread 0.86–1.0. At 150cc the spread tightens to
     * 0.92–1.0 so the whole pack is sharper, and only there do the best drivers hold drifts for
     * purple mini-turbos. 50cc and 100cc keep weaker drivers in the pack so a new player can win.
     */
    /** Skill range: min–max (tighter at 150cc). */
    skillMin: 0.86,
    skillMax: 1.0,
    skillMin150: 0.92,
    lineOffsetMax: 1.5,
    /**
     * The driver that takes over a dropped online player's kart (MK-70): a fixed mid-pack
     * personality, not a seeded one, so the host and every client hand the kart over identically.
     */
    takeoverSkill: 0.93,
    takeoverLineOffset: 0,
    takeoverAggression: 0.5,
    /** Cruising speed = top × (base + skill × this): 0.885–0.935 of top speed (drift boosts add the rest). */
    cruiseBase: 0.885,
    cruiseSkill: 0.05,
    stuckSpeed: 1,
    stuckSeconds: 1,
    recoverSeconds: 1,
    // Drifting (MK-15). The AI drifts through corners tighter than this…
    /** Racing-line curvature (1/m) over the next `driftLookAhead` m that starts a drift. */
    driftCurvature: 0.025,
    driftLookAhead: 20,
    /** …and lets go once the line ahead straightens out below this curvature. */
    driftExitCurvature: 0.008,
    /** Lets go early if the kart is swinging this far (rad) past where it should point. */
    driftOverRotation: 0.6,
    /** Only drifts from this fraction of top speed. */
    driftMinSpeed: 0.55,
    /** Skill needed to hold for a purple (tier 3) mini-turbo — and only at 150cc. */
    driftTier3Skill: 0.97,
    // Rubber-banding (MK-15): keeps races close without making the result feel fixed.
    // Gaps are race-progress metres to the player. Behind by `rubberBandFar` m or more → the
    // full +8%, ahead by that much → the full −10% (linear in between). Off for the last 200 m of
    // the AI's race so finishes are fair.
    rubberBandFar: 250,
    rubberBandBoost: 0.08,
    rubberBandBrake: 0.1,
    rubberBandFinalMetres: 200,
    // Items (MK-21).
    /** Thinking time before using a new item, s (shorter for aggressive drivers). */
    itemDelayMin: 0.5,
    itemDelayMax: 3,
    /** Star / Lightning are used this soon after getting them, s. */
    powerDelayMin: 0.5,
    powerDelayMax: 2,
    /** Mushroom: use when the line is this straight for the next `straightLookAhead` m. */
    straightCurvature: 0.006,
    straightLookAhead: 40,
    /** Banana: drop when a kart is within this many metres behind. */
    bananaDropRange: 15,
    /** Green shell: fire at a kart within this range and angle ahead. */
    greenRange: 25,
    greenAngle: (10 * Math.PI) / 180,
    /** …or this far to the side when close, m. */
    greenLateral: 1.5,
    /** Use a held item anyway after this long, s (so nothing is hoarded forever). */
    itemGiveUp: 12,
    /** Drift towards an item box within this distance ahead when the slot is empty, m. */
    boxSeekRange: 35,
    /** Look for bananas this far ahead to dodge, m, and pass them this far to the side. */
    dodgeRange: 20,
    dodgeOffset: 2.6,
    /** Chance of spotting a banana = clamp((skill − base) × gain): ~27% at 0.86, 90% at 1.0. */
    dodgeSkillBase: 0.8,
    dodgeSkillGain: 4.5,
  },
  // --- Race (MK-11, MK-12) ---
  raceLaps: 3,
  /** 3-2-1-GO, s. */
  countdownSeconds: 3,
  /** Throttle pressed within this long before GO (and held) = rocket start, s. */
  rocketWindow: 0.3,
  /** Throttle held longer than this before GO = engine stall, s. */
  rocketEarly: 1.0,
  rocketBoostSeconds: 1.0,
  stallSeconds: 0.8,
  /** A checkpoint crossing only counts if the kart is within this lap fraction of it (no teleports). */
  checkpointWindow: 0.05,
  /** Driving against the track faster than this (m/s)… */
  wrongWaySpeed: 2,
  /** …for this long (s) shows "wrong way". */
  wrongWaySeconds: 1.5,
  /** A kart further than this past a wall line is on its far side (e.g. a shortcut), not in it, m. */
  wallMaxPenetration: 3,
  // --- Online (MK-45): how a client shows the predicted race. Protocol constants: net/config.ts ---
  // Defaults tuned in MK-73 with the netcode lab (`net/netLab.ts`: a 4-player room over loopback at
  // `net-good` 80/10/1 % and `net-bad` 200/50/8 %, 60 and 30 fps clients); the numbers and the
  // rejected options are in ADR 0005 → "Tuning (MK-73)".
  net: {
    /**
     * A correction from a snapshot is blended out over this long, s, so karts never teleport.
     * 0.15 is the middle of the trade-off at `net-bad`: 0.1 s makes per-frame jumps bigger (other
     * players' karts p99 18 cm vs 14 cm) and 0.2–0.25 s draws karts further off the truth for
     * longer (others p99 1.5–1.7 m vs 1.36 m).
     */
    smoothingSeconds: 0.15,
    /**
     * Corrections bigger than this snap at once (respawns, hits the client didn't foresee), m. Was
     * 3: at `net-bad` a predicted kart is corrected by 3–6 m now and then (another player steered
     * while their input was on its way, or used an item nobody could foresee: a lightning strike
     * moves every kart ~5 m), and snapping drew those karts teleporting. Blending them keeps every
     * drawn kart under 1 m per frame (max ~0.8 m) over 10 full races (`net/soak.ts`).
     */
    snapDistance: 8,
    /**
     * Ticks the client runs ahead beyond a full RTT, so its inputs reach the host in time. Was 2:
     * 1 gives the same late inputs at the host (6.3 per client in 30 s at `net-bad`; 8.5 vs 8.2 on
     * a 30 fps client), and one tick less lead means less to re-simulate and other players' karts
     * predicted closer to where they really are (p99 1.36 m vs 1.58 m). 0 raises late inputs by
     * half on a 30 fps client. Real lag spikes add up to `NET.maxExtraLeadTicks` on top.
     */
    inputDelayTicks: 1,
    /**
     * How other players' karts are drawn: `predict` (their last known input, like the rest of the
     * race) or `interpolate` (the host's snapshots, `interpolationSeconds` in the past). Predict:
     * interpolated karts are always smooth but drawn 6 m (`net-good`) to 10 m (`net-bad`) behind
     * where they are (the lead plus the delay), against 2–6 cm for predicted ones.
     */
    remoteKarts: 'predict' as RemoteKartMode,
    /** How far behind the newest snapshot interpolated remote karts are drawn, s. */
    interpolationSeconds: 0.1,
  },
};

/** See `tuning.net.remoteKarts`. */
export type RemoteKartMode = 'predict' | 'interpolate';

export type Tuning = typeof tuning;
