import type { HazardDef } from './hazards/types';
import type { Vec3 } from './math';

/** One control point of a closed track centreline. Points are listed in driving order. */
export interface SplinePoint {
  x: number;
  y: number;
  z: number;
  /** Road width at this point, m. */
  width: number;
}

/** Positions along the track are fractions `t` of the lap, 0..1 from the start/finish line. */
export interface TrackRange {
  from: number;
  to: number;
}

/** Surfaces a zone can lay on the track; what each one does is in `sim/surfaces.ts` (MK-49). */
export type ZoneSurface = 'boostPad' | 'offroad' | 'ice' | 'sand' | 'conveyor';

/** A patch of special surface, e.g. a boost pad or a grass cut, by track position and lateral offset. */
export interface SurfaceZone extends TrackRange {
  /** Lateral range, m from the centreline (negative = left). */
  lateralMin: number;
  lateralMax: number;
  type: ZoneSurface;
  /**
   * Conveyors: which way the belt runs, radians from the driving direction (0 = with the track,
   * π/2 = towards its right, π = backwards). Its speed is `tuning.surfaces.conveyorSpeed`.
   */
  flowAngle?: number;
}

/**
 * Another way round part of the lap, off the main road (MK-61: a lower path through ruins). Its
 * floor is a `shortcuts` polygon; the route says where it goes, so a kart on it keeps making lap
 * progress along it (`sim/routes.ts`) and AI drivers can take it.
 */
export interface TrackRoute {
  /**
   * Its centreline, world space, in driving order: from a point on the main road before it leaves
   * to a point on the main road where it has rejoined.
   */
  path: Vec3[];
  /** A kart off the main road within this of the centreline is on the route, m. */
  halfWidth: number;
  /** Chance that an AI driver takes it on a given lap (seeded by the driver and the lap), 0..1. */
  aiChance: number;
}

/** A kart that falls off with its last safe spot in `from`..`to` is put back at `t` instead. */
export interface RespawnPoint extends TrackRange {
  t: number;
}

export interface WallGap extends TrackRange {
  side: 'left' | 'right' | 'both';
}

/** A spline race track, as pure data (ADR 0003). The mesh, physics and lap logic all derive from it. */
export interface SplineTrackDef {
  id: string;
  name: string;
  kind: 'spline';
  /** Closed Catmull-Rom centreline in driving order; the start/finish line is at the first point. */
  points: SplinePoint[];
  /** Grass band between the road edge and the wall, each side, m. */
  offroadWidth: number;
  /** Walls run along both outer edges except in these gaps (where karts can fall off). */
  wallGaps: WallGap[];
  surfaceZones: SurfaceZone[];
  /** Lap checkpoints as `t` values, ascending, first is 0 (the finish line). */
  checkpoints: number[];
  /**
   * Off-track areas of deep grass (e.g. an infield cut); karts can drive here, slowly. `surface`
   * (MK-61) lays another surface instead (`road`: a paved lower path).
   */
  shortcuts?: { polygon: { x: number; z: number }[]; y: number; surface?: Surface }[];
  /** Other ways round part of the lap (MK-61), each over a `shortcuts` floor. */
  routes?: TrackRoute[];
  /** Where karts that fall off in certain stretches are put back (MK-61: each bridge's start). */
  respawnPoints?: RespawnPoint[];
  /** Jump ramps, drawn with chevrons (the ramp shape itself comes from the points' `y`). */
  ramps?: TrackRange[];
  /** Starting grid, pole first. */
  gridSlots?: { t: number; lateral: number }[];
  /** Item box rows (boxes arrive in MK-16). */
  itemBoxRows?: { t: number; laterals: number[] }[];
  /** AI racing line: lateral offset (m) at evenly spaced lap fractions i / length (MK-14). */
  aiLine?: number[];
  /** Moving, rotating, periodic and zone hazards (MK-49); their state is a pure function of tick. */
  hazards?: HazardDef[];
}

