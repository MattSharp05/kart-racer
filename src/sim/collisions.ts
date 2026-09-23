import { cancelDrift, isDrifting } from './drift';
import { kartPhysics } from './kartStats';
import { forwardFromHeading, type Vec3 } from './math';
import { tuning } from './tuning';
import type { KartState, SimEvent } from './types';

/**
 * Kart-vs-kart bumps (MK-8). Each kart is two circles (front and back) so a long kart doesn't
 * overlap others end-to-end. Heavier karts get pushed less and push harder.
 */

interface Circle {
  x: number;
  z: number;
}

function circles(kart: KartState, position: Vec3 = kart.position): Circle[] {
  const f = forwardFromHeading(kart.heading);
  const o = tuning.bumpCircleOffset;
  return [
    { x: position.x + f.x * o, z: position.z + f.z * o },
    { x: position.x - f.x * o, z: position.z - f.z * o },
  ];
}

function mass(kart: KartState): number {
  return 1 + kartPhysics(kart.kartType, 100).weight * tuning.bumpMassPerWeight;
}

/** Closest pair of circles between two karts: separation normal (a → b) and overlap depth. */
function contact(
  a: KartState,
  b: KartState,
): { nx: number; nz: number; depth: number } | undefined {
  let best: { nx: number; nz: number; depth: number } | undefined;
  const reach = tuning.kartRadius * 2;
  for (const ca of circles(a)) {
    for (const cb of circles(b)) {
      const dx = cb.x - ca.x;
      const dz = cb.z - ca.z;
      const distance = Math.hypot(dx, dz);
      const depth = reach - distance;
      if (depth <= 0 || (best && depth <= best.depth)) continue;
      best =
        distance > 1e-6 ? { nx: dx / distance, nz: dz / distance, depth } : { nx: 1, nz: 0, depth };
    }
  }
  return best;
}

/**
 * If two karts passed through each other this tick (fast head-on), move both back to where their
 * paths were closest so the bump still happens.
 */
function undoTunnelling(a: KartState, b: KartState, before: Map<number, Vec3>): void {
  const a0 = before.get(a.id);
  const b0 = before.get(b.id);
  if (!a0 || !b0) return;
  const rx0 = b0.x - a0.x;
  const rz0 = b0.z - a0.z;
  const rx1 = b.position.x - a.position.x;
  const rz1 = b.position.z - a.position.z;
  const dx = rx1 - rx0;
  const dz = rz1 - rz0;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return;
  // Relative motion was a straight segment; find its closest approach to zero.
  const tau = Math.min(1, Math.max(0, -(rx0 * dx + rz0 * dz) / len2));
  const closest = Math.hypot(rx0 + dx * tau, rz0 + dz * tau);
  const now = Math.hypot(rx1, rz1);
  if (closest >= tuning.kartRadius * 2 || now <= closest + 1e-6) return;
  for (const [kart, start] of [
    [a, a0],
    [b, b0],
  ] as const) {
    kart.position = {
      ...kart.position,
      x: start.x + (kart.position.x - start.x) * tau,
      z: start.z + (kart.position.z - start.z) * tau,
    };
  }
}

/** Separates overlapping karts and exchanges momentum along the contact normal. */
export function resolveKartCollisions(
  karts: KartState[],
  positionsBefore: Map<number, Vec3>,
  events: SimEvent[],
): void {
  for (let i = 0; i < karts.length; i += 1) {
    for (let j = i + 1; j < karts.length; j += 1) {
      const a = karts[i];
      const b = karts[j];
      if (!a || !b) continue;
      undoTunnelling(a, b, positionsBefore);
      const hit = contact(a, b);
      if (!hit) continue;

      const ma = mass(a);
      const mb = mass(b);
      // Positional correction: the lighter kart moves more.
      const share = hit.depth / (ma + mb);
      a.position = {
        ...a.position,
        x: a.position.x - hit.nx * share * mb,
        z: a.position.z - hit.nz * share * mb,
      };
      b.position = {
        ...b.position,
        x: b.position.x + hit.nx * share * ma,
        z: b.position.z + hit.nz * share * ma,
      };

      // Impulse along the normal if they're moving towards each other.
      const closing =
        (a.velocity.x - b.velocity.x) * hit.nx + (a.velocity.z - b.velocity.z) * hit.nz;
      if (closing <= 0) continue;
      const impulse = ((1 + tuning.bumpBounce) * closing) / (1 / ma + 1 / mb);
      a.velocity = {
        ...a.velocity,
        x: a.velocity.x - (impulse / ma) * hit.nx,
        z: a.velocity.z - (impulse / ma) * hit.nz,
      };
      b.velocity = {
        ...b.velocity,
        x: b.velocity.x + (impulse / mb) * hit.nx,
        z: b.velocity.z + (impulse / mb) * hit.nz,
      };
      events.push({ type: 'bump', a: a.id, b: b.id, strength: closing });

      // A hard knock breaks a drift; a light tap doesn't.
      for (const [kart, own] of [
        [a, ma],
        [b, mb],
      ] as const) {
        const knock = impulse / own;
        if (isDrifting(kart) && knock > tuning.bumpDriftCancel) cancelDrift(kart, events);
      }
    }
  }
}
