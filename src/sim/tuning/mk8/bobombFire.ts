// Bob-omb and Fire Flower (MK-114): part of `tuning.mk8` (`./index.ts`).
export const mk8BobombFireTuning = {
  // Bob-omb (MK-114): thrown ahead in an arc (dropped behind while braking), then a blast.
  /** It lands this far ahead (or is dropped this far behind), m, after flying this long, s… */
  bobombThrowDistance: 20,
  bobombDropDistance: 2.5,
  bobombFlightSeconds: 0.8,
  /** …this high at the top of its arc, m. */
  bobombArcHeight: 3,
  /** It explodes this long after it's let go, or as soon as a kart touches it (this close, m). */
  bobombFuse: 3,
  bobombTouchRadius: 1.3,
  /** Its owner can't set off one it dropped for this long, s (nor ever one thrown ahead). */
  bobombOwnerImmuneSeconds: 1,
  /** The blast hits every kart this close, m, and stays up (hitting karts driving in) this long, s… */
  bobombRadius: 7,
  bobombBlastSeconds: 0.5,
  /** …each spins this long, s, thrown up at this speed, m/s. */
  bobombSpinSeconds: 1.6,
  bobombLaunchSpeed: 7,
  // Fire Flower (MK-114): a fireball per press, up to `fireShots`, for `fireTime` s from the first.
  fireTime: 6,
  fireShots: 10,
  /** Fireball speed (a fraction of the engine class's top speed), touch radius (m), bounces, life (s). */
  fireballSpeed: 1.4,
  fireballRadius: 1,
  fireballBounces: 3,
  fireballLifeSeconds: 4,
};
