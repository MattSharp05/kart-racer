import type { Vec3 } from './math';
import type { TrackGeometry, TrackProjection, TrackRoute } from './splineTrack';

/** A route measured once: where it leaves and rejoins the lap, and its length along the way. */
interface RouteInfo {
  route: TrackRoute;
  /** Lap fraction where it leaves the main road, and how much of the lap it stands in for. */
  from: number;
  span: number;
  /** Distance along the path to each point, m (the first is 0). */
  distances: number[];
  length: number;
}

const infos = new WeakMap<TrackGeometry, RouteInfo[]>();

/** The track's routes, measured against its main road (cached per track). */
export function routeInfos(geometry: TrackGeometry): RouteInfo[] {
  let list = infos.get(geometry);
  if (!list) {
    list = (geometry.def.routes ?? []).map((route) => {
      const first = route.path[0];
      const last = route.path.at(-1);
      if (!first || !last) throw new Error(`Track ${geometry.def.id}: a route needs a path`);
      const from = geometry.project(first).t;
      const to = geometry.project(last).t;
      const distances = [0];
      for (let i = 1; i < route.path.length; i += 1) {
        const a = route.path[i - 1] ?? first;
        const b = route.path[i] ?? first;
        distances.push((distances[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.z - a.z));
      }
      return {
        route,
        from,
        span: (((to - from) % 1) + 1) % 1,
        distances,
        length: distances.at(-1) ?? 0,
      };
    });
    infos.set(geometry, list);
  }
  return list;
}

/** Nearest point on a route's path to `position` (XZ): how far from it, and how far along, m. */
export function nearestOnRoute(info: RouteInfo, position: Vec3) {
  const { path } = info.route;
  let best = { distance: Infinity, along: 0, tangent: { x: 0, z: -1 } };
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const f = Math.min(
      1,
      Math.max(0, ((position.x - a.x) * dx + (position.z - a.z) * dz) / len ** 2),
    );
    const distance = Math.hypot(position.x - (a.x + dx * f), position.z - (a.z + dz * f));
    if (distance < best.distance) {
      best = {
        distance,
        along: (info.distances[i - 1] ?? 0) + f * len,
        tangent: { x: dx / len, z: dz / len },
      };
    }
  }
  return best;
}

/** The point `along` m down a route's path (clamped to its ends). */
export function pointOnRoute(info: RouteInfo, along: number): Vec3 {
  const { path } = info.route;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const d0 = info.distances[i - 1] ?? 0;
    const d1 = info.distances[i] ?? 0;
    if (!a || !b) continue;
    if (along <= d1 || i === path.length - 1) {
      const f = d1 > d0 ? Math.min(1, Math.max(0, (along - d0) / (d1 - d0))) : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
    }
  }
  return path[0] ?? { x: 0, y: 0, z: 0 };
}

/**
 * Lap progress of a kart that has left the main road for one of the track's routes (MK-61): the
 * lap fraction it stands for (moving smoothly from where the route leaves to where it rejoins, so
 * checkpoints on that stretch are passed in order) and the route's driving direction there.
 * Undefined on the main road or anywhere off it that isn't a route.
 */
export function routeProgress(
  geometry: TrackGeometry,
  position: Vec3,
  projection: TrackProjection,
): { t: number; tangent: { x: number; z: number } } | undefined {
  if (projection.surface !== 'out' || !geometry.def.routes?.length) return undefined;
  for (const info of routeInfos(geometry)) {
    const near = nearestOnRoute(info, position);
    if (near.distance > info.route.halfWidth) continue;
    const t = info.from + (info.span * near.along) / (info.length || 1);
    return { t: t - Math.floor(t), tangent: near.tangent };
  }
  return undefined;
}
