// Spiny Shell (MK-113): flies along the route to the race leader and explodes on it; and the Super
// Horn's shockwave. Part of `tuning.mk8` (`./index.ts`).
export const mk8SpinyHornTuning = {
  /** Speed along the route, as a fraction of the engine class's top speed. */
  spinySpeed: 2.2,
  /** It skims the road for this long after it's thrown, hitting karts it touches, s… */
  spinyGroundSeconds: 1.5,
  /** …then climbs to this height above the route (along its up) at this rate, m and m/s. */
  spinyAirHeight: 6,
  spinyClimbRate: 8,
  /** It skims the road this high, m (karts touch it there). */
  spinyGroundHeight: 0.4,
  /** It touches karts this close on the ground leg, m. */
  spinyTouchRadius: 1.4,
  /** Thrown off the centreline, it eases back onto it at this rate, 1/s (exponential). */
  spinyCentreRate: 2,
  /** It dives once the leader is this close ahead along the route (or behind it), m… */
  spinyDiveDistance: 18,
  /** …taking this long from there to the explosion, s (hover over the leader, then drop). */
  spinyDiveSeconds: 1.4,
  /** The last this share of the dive is the drop onto the leader (before it, it closes in). */
  spinyDropShare: 0.4,
  /** The explosion hits every kart this close to where it lands, m… */
  spinyRadius: 6,
  /** …and the blast stays up (hitting karts that drive into it) this long, s. */
  spinyBlastSeconds: 0.5,
  /** A kart it blows up spins this long (a shell's spin-out is `spinSeconds`), s… */
  spinySpinSeconds: 1.8,
  /** …thrown up at this speed along its up, m/s. */
  spinyLaunchSpeed: 9,
  /** It's gone after this long whatever happens, s. */
  spinyLifeSeconds: 60,
  /** Super Horn (MK-113): its shockwave reaches this far round the user, m… */
  hornRadius: 9,
  /** …and is drawn for this long, s. */
  hornWaveSeconds: 0.4,
};
