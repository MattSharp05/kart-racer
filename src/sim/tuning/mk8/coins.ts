// Coins (MK-109, `sim/coins.ts`): `tuning.mk8.coins` (`./index.ts`).
export const mk8CoinTuning = {
  /** Coins on a course's coin lines (MK-109): picked up on touch, up to `max` per kart. */
  coins: {
    /** Most coins a kart can hold (MK8: 10). */
    max: 10,
    /** Top speed each coin held adds, m/s (10 coins at 150cc ≈ +5 %). */
    speed: 0.14,
    /** Speed a pickup adds along the kart's facing, m/s (never past its top speed). */
    pickupSpeed: 0.8,
    /** A collected line coin comes back after this, s. */
    respawn: 10,
    /** A kart touches a coin within this distance of its centre, m. */
    radius: 1.6,
    /** Coins lost when hit by an item (dropped as loose coins) or falling off (gone). */
    lost: 3,
    /** Dropped coins land on a ring this far from the kart, m (beyond `radius`). */
    scatterRadius: 2.6,
    /** Dropped coins stay this long, s, then vanish. */
    scatterLife: 6,
    /** The kart that dropped them can't pick them back up for this long, s. */
    scatterOwnerImmune: 1.5,
  },
};
