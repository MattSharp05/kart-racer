// Small 3-vector helpers for the MK-92 anti-gravity spike (prototype code, not the sim).
export type V3 = [number, number, number];

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const addScaled = (a: V3, b: V3, s: number): V3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export function normalize(a: V3): V3 {
  const l = length(a);
  return l > 0 ? scale(a, 1 / l) : [0, 1, 0];
}
/** Angle between two unit vectors, radians. */
export const angleBetween = (a: V3, b: V3): number =>
  Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
/** Rodrigues rotation of `v` about the unit axis `k` by `angle` (right-handed). */
export function rotateAbout(v: V3, k: V3, angle: number): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [
    v[0] * c + kv[0] * s + k[0] * kd,
    v[1] * c + kv[1] * s + k[1] * kd,
    v[2] * c + kv[2] * s + k[2] * kd,
  ];
}
/** Turns unit `from` towards unit `to` by `fraction` of the angle between them (great circle). */
export function slerpDir(from: V3, to: V3, fraction: number): V3 {
  const angle = angleBetween(from, to);
  if (angle < 1e-9) return to;
  const axis = cross(from, to);
  if (length(axis) < 1e-9) return from; // opposite: no defined plane, hold
  return normalize(rotateAbout(from, normalize(axis), angle * fraction));
}
/** `v` with its component along unit `n` removed, normalised. */
export const orthonormal = (v: V3, n: V3): V3 => normalize(addScaled(v, n, -dot(v, n)));
