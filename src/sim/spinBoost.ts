// Anti-gravity spin boost (MK-108): in MK8, bumping another kart or a boost bumper while on
// anti-gravity ground gives a short burst of speed (the kart does a spin). Mesh tracks only:
// `collisions.ts` grants it on a kart-kart bump between two anti-gravity karts, `updateMeshKart`
// (`surfaceKart.ts`) runs it and the route's boost bumpers (`hitBumpers`).
import { forwardFromHeading, add, dot, length, scale, sub, type Vec3 } from './math';
import { updateForwardSpeed } from './kart';
import type { RouteZone } from './route';
import { tuning } from './tuning';
import type { InputFrame, KartState, SimEvent } from './types';

/** Gives `kart` a spin boost (not again while one is running) and a `spinBoost` event. */
export function grantSpinBoost(kart: KartState, events: SimEvent[]): void {
  if ((kart.spinBoostTimer ?? 0) > 0) return;
  kart.spinBoostTimer = tuning.mk8.spinBoost.seconds;
  events.push({ type: 'spinBoost', kartId: kart.id });
}

/**
 * This tick's forward speed with a running spin boost: at least the speed the boost pulls the kart
 * towards (`tuning.mk8.spinBoost.speed` × top speed, as if full throttle); braking cancels it.
 * Counts the boost down. Without one, `pedalSpeed` unchanged.
 */
export function applySpinBoost(
  kart: KartState,
  pedalSpeed: number,
  forwardSpeed: number,
  pedals: InputFrame,
  topSpeed: number,
  dt: number,
): number {
  const left = kart.spinBoostTimer ?? 0;
  if (left <= 0) return pedalSpeed;
  kart.spinBoostTimer = Math.max(0, left - dt);
  if (pedals.brake > 0) return pedalSpeed;
  const { speed, accelRate } = tuning.mk8.spinBoost;
  const boosted = updateForwardSpeed(
    forwardSpeed,
    { ...pedals, throttle: 1 },
    topSpeed * speed,
    dt,
    accelRate,
  );
  return Math.max(pedalSpeed, boosted);
}

/**
 * Boost bumpers (route `boostBumper` zones): static round colliders. The kart's two bump circles
 * (as kart-kart bumps) are pushed out of the bumper's circle in the kart's own plane (so a bumper
 * on a wall works too; one further than `tuning.mk8.bumpHeight` along `up` is out of reach) and
 * bounce off it. Touching one in anti-gravity gives a spin boost; elsewhere it's just a collider.
 */
export function hitBumpers(
  kart: KartState,
  zones: readonly RouteZone[],
  up: Vec3,
  forward: Vec3,
  events: SimEvent[],
): void {
  const offset = scale(forward, tuning.bumpCircleOffset);
  for (const zone of zones) {
    if (zone.kind !== 'boostBumper') continue;
    const reach = tuning.kartRadius + zone.radius;
    let best: { flat: Vec3; distance: number; depth: number } | undefined;
    for (const centre of [add(kart.position, offset), sub(kart.position, offset)]) {
      const d = sub(centre, zone.position);
      const along = dot(d, up);
      if (Math.abs(along) > tuning.mk8.bumpHeight) continue;
      const flat = sub(d, scale(up, along));
      const distance = length(flat);
      const depth = reach - distance;
      if (depth > 0 && (!best || depth > best.depth)) best = { flat, distance, depth };
    }
    if (!best) continue;
    // Dead centre: back out the way the kart came.
    const n =
      best.distance > 1e-6
        ? scale(best.flat, 1 / best.distance)
        : scale(kart.forward ?? forwardFromHeading(kart.heading), -1);
    kart.position = add(kart.position, scale(n, best.depth));
    const into = -dot(kart.velocity, n);
    if (into <= 0) continue;
    kart.velocity = add(kart.velocity, scale(n, into * (1 + tuning.mk8.spinBoost.bumperBounce)));
    events.push({ type: 'wallHit', kartId: kart.id, strength: into });
    if (kart.antigrav) grantSpinBoost(kart, events);
  }
}
