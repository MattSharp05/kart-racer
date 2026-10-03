// Gliding (MK-106): `tuning.mk8.glide` (`./index.ts`).
export const mk8GlideTuning = {
  /** Gliding (MK-106): what each number does is in `sim/glide.ts`'s `GlideTuning`. */
  glide: {
    openSeconds: 0.3,
    gravityScale: 0.9,
    lift: 0.3,
    verticalDrag: 1.2,
    diveSink: 0.7,
    diveAccel: 0.25,
    diveMaxSpeed: 1.15,
    floatLift: 0.35,
    floatDrag: 0.06,
    minSpeed: 0.6,
    pitchRate: 5,
    turnRate: 0.5,
    grip: 4,
    upTurnRate: 6,
    fallSeconds: 8,
    hopGrace: 0.6,
    lipReach: 2,
  },
};
