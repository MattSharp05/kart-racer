// Mesh-track routes (MK-98, ADR 0010). A mesh track's road comes from its collision mesh; the route
// is the hand-authored 3D centreline that says where the race goes: lap progress, checkpoints,
// respawn points, the grid, item boxes, coins and zones (glide ramps, water, boost bumpers). It is
// parametrised like a spline track (closed Catmull-Rom through the points, resampled evenly by
// length, `t` = lap fraction from the first point), but in 3D, so it can loop, roll and pass over
// itself. It never decides ground height: that's the collision mesh's job.
import { add, cross, dot, normalize, scale, sub, type Vec3 } from './math';
import { catmullRom, SUBDIVISIONS, type RespawnPoint } from './splineTrack';
import { tuning } from './tuning';

/** One control point of a route, in driving order. */
export interface RoutePoint {
  x: number;
  y: number;
  z: number;
  /** Road up here (unit-ish; it's interpolated and re-orthogonalised). Default +Y. */
  up?: Vec3;
  /** Road width here, m. */
  width: number;
  /** AI racing line here: offset from the centreline, m (positive = right). Default 0. */
  racingLine?: number;
}

/** A row of coins along the route (coins arrive with the coins ticket). */
export interface CoinLine {
  /** Lap fractions the line runs over. */
  from: number;
  to: number;
  /** Offset from the centreline, m (positive = right). */
  lateral: number;
  count: number;
}

/** Special places on a route. */
export type RouteZone =
  /** A glide ramp: leaving the ground between `from` and `to` starts a glide. */
  | { kind: 'glide'; from: number; to: number }
  /** A water volume (axis-aligned box, world space): karts inside are underwater. */
  | { kind: 'water'; min: Vec3; max: Vec3 }
  /** A boost bumper (anti-gravity spin boost on contact). */
  | { kind: 'boostBumper'; position: Vec3; radius: number }
  /** An anti-gravity section between `from` and `to` (lap fractions). */
  | { kind: 'antigrav'; from: number; to: number };

export interface RouteDef {
  /** Closed centreline in driving order; the start/finish line is at the first point. */
  points: RoutePoint[];
  /** Lap checkpoints as `t` values, ascending; the first is 0 (the finish line). */
  checkpoints: number[];
  /** Karts that fall off with their last safe spot in `from`..`to` are put back at `t`. */
  respawnPoints: RespawnPoint[];
  /** Starting grid, pole first. */
  gridSlots: { t: number; lateral: number }[];
  itemBoxRows: { t: number; laterals: number[] }[];
  coinLines: CoinLine[];
  zones: RouteZone[];
}

/** An evenly spaced point on the route with its frame. */
export interface RouteSample {
  position: Vec3;
  /** Unit driving direction. */
  tangent: Vec3;
  /** Unit road up, perpendicular to the tangent. */
  up: Vec3;
  /** Unit right of the driving direction (`tangent × up`). */
  right: Vec3;
  width: number;
  /** Distance from the start line along the centreline, m. */
  s: number;
}

/** Where a position is along the route. */
export interface RouteProjection {
  /** Lap fraction, [0, 1). */
  t: number;
  /** Distance along the lap, m, in [0, length). */
  s: number;
  /** Signed offset from the centreline along the route's right, m. */
  lateral: number;
  /** Straight-line distance from the nearest centreline sample, m. */
  distance: number;
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };
/** Spatial hash cell for nearest-sample lookups, m. */
const HASH_CELL = 16;

