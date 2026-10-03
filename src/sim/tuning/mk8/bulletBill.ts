// Bullet Bill (MK-120): part of `tuning.mk8` (`./index.ts`).
export const mk8BulletBillTuning = {
  // Bullet Bill (MK-120): rides the route's AI line, hitting every kart it touches.
  /** It lasts this long, s, at this speed (a fraction of the engine class's top speed). */
  bulletTime: 6,
  bulletSpeed: 1.7,
  /** It eases onto the AI line at up to this sideways speed, m/s. */
  bulletSteer: 4,
  /** It spins out karts this close to its centre, m, knocking them aside at this speed, m/s. */
  bulletRadius: 2.2,
  bulletKnock: 8,
  /** It finds the road this far either side of the route along its up, m. */
  bulletProbe: 4,
  /** At the end: a boost this long, s; no safe road where it is → the first within this far on, m. */
  bulletEndBoost: 1,
  bulletSafeSearch: 80,
};
