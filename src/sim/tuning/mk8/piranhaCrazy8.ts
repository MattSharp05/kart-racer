// The Piranha Plant, coin item and Crazy 8 (MK-126): part of `tuning.mk8` (`./index.ts`).
export const mk8PiranhaCrazy8Tuning = {
  /** Piranha Plant: held in front of the kart, lunging, for this long from its first use, s. */
  piranhaTime: 7.5,
  /** It lunges at karts, items and coins within this distance of the kart's centre, m… */
  piranhaReach: 5,
  /** …and within this angle either side of straight ahead, radians. */
  piranhaCone: 1,
  /** Time between lunges, s. */
  piranhaLungeSeconds: 0.9,
  /** Each lunge's boost, s (a mushroom is `tuning.mushroomSeconds`). */
  piranhaBoostSeconds: 0.35,
  /** The coin item: coins it adds (never past `tuning.mk8.coins.max`). */
  coinItemCoins: 2,
};
