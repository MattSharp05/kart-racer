// AI use of MK8's items (MK-129): when the AI fires, drops or saves each one. Part of `tuning.mk8`
// (`./index.ts`); the hooks are each item's `aiUse` in `src/mk8/content/items/<id>/sim.ts`.
export const mk8ItemAiTuning = {
  /**
   * Super Horn: blown when a Spiny Shell is this share of `hornRadius` away or closer (overhead or
   * diving: it's destroyed), and saved while one is on its way to this kart…
   */
  aiHornSpinyShare: 0.85,
  /** …otherwise blown when this many karts (or shells, bananas) are within `hornRadius`. */
  aiHornCrowd: 2,
  /** Bob-omb: thrown when this many karts are within this far ahead (a pack where it lands), m… */
  aiBobombPack: 2,
  aiBobombAhead: 35,
  /** …or dropped behind when a kart is this close behind, m. */
  aiBobombBehind: 8,
  /** Fire Flower: the first shot when a kart is lined up this far ahead, m; then it keeps firing. */
  aiFireRange: 35,
  /** Golden Mushroom: once it's going, boost again when less than this much boost is left, s. */
  aiGoldenChain: 0.15,
  /**
   * Bullet Bill: fired this far behind the leader, m (MK8 hands it out by distance too), or on
   * giving up from this share of the field back (0.5 = the back half).
   */
  aiBulletGap: 60,
  aiBulletFrom: 0.5,
  /**
   * Piranha Plant: brought out when a kart is within this many times its reach ahead (it lasts
   * `piranhaTime` s: time to catch up).
   */
  aiPiranhaReaches: 6,
};
