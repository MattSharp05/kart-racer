// Thwomps (MK-124: Thwomp Ruins): `tuning.mk8` (`./index.ts`). A Thwomp is a `periodic` hazard
// (`sim/hazards/periodic.ts`); on mesh tracks a squash lasts `squashTime` instead of the original
// game's long spin-out.
export const mk8ThwompTuning = {
  /** A kart a Thwomp lands on is flattened, stopped and out of control this long, s. */
  squashTime: 1.5,
};
