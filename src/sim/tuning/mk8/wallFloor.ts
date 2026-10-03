// Low steps under a kart (MK-123): `tuning.mk8.wallFloor` (`./index.ts`).
export const mk8WallFloorTuning = {
  /**
   * A wall touched lower than this above the kart's floor doesn't push it (`wallContact`'s
   * `below`): a step or kerb it rolls over, like the face under a glide ramp's lip, m.
   */
  wallFloor: 0.3,
};