function wrap(i: number, n: number): number {
  return ((i % n) + n) % n;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Route index out of range: ${index}`);
  return item;
}

interface DensePoint {
  position: Vec3;
  up: Vec3;
  width: number;
  s: number;
}

/** Precomputed samples and a 3D spatial hash for one route. Built once per route (cached). */
export class RouteGeometry {
  readonly samples: RouteSample[];
  readonly length: number;
  private readonly cells = new Map<string, number[]>();

  constructor(readonly def: RouteDef) {
    const dense = RouteGeometry.densePoints(def.points);
    this.length = dense.at(-1)?.s ?? 0;
    this.samples = RouteGeometry.resample(dense, this.length);
    this.samples.forEach((sample, i) => {
      const key = RouteGeometry.cellKey(sample.position);
      const list = this.cells.get(key) ?? [];
      list.push(i);
      this.cells.set(key, list);
    });
  }

  private static cellKey(p: Vec3, dx = 0, dy = 0, dz = 0): string {
    return `${Math.floor(p.x / HASH_CELL) + dx},${Math.floor(p.y / HASH_CELL) + dy},${Math.floor(p.z / HASH_CELL) + dz}`;
  }

  /** The closed Catmull-Rom evaluated densely with cumulative 3D length (the last entry closes it). */
  private static densePoints(points: RoutePoint[]): DensePoint[] {
    const n = points.length;
    if (n < 4) throw new Error('A route needs at least 4 points');
    const out: DensePoint[] = [];
    const upOf = (p: RoutePoint) => p.up ?? WORLD_UP;
    let s = 0;
    let prev: Vec3 | undefined;
    for (let i = 0; i < n; i += 1) {
      const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((o) => at(points, wrap(i + o, n))) as [
        RoutePoint,
        RoutePoint,
        RoutePoint,
        RoutePoint,
      ];
      const [u0, u1, u2, u3] = [p0, p1, p2, p3].map(upOf) as [Vec3, Vec3, Vec3, Vec3];
      for (let k = 0; k < SUBDIVISIONS; k += 1) {
        const u = k / SUBDIVISIONS;
        const position = {
          x: catmullRom(p0.x, p1.x, p2.x, p3.x, u),
          y: catmullRom(p0.y, p1.y, p2.y, p3.y, u),
          z: catmullRom(p0.z, p1.z, p2.z, p3.z, u),
        };
        const up = {
          x: catmullRom(u0.x, u1.x, u2.x, u3.x, u),
          y: catmullRom(u0.y, u1.y, u2.y, u3.y, u),
          z: catmullRom(u0.z, u1.z, u2.z, u3.z, u),
        };
        if (prev) s += Math.hypot(position.x - prev.x, position.y - prev.y, position.z - prev.z);
        out.push({ position, up, width: p1.width + (p2.width - p1.width) * u, s });
        prev = position;
      }
    }
    const first = at(out, 0);
    if (prev)
      s += Math.hypot(
        first.position.x - prev.x,
        first.position.y - prev.y,
        first.position.z - prev.z,
      );
    out.push({ ...first, s });
    return out;
  }

  /** Resamples the dense polyline every `routeSampleSpacing` m, with an orthonormal frame each. */
  private static resample(dense: DensePoint[], length: number): RouteSample[] {
    const count = Math.max(8, Math.round(length / tuning.meshTrack.routeSampleSpacing));
    const points: { position: Vec3; up: Vec3; width: number }[] = [];
    let j = 0;
    for (let i = 0; i < count; i += 1) {
      const target = (i / count) * length;
      while (j < dense.length - 2 && at(dense, j + 1).s < target) j += 1;
      const a = at(dense, j);
      const b = at(dense, j + 1);
      const f = b.s > a.s ? (target - a.s) / (b.s - a.s) : 0;
      points.push({
        position: add(a.position, scale(sub(b.position, a.position), f)),
        up: add(a.up, scale(sub(b.up, a.up), f)),
        width: a.width + (b.width - a.width) * f,
      });
    }
    return points.map((p, i) => {
      const next = at(points, wrap(i + 1, count)).position;
      const prev = at(points, wrap(i - 1, count)).position;
      const tangent = normalize(sub(next, prev));
      const right = normalize(cross(tangent, p.up));
      const up = cross(right, tangent);
      return { position: p.position, tangent, up, right, width: p.width, s: (i / count) * length };
    });
  }

  sample(index: number): RouteSample {
    return at(this.samples, wrap(index, this.samples.length));
  }

  /** Point and frame at lap fraction `t` (linear between samples), `lateral` m to the right. */
  frameAt(t: number, lateral = 0): RouteSample {
    const n = this.samples.length;
    const pos = (((t % 1) + 1) % 1) * n;
    const i = Math.floor(pos);
    const f = pos - i;
    const a = this.sample(i);
    const b = this.sample(i + 1);
    const lerp = (u: Vec3, v: Vec3) => add(u, scale(sub(v, u), f));
    const tangent = normalize(lerp(a.tangent, b.tangent));
    const right = normalize(cross(tangent, lerp(a.up, b.up)));
    const centre = lerp(a.position, b.position);
    return {
      position: add(centre, scale(right, lateral)),
      tangent,
      up: cross(right, tangent),
      right,
      width: a.width + (b.width - a.width) * f,
      s: pos * (this.length / n),
    };
  }

  /**
   * Nearest centreline point to `position`. With `hint` (last tick's lap fraction), only samples
   * within `tuning.meshTrack.progressWindow` of it count, so a road passing over itself can't swap
   * progress; without one, the nearest sample anywhere.
   */
  project(position: Vec3, hint?: number): RouteProjection {
    const nearest =
      hint === undefined ? this.nearestSample(position) : this.nearestNear(position, hint);
    const a = this.sample(nearest);
    const n = this.samples.length;
    const spacing = this.length / n;
    // Slide along the tangent from the nearest sample, at most half a sample either way.
    const along = Math.max(
      -spacing / 2,
      Math.min(spacing / 2, dot(sub(position, a.position), a.tangent)),
    );
    const s = wrap(a.s + along, this.length);
    const offset = sub(position, a.position);
    return {
      t: s / this.length,
      s,
      lateral: dot(offset, a.right),
      distance: Math.sqrt(dot(offset, offset)),
    };
  }

  private nearestNear(position: Vec3, hint: number): number {
    const n = this.samples.length;
    const centre = Math.round((((hint % 1) + 1) % 1) * n);
    const reach = Math.ceil(tuning.meshTrack.progressWindow / (this.length / n));
    let best = centre;
    let bestD = Infinity;
    for (let k = -reach; k <= reach; k += 1) {
      const i = wrap(centre + k, n);
      const d = distanceSquared(this.sample(i).position, position);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private nearestSample(position: Vec3): number {
    let best = -1;
    let bestD = Infinity;
    for (let dz = -1; dz <= 1; dz += 1)
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          for (const i of this.cells.get(RouteGeometry.cellKey(position, dx, dy, dz)) ?? []) {
            const d = distanceSquared(this.sample(i).position, position);
            if (d < bestD || (d === bestD && i < best)) {
              bestD = d;
              best = i;
            }
          }
        }
    if (best >= 0) return best;
    // Far from the route: check every sample.
    this.samples.forEach((sample, i) => {
      const d = distanceSquared(sample.position, position);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }
}

function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

const geometries = new WeakMap<RouteDef, RouteGeometry>();

/** Precomputed geometry for a route (cached; routes are immutable data). */
export function routeGeometry(route: RouteDef): RouteGeometry {
  let geometry = geometries.get(route);
  if (!geometry) {
    geometry = new RouteGeometry(route);
    geometries.set(route, geometry);
  }
  return geometry;
}

/** Lap fraction of `position` along the route, [0, 1). `hint`: last known `t` (see `project`). */
export function progressAt(route: RouteDef, position: Vec3, hint?: number): number {
  return routeGeometry(route).project(position, hint).t;
}

/** Whether `position` is inside one of the route's water volumes. */
export function inWater(route: RouteDef, position: Vec3): boolean {
  for (const zone of route.zones) {
    if (zone.kind !== 'water') continue;
    const { min, max } = zone;
    if (
      position.x >= min.x &&
      position.x <= max.x &&
      position.y >= min.y &&
      position.y <= max.y &&
      position.z >= min.z &&
      position.z <= max.z
    )
      return true;
  }
  return false;
}
