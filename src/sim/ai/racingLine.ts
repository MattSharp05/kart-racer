import type { TrackGeometry } from '../splineTrack';

/** Keep the line this far inside the road edges, m. */
const EDGE_MARGIN = 2.2;
const POINTS = 400;
const ITERATIONS = 400;

/**
 * Computes a racing line as lateral offsets from the centreline at `POINTS` evenly spaced lap
 * fractions: repeatedly pulls each point towards the midpoint of its neighbours (straightening the
 * path, so it cuts to the inside of corners) while keeping it on the road. Deterministic.
 */
export function computeRacingLine(geometry: TrackGeometry): number[] {
  const centre = Array.from({ length: POINTS }, (_, i) => {
    const t = i / POINTS;
    const p = geometry.pointAt(t);
    const n = geometry.pointAt(t, 1);
    const width = geometry.project(p).width;
    return { x: p.x, z: p.z, nx: n.x - p.x, nz: n.z - p.z, limit: width / 2 - EDGE_MARGIN };
  });
  const offsets = new Array<number>(POINTS).fill(0);
  const wrap = (i: number) => (i + POINTS) % POINTS;
  const at = (i: number) => {
    const c = centre[wrap(i)];
    const l = offsets[wrap(i)] ?? 0;
    return c ? { x: c.x + c.nx * l, z: c.z + c.nz * l } : { x: 0, z: 0 };
  };
  for (let k = 0; k < ITERATIONS; k += 1) {
    for (let i = 0; i < POINTS; i += 1) {
      const a = at(i - 1);
      const b = at(i + 1);
      const c = centre[i];
      if (!c) continue;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const lateral = (mx - c.x) * c.nx + (mz - c.z) * c.nz;
      offsets[i] = Math.max(-c.limit, Math.min(c.limit, lateral));
    }
  }
  return offsets.map((o) => Math.round(o * 100) / 100);
}

/** Racing-line lateral offset at lap fraction `t` (linear between stored points). */
export function lineOffsetAt(line: readonly number[], t: number): number {
  const n = line.length;
  if (n === 0) return 0;
  const pos = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(pos);
  const a = line[i % n] ?? 0;
  const b = line[(i + 1) % n] ?? 0;
  return a + (b - a) * (pos - i);
}
