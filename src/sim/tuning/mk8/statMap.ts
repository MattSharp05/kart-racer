// How a loadout's MK8 stats become physics (MK-102): `tuning.mk8.statMap` (`./index.ts`).
export const mk8StatMapTuning = {
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
};
