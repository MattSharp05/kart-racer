// Pickups on the ground (MK-143): `tuning.mk8.pickupGround` (`./index.ts`).
export const mk8RouteGroundTuning = {
  pickupGround: {
    /**
     * An item box or coin is laid on the ground found within this far of its route spot, along the
     * road's up (above or below), m. The route's up is a smoothed guess: across a wide row it can
     * be off the floor by metres (Thwomp Ruins' tunnel), so the spot is searched for, not trusted.
     */
    search: 2.5,
  },
};
