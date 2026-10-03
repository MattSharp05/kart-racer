// Underwater (MK-107): inside one of the route's water volumes (`water` zones) a mesh-track kart is
// `inWater`: MK8's propeller look, with lower gravity, a slower top speed (more drag above it), a
// higher hop and a capped sink rate, so it floats. Crossing the surface gives a `waterEnter` or
// `waterExit` event (splash, sounds). Numbers in `tuning.mk8.water`. Only karts on tracks whose
// route has water get the flag; every other kart is exactly as before.
import { add, dot, scale, type Vec3 } from './math';
import type { RouteDef } from './route';
import { tuning } from './tuning';
import type { KartState, SimEvent } from './types';

/** `tuning.mk8.water`: how a kart drives inside a water volume. */
export interface WaterTuning {
  /** Top speed under water, as a share of the kart's own (boosts scale with it). */
  topSpeed: number;
  /** Gravity under water, as a share of `tuning.gravity`: longer, floatier jumps. */
  gravity: number;
  /** Speed above the underwater top speed (a kart diving in fast) is shed at this rate, m/s². */
  drag: number;
  /** In the air under water a kart sinks no faster than this, m/s. */
  maxSink: number;
  /** A hop's take-off speed under water, as a share of `tuning.hopVelocity`. */
  hop: number;
  /** A kart in the water leaves it only once this far outside the volume, m (no splash flicker). */
  exitMargin: number;
}

/** The water numbers, typed (and checked) as `WaterTuning`. */
export const waterTuning = (): WaterTuning => tuning.mk8.water;

/** Whether the route has any water volume. */
export function hasWater(route: RouteDef): boolean {
  return route.zones.some((zone) => zone.kind === 'water');
}

/** Whether `position` is inside one of the route's water volumes grown by `margin` m. */
export function insideWater(route: RouteDef, position: Vec3, margin = 0): boolean {
  for (const zone of route.zones) {
    if (zone.kind !== 'water') continue;
    const { min, max } = zone;
    if (
      position.x >= min.x - margin &&
      position.x <= max.x + margin &&
      position.y >= min.y - margin &&
      position.y <= max.y + margin &&
      position.z >= min.z - margin &&
      position.z <= max.z + margin
    )
      return true;
  }
  return false;
}

/**
 * Sets `kart.inWater` from where it is now (on tracks with water). Crossing in or out pushes
 * `waterEnter` / `waterExit`; the first look (a new or respawned kart) is silent.
 */
export function updateWater(kart: KartState, route: RouteDef, events: SimEvent[]): void {
  if (!hasWater(route)) return;
  const was = kart.inWater;
  const now = insideWater(route, kart.position, was ? waterTuning().exitMargin : 0);
  kart.inWater = now;
  if (was === undefined || was === now) return;
  events.push({ type: now ? 'waterEnter' : 'waterExit', kartId: kart.id });
}

/** Share of its top speed the kart can reach where it is (1 out of the water). */
export function waterSpeedScale(kart: KartState): number {
  return kart.inWater ? waterTuning().topSpeed : 1;
}

/** Share of `tuning.gravity` pulling the kart (1 out of the water). */
export function waterGravityScale(kart: KartState): number {
  return kart.inWater ? waterTuning().gravity : 1;
}

/** A hop's take-off speed, m/s. */
export function hopSpeed(kart: KartState): number {
  return tuning.hopVelocity * (kart.inWater ? waterTuning().hop : 1);
}

/** Under water: `velocity` with its speed along `gravityDir` (sinking) capped at `maxSink`. */
export function limitSink(kart: KartState, velocity: Vec3, gravityDir: Vec3): Vec3 {
  if (!kart.inWater) return velocity;
  const sink = dot(velocity, gravityDir);
  const max = waterTuning().maxSink;
  return sink > max ? add(velocity, scale(gravityDir, max - sink)) : velocity;
}
