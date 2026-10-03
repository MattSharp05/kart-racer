/** Plain-object 3D vector so sim state stays JSON-serialisable (ADR 0001). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}

/** Unit vector in the direction of `v`; the zero vector stays zero. */
export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  return len === 0 ? vec3() : scale(v, 1 / len);
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/** Rotates `v` around +Y by `angle` radians (counter-clockwise seen from above). */
export function rotateY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

/** Unit forward vector for a heading; heading 0 faces −Z (docs/TDD.md → Conventions). */
export function forwardFromHeading(heading: number): Vec3 {
  return rotateY(vec3(0, 0, -1), heading);
}

/** Clamps `value` to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Shortest signed difference between two angles, in (-π, π]. */
export function wrapAngleDelta(delta: number): number {
  const twoPi = Math.PI * 2;
  let d = delta % twoPi;
  if (d <= -Math.PI) d += twoPi;
  if (d > Math.PI) d -= twoPi;
  return d;
}

/** Counts a timer down by `dt`, snapping to exactly 0 (avoids float slivers like 2e-15). */
export function countDown(timer: number, dt: number): number {
  const next = timer - dt;
  return next <= 1e-9 ? 0 : next;
}

// --- Surface frames (MK-99, ADR 0011): mesh-track karts carry `forward` and `up` vectors ---

export const WORLD_UP: Readonly<Vec3> = Object.freeze({ x: 0, y: 1, z: 0 });

/** Angle between two unit vectors, radians. */
export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(clamp(dot(a, b), -1, 1));
}

/** Rotates `v` about the unit `axis` by `angle` radians (right-handed, Rodrigues). */
export function rotateAbout(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = cross(axis, v);
  const d = dot(axis, v) * (1 - c);
  return {
    x: v.x * c + k.x * s + axis.x * d,
    y: v.y * c + k.y * s + axis.y * d,
    z: v.z * c + k.z * s + axis.z * d,
  };
}

/** `v` with its part along unit `n` removed, normalised (the zero vector stays zero). */
export function orthonormal(v: Vec3, n: Vec3): Vec3 {
  return normalize(sub(v, scale(n, dot(v, n))));
}

/**
 * Turns unit `from` towards unit `to` by `fraction` of the angle between them, along the great
 * circle. Exactly opposite vectors have no such circle: they turn about `pivot` (unit, ⟂ `from`).
 */
export function turnTowards(from: Vec3, to: Vec3, fraction: number, pivot: Vec3): Vec3 {
  const angle = angleBetween(from, to);
  if (angle < 1e-9) return { ...to };
  const axis = cross(from, to);
  const len = length(axis);
  const turnAxis = len < 1e-9 ? pivot : scale(axis, 1 / len);
  return normalize(rotateAbout(from, turnAxis, angle * fraction));
}

/** World yaw of a direction (heading convention: 0 faces −Z, positive turns left), or `fallback` if vertical. */
export function headingOf(direction: Vec3, fallback: number): number {
  if (direction.x * direction.x + direction.z * direction.z < 1e-12) return fallback;
  return Math.atan2(-direction.x, -direction.z);
}
