import { wrapAngleDelta } from '../math';
import { nearestOnRoute, pointOnRoute, routeInfos } from '../routes';
import type { TrackGeometry } from '../splineTrack';
import { tuning } from '../tuning';
import type { AiState, KartState } from '../types';

/** Deterministic 0..1 from a driver, a lap and a route (the same race always makes the same calls). */
export function routeRoll(kart: KartState, ai: AiState, lap: number, index: number): number {
  const x =
    Math.sin(
      kart.id * 12.9898 + lap * 78.233 + index * 37.719 + ai.lineOffset * 5.4321 + ai.skill * 93.17,
    ) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The route the AI is driving right now (MK-61), if any: it rolls once per lap per route whether to
 * take it (seeded by the driver's personality, so each race differs by seed), and follows it from
 * where it leaves the main road until it has rejoined. Stateless: worked out from the kart's
 * position every tick, so it costs no sim state.
 */
export function aiRoute(kart: KartState, ai: AiState, geometry: TrackGeometry) {
  const infos = routeInfos(geometry);
  for (const [index, info] of infos.entries()) {
    if (routeRoll(kart, ai, kart.race.lap, index) >= info.route.aiChance) continue;
    const near = nearestOnRoute(info, kart.position);
    const finished = near.along >= info.length - tuning.ai.routeEndMargin;
    if (near.distance <= info.route.halfWidth + tuning.ai.routeCapture && !finished) {
      return { info, along: near.along };
    }
  }
  return undefined;
}

/**
 * Heading error (rad, positive = target to the left) to the point `distance` m further down the
 * route, and the tightest turn (1/m) on the route over the next `horizon` m, for corner speed.
 */
export function routeAim(
  kart: KartState,
  route: NonNullable<ReturnType<typeof aiRoute>>,
  distance: number,
  horizon: number,
) {
  const target = pointOnRoute(route.info, route.along + distance);
  const desired = Math.atan2(-(target.x - kart.position.x), -(target.z - kart.position.z));
  const error = wrapAngleDelta(desired - kart.heading);
  const step = tuning.ai.routeCurvatureStep;
  let curvature = 0;
  // Only as far as the route goes (past its end the points bunch up and the angles mean nothing).
  const reach = Math.min(horizon, route.info.length - route.along - 2 * step);
  for (let d = 0; d < reach; d += step) {
    const a = pointOnRoute(route.info, route.along + d);
    const b = pointOnRoute(route.info, route.along + d + step);
    const c = pointOnRoute(route.info, route.along + d + 2 * step);
    const h1 = Math.atan2(b.x - a.x, b.z - a.z);
    const h2 = Math.atan2(c.x - b.x, c.z - b.z);
    curvature = Math.max(curvature, Math.abs(wrapAngleDelta(h2 - h1)) / step);
  }
  return { error, curvature };
}
