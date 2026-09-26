import { rotateY, type Vec3 } from '../math';
import { DT } from '../tuning';
import type { HazardContact } from './types';

/** Where in its cycle a hazard is at `ticks`: 0..1. */
export function cyclePhase(ticks: number, period: number, phase = 0): number {
  const cycles = (ticks * DT) / period + phase;
  return cycles - Math.floor(cycles);
}

/** Contact between a circle (a kart) and a circle collider. */
export function circleContact(
  cx: number,
  cz: number,
  colliderRadius: number,
  position: Vec3,
  radius: number,
): HazardContact | undefined {
  const dx = position.x - cx;
  const dz = position.z - cz;
  const distance = Math.hypot(dx, dz);
  const depth = colliderRadius + radius - distance;
  if (depth <= 0) return undefined;
  // Dead centre: push along +X (any direction works; this one is deterministic).
  return distance > 0 ? { nx: dx / distance, nz: dz / distance, depth } : { nx: 1, nz: 0, depth };
}

/** Where `position` is in a box's own frame (X across, Z along its heading). */
export function toBoxFrame(centre: Vec3, heading: number, position: Vec3): Vec3 {
  return rotateY({ x: position.x - centre.x, y: 0, z: position.z - centre.z }, -heading);
}

/**
 * Contact between a circle (a kart) and an oriented box `halfWidth` × `halfLength` rotated by
 * `heading`. A centre inside the box is pushed out through the nearest side.
 */
export function boxContact(
  centre: Vec3,
  heading: number,
  halfWidth: number,
  halfLength: number,
  position: Vec3,
  radius: number,
): HazardContact | undefined {
  const local = toBoxFrame(centre, heading, position);
  const cx = Math.max(-halfWidth, Math.min(halfWidth, local.x));
  const cz = Math.max(-halfLength, Math.min(halfLength, local.z));
  const dx = local.x - cx;
  const dz = local.z - cz;
  const distance = Math.hypot(dx, dz);
  let normal: Vec3;
  let depth: number;
  if (distance > 0) {
    if (distance >= radius) return undefined;
    normal = { x: dx / distance, y: 0, z: dz / distance };
    depth = radius - distance;
  } else {
    // Inside: leave through whichever side is closest.
    const toX = halfWidth - Math.abs(local.x);
    const toZ = halfLength - Math.abs(local.z);
    normal =
      toX < toZ
        ? { x: local.x >= 0 ? 1 : -1, y: 0, z: 0 }
        : { x: 0, y: 0, z: local.z >= 0 ? 1 : -1 };
    depth = Math.min(toX, toZ) + radius;
  }
  const world = rotateY(normal, heading);
  return { nx: world.x, nz: world.z, depth };
}
