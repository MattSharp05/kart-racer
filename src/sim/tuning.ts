/**
 * All tunable numbers live here (CLAUDE.md → Conventions).
 *
 * `tuning` is a plain mutable object so the dev tuning panel (`?tune=1`) can edit it live.
 * Nothing else may write to it; tests and normal play always use these defaults.
 */

/** Fixed simulation rate (docs/TDD.md → Architecture). */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** 200cc (MK-96) is MK8 Mode's class; the sim accepts it anywhere (scenarios). */
export type EngineClass = 50 | 100 | 150 | 200;

export const tuning = {
  /**
   * Top speed on road by engine class, m/s. 200cc is 1.33× 150cc, as in MK8 (MK-96). Acceleration
   * scales with it: `timeTo95` is the same for every class, so a faster class also pulls harder.
   */
  topSpeed: { 50: 20, 100: 24, 150: 28, 200: 37.25 } as Record<EngineClass, number>,
  /** Seconds to reach 95% of top speed from rest at full throttle (for a stat-3 kart). */
  timeTo95: 2.5,
  /**
   * How much each kart stat point away from 3 changes the physics (MK-7). MK-88 balanced them so
   * a point of speed, acceleration or handling is worth about the same race time to the AI (~0.4–0.6%
   * each, `pnpm racer-balance`): top speed was worth 5× the others and decided every race.
   */
  stats: {
    /** Top speed ±0.6% per point (±1.2% at 1 or 5). Was 3% (MK-7) before MK-88. */
    speedPerPoint: 0.006,
    /** Time to top speed −10% per point (faster) above 3. Was 12% before MK-88. */
    accelerationPerPoint: 0.1,
    /** Turn rates ±6% per point. */
    handlingPerPoint: 0.06,
  },
  /** Deceleration while braking forwards (or throttling while rolling backwards), m/s². */
  brakeDecel: 20,
  /** Deceleration when neither throttle nor brake is held, m/s². */
  coastDecel: 5,
  /**
   * Brake-drift (MK-96): from `minClass` up, holding brake while drifting tightens the drift
   * instead of braking hard; mini-turbo charge carries on. Below it, brake in a drift brakes.
   */
  brakeDrift: {
    minClass: 200 as EngineClass,
    /** Drift yaw rate × this while braking. */
    turnScale: 1.35,
    /** Speed lost while brake-drifting, fraction per second (on top of throttle/coast). */
    speedLoss: 0.06,
  },
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
  /**
   * Drift charge rate × this for racers with `strongDrift` (Coral, MK-64): tiers come sooner. 1.15
   * made Coral the best racer by ~0.9% race time; 1.05 evens her out (MK-88).
   */
  strongDriftCharge: 1.05,
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
  // --- Mesh tracks (MK-98, ADR 0010): queries on a course's collision mesh and its route ---
  meshTrack: {
    /**
     * `groundAt` casts from this far above the position (along `up`), m, so a kart that sank a
     * little into the road still finds it.
     */
    groundProbeUp: 1,
    /**
     * …down to this far below it, m. The MK-92 spike's longest snap (anti-gravity, holding the
     * kart through convex bits) was 1.5 m; anything further is air.
     */
    groundProbeDown: 1.5,
    /** Route centreline sample spacing for progress, m (as spline tracks). */
    routeSampleSpacing: 1,
    /**
     * `progressAt` with a hint searches the route only this far either side of it, m, so stacked
     * sections (a road passing over or under itself) don't swap progress.
     */
    progressWindow: 40,
    /**
     * A course's road relabelled from its route (MK-105, `routeSurfaces.ts`): triangles this far
     * from the centreline or nearer, m, within this height of the road along its up, m…
     */
    routeSurfaces: {
      reach: 30,
      heightTolerance: 3,
      /** …in an anti-gravity zone up to this far past the road's edge are anti-gravity, m… */
      antigravMargin: 1.5,
      /** …and further than this past it, facing up like the road (|cos| ≥ this), offroad. */
      offroadMargin: 1,
      offroadFacing: 0.7,
      /** …and standing up from it (|cos| below this) a wall. */
      wallFacing: 0.5,
      /** Over the road and higher than this above it (up to `heightTolerance`): a wall, m. */
      overhead: 1.2,
    },
  },
  // --- MK8 Mode (v3) ---
  mk8: {
    // MK8 Mode's items (MK-112).
    /** Golden Mushroom: boost as often as you like for this long from its first use, s. */
    goldenTime: 7.5,
    /** Triple shells circle the kart this far from its centre, m… */
    orbitRadius: 1.6,
    /** …this fast, rad/s. */
    orbitSpeed: 4,
    /** Triple bananas trail behind the kart: the first this far behind its centre, m… */
    trailFirst: 1.8,
    /** …and each next one this much further, m. */
    trailSpacing: 1.1,
    /** A circling shell or trailing banana touches karts and items this close, m. */
    escortRadius: 1,
    // Surface-frame kart physics on mesh tracks (MK-99, ADR 0011; numbers from the MK-92 spike).
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
    /**
     * How a loadout's MK8 stats (0.75–5.75, `mk8/content/stats.ts`) become physics (MK-102), like
     * `stats` does for our 1–5 racers: each point away from `neutral` changes a number by its share.
     */
    statMap: {
      /** The MK8 stat that means "average": the middle of MK8's scale. */
      neutral: 3.25,
      /**
       * Top speed ± this share per point: MK8's own ground-speed curve (+0.03 per level of ~7.66,
       * 4 levels a point). With `stats.speedPerPoint` (0.006) the classes' top speeds were within
       * 0.8 %; this keeps their lap times within 1.5 % (MK-102 measurements on the ticket).
       */
      speedPerPoint: 0.0157,
      /** Time to 95 % of top speed − this share per point (faster). */
      accelerationPerPoint: 0.1,
      /** Turn rates ± this share per point. */
      handlingPerPoint: 0.06,
      /** Sideways grip (road and drift) ± this share per point of traction. */
      gripPerPoint: 0.05,
      /** Drift mini-turbo charge rate ± this share per point. */
      miniTurboPerPoint: 0.05,
      /** Bump weight (our 1–5 `weight`) per MK8 weight point: MK8's scale is about ours. */
      weightPerPoint: 1,
    },
    /** Anti-gravity spin boost (MK-108): bumping a kart or a boost bumper in anti-gravity. */
    spinBoost: {
      /** How long it lasts, s. */
      seconds: 0.8,
      /** Speed it pulls the kart towards, × top speed (a mushroom is `boostSpeed`, 1.3). */
      speed: 1.2,
      /** How fast it gets there, 1/s (exponential, like `boostAccelRate`). */
      accelRate: 6,
      /** A boost bumper sends back this share of the speed into it, on top of stopping it. */
      bumperBounce: 0.6,
    },
  },
  /** The AI driver on mesh tracks (MK-105, `sim/ai/meshDriver.ts`). */
  meshAi: {
    /** Corners ahead are measured over route steps this long, m. */
    curvatureStep: 4,
    /** It looks for corners this far ahead, m, plus this many m per m/s (up to `ai.brakeHorizon`). */
    horizonBase: 10,
    horizonPerSpeed: 1.5,
    /** It brakes (rather than just lifting) when this much over its target speed. */
    brakeOver: 1.08,
    /** Slower than this, m/s, for longer than `respawnAfter`, s, it asks to be put back. */
    slowSpeed: 8,
    respawnAfter: 5,
  },
  // --- Surfaces & hazards (MK-49) ---
  surfaces: {
    /** Ice: sideways grip (and drift grip) × this, so karts slide much further. */
    iceGrip: 0.1,
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
    /** A crusher's warning lamp lights this long before it starts to drop, s (MK-62). */
    crusherWarningSeconds: 0.5,
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
    /**
     * …× the kart's handling multiplier ^ this (MK-88), so handling is worth corner speed to the
     * AI as it is to a player (0 = the AI ignores handling). Not on ice: sliding, all karts are alike.
     */
    cornerHandling: 1.5,
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
    /** Skill range: min–max (tighter from `sharpClass` up: 150cc and 200cc, MK-96). */
    skillMin: 0.86,
    skillMax: 1.0,
    skillMin150: 0.92,
    sharpClass: 150 as EngineClass,
    lineOffsetMax: 1.5,
    // Routes (MK-61): another way round part of a lap, e.g. a lower path through ruins.
    /** An AI that has chosen a route joins it within this of the route's edge, m. */
    routeCapture: 4,
    /** It goes back to the racing line this far before the route's end (rejoined the road), m. */
    routeEndMargin: 8,
    /**
     * A driver's route roll moves on by this each lap (MK-71), so its calls spread evenly over a
     * 3-lap race: at a 35% chance every driver takes the route once or twice, never 0 or 3 times
     * (independent rolls let a lucky kart save a shortcut every lap and leave the field 15%+ apart).
     */
    routeLapStride: 1 / 3,
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
    /** Skill needed to hold for a purple (tier 3) mini-turbo — and only from `sharpClass` up. */
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
    /**
     * Held this long, s, the AI stops waiting for the ideal moment: the MVP items are used, and an
     * item's `aiUse` hook is told (`giveUp`) so it can settle for any sensible moment (MK-72).
     */
    itemGiveUp: 12,
    /**
     * Last resort (MK-72): an item whose hook still says no is used anyway after this long, s, so
     * an AI's slot never stays jammed (and it can pick up boxes again).
     */
    itemForceUse: 30,
    /** Drift towards an item box within this distance ahead when the slot is empty, m. */
    boxSeekRange: 35,
    /** Look for bananas this far ahead to dodge, m, and pass them this far to the side. */
    dodgeRange: 20,
    dodgeOffset: 2.6,
    /** Chance of spotting a banana = clamp((skill − base) × gain): ~27% at 0.86, 90% at 1.0. */
    dodgeSkillBase: 0.8,
    dodgeSkillGain: 4.5,
    /**
     * Moving hazards (MK-60: traffic): the AI predicts them this far ahead, s, and keeps this much
     * clear of them sideways, m, checking only those within `hazardDodgeRange` m.
     */
    hazardDodgeSeconds: 3,
    hazardDodgeMargin: 2.2,
    hazardDodgeRange: 110,
    /** On a route (MK-61 QA round 2: the trail), the AI dodges within this far either side of it, m. */
    routeDodgeHalfWidth: 7,
    /**
     * Crushers (MK-62): the AI times the next one within `crusherLookAhead` m. If it would be under
     * it while it's down (or moving), it slows to get there as it opens. It plans the crossing at
     * `crusherPassSpeed` m/s at least, keeping `crusherMargin` m clear of its footprint.
     */
    crusherLookAhead: 60,
    crusherPassSpeed: 10,
    crusherMargin: 0.5,
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
     * How a client predicts and draws the other karts: `predict` (the whole race simulated, other
     * players from their last known input) or `interpolate` (MK-74: only its own kart simulated,
     * every other kart drawn from the host's snapshots, `interpolationSeconds` in the past; a
     * snapshot then costs ~0.15 ms instead of ~2 ms). Predict: interpolated karts are always smooth
     * but drawn 6 m (`net-good`) to 10 m (`net-bad`) behind where they are (the lead plus the
     * delay), against 2–6 cm for predicted ones; in `interpolate` our bumps and item hits show a
     * round trip late, and bumping another kart makes no bump sound or shake (the host's bump
     * events aren't sent).
     * `&remote=interpolate` switches a device to it (QA).
     */
    remoteKarts: 'predict' as RemoteKartMode,
    /** How far behind the newest snapshot interpolated karts are drawn, s. */
    interpolationSeconds: 0.1,
  },
};

/** See `tuning.net.remoteKarts`. */
export type RemoteKartMode = 'predict' | 'interpolate';

export type Tuning = typeof tuning;
