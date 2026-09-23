import { KARTS, type KartId } from './data/karts';
import { tuning, type EngineClass } from './tuning';

/** Stat 3 is neutral; each point above/below scales these by the tuning step. */
const NEUTRAL_STAT = 3;

export interface KartPhysics {
  /** Road top speed, m/s. */
  topSpeed: number;
  /** Seconds from rest to 95% of top speed. */
  timeTo95: number;
  /** Multiplier on normal and drift turn rates. */
  handling: number;
  weight: number;
}

/** Turns a kart's 1–5 stats into physics numbers for an engine class. */
export function kartPhysics(kartType: KartId, engineClass: EngineClass): KartPhysics {
  const { stats } = KARTS[kartType];
  const { speedPerPoint, accelerationPerPoint, handlingPerPoint } = tuning.stats;
  return {
    topSpeed: tuning.topSpeed[engineClass] * (1 + (stats.speed - NEUTRAL_STAT) * speedPerPoint),
    timeTo95: tuning.timeTo95 * (1 - (stats.acceleration - NEUTRAL_STAT) * accelerationPerPoint),
    handling: 1 + (stats.handling - NEUTRAL_STAT) * handlingPerPoint,
    weight: stats.weight,
  };
}