/** A resampled point on the centreline, evenly spaced along its length. */
export interface TrackSample {
  x: number;
  y: number;
  z: number;
  /** Unit tangent (driving direction) on the XZ plane. */
  tx: number;
  tz: number;
  /** Unit normal pointing to the right of the driving direction, XZ. */
  nx: number;
  nz: number;
  width: number;
  /** Distance from the start line along the centreline, m. */
  s: number;
}

/** `rough` = deep grass on shortcuts: slower than the verges, so a cut only pays with a boost. */
export type Surface = 'road' | 'rough' | 'out' | ZoneSurface;

export interface TrackProjection {
  /** Distance along the lap, m, in [0, length). */
  s: number;
  /** Lap fraction, [0, 1). */
  t: number;
  /** Signed distance from the centreline, m (positive = right of the driving direction). */
  lateral: number;
  /** Road height here, m. */
  groundY: number;
  width: number;
  surface: Surface;
  /** The surface zone here, if any (conveyors read their `flowAngle` from it). */
  zone?: SurfaceZone;
  /** Unit right-normal of the track here (XZ). */
  normal: { x: number; z: number };
  /** Unit tangent of the track here (XZ). */
  tangent: { x: number; z: number };
}

/** Distance between resampled centreline points, m. */
const SAMPLE_SPACING = 1;
/** Spatial hash cell size for projection lookups, m. */
const CELL_SIZE = 16;
/** Catmull-Rom evaluations per control segment before resampling. */
const SUBDIVISIONS = 40;

function catmullRom(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  );
}

/** Array access that fails loudly instead of returning undefined. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Track index out of range: ${index}`);
  return item;
}

function wrap(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/** Precomputed samples + spatial hash for one track. Pure data, built once per track id. */
export class TrackGeometry {
  readonly samples: TrackSample[];
  readonly length: number;
  private readonly cells = new Map<string, number[]>();

  constructor(readonly def: SplineTrackDef) {
    const dense = TrackGeometry.densePoints(def.points);
    this.length = dense.at(-1)?.s ?? 0;
    this.samples = TrackGeometry.resample(dense, this.length);
    this.samples.forEach((sample, i) => {
      const key = TrackGeometry.cellKey(sample.x, sample.z);
      const list = this.cells.get(key) ?? [];
      list.push(i);
      this.cells.set(key, list);
    });
  }

  private static cellKey(x: number, z: number): string {
    return `${Math.floor(x / CELL_SIZE)},${Math.floor(z / CELL_SIZE)}`;
  }

  /** Evaluates the closed spline densely and records cumulative length (last entry closes the loop). */
  private static densePoints(points: SplinePoint[]): (SplinePoint & { s: number })[] {
    const n = points.length;
    if (n < 4) throw new Error('A spline track needs at least 4 points');
    const out: (SplinePoint & { s: number })[] = [];
    let s = 0;
    let prev: SplinePoint | undefined;
    for (let i = 0; i < n; i += 1) {
      const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((o) => at(points, wrap(i + o, n))) as [
        SplinePoint,
        SplinePoint,
        SplinePoint,
        SplinePoint,
      ];
      for (let k = 0; k < SUBDIVISIONS; k += 1) {
        const u = k / SUBDIVISIONS;
        const point = {
          x: catmullRom(p0.x, p1.x, p2.x, p3.x, u),
          y: catmullRom(p0.y, p1.y, p2.y, p3.y, u),
          z: catmullRom(p0.z, p1.z, p2.z, p3.z, u),
          width: p1.width + (p2.width - p1.width) * u,
        };
        if (prev) s += Math.hypot(point.x - prev.x, point.z - prev.z);
        out.push({ ...point, s });
        prev = point;
      }
    }
    const first = at(out, 0);
    if (prev) s += Math.hypot(first.x - prev.x, first.z - prev.z);
    out.push({ ...first, s });
    return out;
  }

