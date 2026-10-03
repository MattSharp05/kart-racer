import { loadoutStats } from '../mk8/content/stats';
import { kartDef, type KartId } from './data/karts';
import { tuning, type EngineClass } from './tuning';
import type { Loadout } from './types';

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
  /** Drift mini-turbo charge rate multiplier (1 = normal; strong-drift racers charge faster). */
  driftCharge: number;
  /** Multiplier on sideways grip, road and drift (1 = normal; MK8 loadouts' traction, MK-102). */
  grip: number;
}

/**
 * Turns a kart's stats into physics numbers for an engine class: a racer's 1–5 stats, or with a
 * `loadout` (MK8 Mode, MK-102) its parts' MK8 stats through `tuning.mk8.statMap`.
 */
export function kartPhysics(
  kartType: KartId,
  engineClass: EngineClass,
  loadout?: Loadout,
): KartPhysics {
  if (loadout) return loadoutPhysics(loadout, engineClass);
  const { stats, strongDrift } = kartDef(kartType);
  const { speedPerPoint, accelerationPerPoint, handlingPerPoint } = tuning.stats;
  return {
    topSpeed: tuning.topSpeed[engineClass] * (1 + (stats.speed - NEUTRAL_STAT) * speedPerPoint),
    timeTo95: tuning.timeTo95 * (1 - (stats.acceleration - NEUTRAL_STAT) * accelerationPerPoint),
    handling: 1 + (stats.handling - NEUTRAL_STAT) * handlingPerPoint,
    weight: stats.weight,
    driftCharge: strongDrift ? tuning.strongDriftCharge : 1,
    grip: 1,
  };
}

/** An MK8 loadout's physics: its summed stats (0.75–5.75), each point from neutral a step. */
export function loadoutPhysics(loadout: Loadout, engineClass: EngineClass): KartPhysics {
  const stats = loadoutStats(loadout);
  const map = tuning.mk8.statMap;
  const off = (value: number) => value - map.neutral;
  return {
    topSpeed: tuning.topSpeed[engineClass] * (1 + off(stats.speed) * map.speedPerPoint),
    timeTo95: tuning.timeTo95 * (1 - off(stats.acceleration) * map.accelerationPerPoint),
    handling: 1 + off(stats.handling) * map.handlingPerPoint,
    weight: stats.weight * map.weightPerPoint,
    driftCharge: 1 + off(stats.miniTurbo) * map.miniTurboPerPoint,
    grip: 1 + off(stats.traction) * map.gripPerPoint,
  };
}
