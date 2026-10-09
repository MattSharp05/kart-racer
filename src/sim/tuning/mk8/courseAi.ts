// The AI on MK8 courses (MK-128, `sim/ai/meshTactics.ts`, `sim/ai/meshDriver.ts`): `tuning.mk8`.
export const mk8CourseAiTuning = {
  courseAi: {
    /** Coins: it looks this far ahead for one, m… */
    coinRange: 25,
    /** …and leaves its line for it only this far either way, m (a small detour). */
    coinDetour: 3,
    /** Spin-boost bumps (MK-108): in anti-gravity, it steers into a kart this far beside it… */
    bumpReach: 4,
    /** …that is within this far ahead or behind, m… */
    bumpAlong: 2.5,
    /** …by at most this much off its line, m. */
    bumpMaxOffset: 3,
    /**
     * It drifts and bumps only where the road (the route's width) is at least this wide over its
     * drift look-ahead, m: on a narrow strip up a wall a slide or a shove puts it over the edge.
     */
    minWidth: 8,
    /**
     * Thwomps (MK-124): it plans to cross under one at this speed or more, m/s (the original
     * game's crushers: `tuning.ai.crusherPassSpeed`).
     */
    thwompPassSpeed: 14,
    /** Glide ramps: it lines up on the ramp's middle from this far before it, m. */
    glideLead: 35,
    /**
     * Gliding, it dives while there is drivable ground this far below at most, m (times a scaled
     * course's scale, `MeshTrackDef.scale`: its drops are that much deeper); else floats…
     */
    glideGroundBelow: 40,
    /**
     * …and only if that ground is less than this many times the fall depth (`meshFallLimits`)
     * below the route there: deeper, it's a pit under the glide, and it floats on (MK-128 revisit:
     * Mario Kart Stadium's infield). Over a big drop the route comes down through the air, so the
     * road it lands on can be about a fall depth below it.
     */
    glideLandingDepth: 1.5,
  },
};