  /** Resamples the dense polyline to evenly spaced samples with tangents and normals. */
  private static resample(dense: (SplinePoint & { s: number })[], length: number): TrackSample[] {
    const count = Math.max(8, Math.round(length / SAMPLE_SPACING));
    const positions: SplinePoint[] = [];
    let j = 0;
    for (let i = 0; i < count; i += 1) {
      const target = (i / count) * length;
      while (j < dense.length - 2 && at(dense, j + 1).s < target) j += 1;
      const a = at(dense, j);
      const b = at(dense, j + 1);
      const f = b.s > a.s ? (target - a.s) / (b.s - a.s) : 0;
      positions.push({
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        z: a.z + (b.z - a.z) * f,
        width: a.width + (b.width - a.width) * f,
      });
    }
    return positions.map((p, i) => {
      const next = at(positions, wrap(i + 1, count));
      const prev = at(positions, wrap(i - 1, count));
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const tx = dx / len;
      const tz = dz / len;
      // Right of the driving direction: heading 0 faces −Z and its right is +X.
      return { ...p, tx, tz, nx: -tz, nz: tx, s: (i / count) * length };
    });
  }

  sample(index: number): TrackSample {
    return at(this.samples, wrap(index, this.samples.length));
  }

  /** World position at lap fraction `t` and lateral offset (positive = right). */
  pointAt(t: number, lateral = 0): Vec3 {
    const { a, b, f } = this.bracket(t);
    const x = a.x + (b.x - a.x) * f;
    const y = a.y + (b.y - a.y) * f;
    const z = a.z + (b.z - a.z) * f;
    const nx = a.nx + (b.nx - a.nx) * f;
    const nz = a.nz + (b.nz - a.nz) * f;
    const nl = Math.hypot(nx, nz) || 1;
    return { x: x + (nx / nl) * lateral, y, z: z + (nz / nl) * lateral };
  }

