// Anti-gravity spin boost (MK-108, `sim/spinBoost.ts`): `tuning.mk8.spinBoost` (`./index.ts`).
export const mk8SpinBoostTuning = {
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
};