  /** Unit driving direction at lap fraction `t` (XZ). */
  tangentAt(t: number): { x: number; z: number } {
    const { a, b, f } = this.bracket(t);
    const x = a.tx + (b.tx - a.tx) * f;
    const z = a.tz + (b.tz - a.tz) * f;
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len };
  }

  /** Kart heading that faces along the track at `t` (heading 0 faces −Z). */
  headingAt(t: number): number {
    const { x, z } = this.tangentAt(t);
    return Math.atan2(-x, -z);
  }

  private bracket(t: number): { a: TrackSample; b: TrackSample; f: number } {
    const n = this.samples.length;
    const pos = (((t % 1) + 1) % 1) * n;
    const i = Math.floor(pos);
    return { a: this.sample(i), b: this.sample(i + 1), f: pos - i };
  }

  /** Nearest point on the centreline to `pos`, with lateral offset, height and surface. */
  project(pos: Vec3): TrackProjection {
    const nearest = this.nearestSample(pos);
    // Invert pointAt on the segments around the nearest sample; keep the one that reconstructs `pos`
    // best (on the inside of a bend with a large offset, the answer can sit in a neighbouring segment).
    let best = { error: Infinity, i: nearest, f: 0 };
    for (let i = nearest - 2; i <= nearest + 1; i += 1) {
      const a = this.sample(i);
      const b = this.sample(i + 1);
      const f = this.refine(a, b, pos, this.chordFraction(a, b, pos));
      const n = TrackGeometry.normalAt(a, b, f);
      const cx = a.x + (b.x - a.x) * f;
      const cz = a.z + (b.z - a.z) * f;
      // Along-track residual left over (0 when pos is exactly on this segment's normal).
      const error =
        Math.abs((pos.x - cx) * n.z - (pos.z - cz) * n.x) + (f <= 0 || f >= 1 ? 1e-3 : 0);
      if (error < best.error) best = { error, i, f };
    }
    const a = this.sample(best.i);
    const b = this.sample(best.i + 1);
    const f = best.f;
    const cx = a.x + (b.x - a.x) * f;
    const cz = a.z + (b.z - a.z) * f;
    const normal = TrackGeometry.normalAt(a, b, f);
    const lateral = (pos.x - cx) * normal.x + (pos.z - cz) * normal.z;
    const n = this.samples.length;
    const s = ((wrap(best.i, n) + f) / n) * this.length;
    const t = s / this.length;
    const width = a.width + (b.width - a.width) * f;
    const zone = this.zoneAt(t, lateral);
    return {
      s,
      t,
      lateral,
      groundY: a.y + (b.y - a.y) * f,
      width,
      surface: zone ? zone.type : this.baseSurface(lateral, width),
      ...(zone ? { zone } : {}),
      normal,
      tangent: { x: normal.z, z: -normal.x },
    };
  }

  private chordFraction(a: TrackSample, b: TrackSample, pos: Vec3): number {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    return Math.min(1, Math.max(0, ((pos.x - a.x) * abx + (pos.z - a.z) * abz) / len2));
  }

  private static normalAt(a: TrackSample, b: TrackSample, f: number): { x: number; z: number } {
    const nx = a.nx + (b.nx - a.nx) * f;
    const nz = a.nz + (b.nz - a.nz) * f;
    const nl = Math.hypot(nx, nz) || 1;
    return { x: nx / nl, z: nz / nl };
  }

  /**
   * Finds f in [0, 1] where `pos` lies exactly along the interpolated normal from the centreline,
   * i.e. the inverse of `pointAt` (a few Newton steps on the along-track residual).
   */
  private refine(a: TrackSample, b: TrackSample, pos: Vec3, start: number): number {
    const residual = (f: number) => {
      const n = TrackGeometry.normalAt(a, b, f);
      const cx = a.x + (b.x - a.x) * f;
      const cz = a.z + (b.z - a.z) * f;
      // Tangent is the normal rotated back: along-track component of the offset.
      return (pos.x - cx) * n.z - (pos.z - cz) * n.x;
    };
    let f = start;
    const h = 1e-4;
    for (let k = 0; k < 4; k += 1) {
      const r = residual(f);
      const slope = (residual(f + h) - r) / h;
      if (slope === 0) break;
      f = Math.min(1, Math.max(0, f - r / slope));
    }
    return f;
  }

  /** Whether there is a wall on `side` at lap fraction `t`. */
  hasWall(t: number, side: 'left' | 'right'): boolean {
    return !this.def.wallGaps.some(
      (gap) => (gap.side === side || gap.side === 'both') && inRange(t, gap),
    );
  }

  /** Lateral distance of the walls from the centreline, m. */
  wallOffset(width: number): number {
    return width / 2 + this.def.offroadWidth;
  }

  private zoneAt(t: number, lateral: number): SurfaceZone | undefined {
    return this.def.surfaceZones.find(
      (z) => inRange(t, z) && lateral >= z.lateralMin && lateral <= z.lateralMax,
    );
  }

  private baseSurface(lateral: number, width: number): Surface {
    const distance = Math.abs(lateral);
    if (distance <= width / 2) return 'road';
    if (distance <= this.wallOffset(width)) return 'offroad';
    return 'out';
  }

  private nearestSample(pos: Vec3): number {
    const cx = Math.floor(pos.x / CELL_SIZE);
    const cz = Math.floor(pos.z / CELL_SIZE);
    for (let radius = 1; radius <= 64; radius *= 2) {
      let best = -1;
      let bestD2 = Infinity;
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          for (const i of this.cells.get(`${cx + dx},${cz + dz}`) ?? []) {
            const sample = at(this.samples, i);
            const d2 = (pos.x - sample.x) ** 2 + (pos.z - sample.z) ** 2;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = i;
            }
          }
        }
      }
      // A hit within the searched square is only guaranteed nearest if it's closer than the square's edge.
      if (best >= 0 && Math.sqrt(bestD2) <= radius * CELL_SIZE) return best;
    }
    return this.samples.reduce(
      (best, sample, i) => {
        const d2 = (pos.x - sample.x) ** 2 + (pos.z - sample.z) ** 2;
        return d2 < best.d2 ? { d2, i } : best;
      },
      { d2: Infinity, i: 0 },
    ).i;
  }
}

/** Whether lap fraction `t` is inside `range` (ranges may wrap past the finish line). */
export function inRange(t: number, range: TrackRange): boolean {
  return range.from <= range.to
    ? t >= range.from && t <= range.to
    : t >= range.from || t <= range.to;
}

/** Point-in-polygon on the XZ plane (even-odd rule). */
export function insidePolygon(x: number, z: number, polygon: { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
