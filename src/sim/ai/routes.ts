import { wrapAngleDelta } from '../math';
import { rngFloat, seedRng } from '../rng';
import { nearestOnRoute, pointOnRoute, routeInfos } from '../routes';
import type { TrackGeometry } from '../splineTrack';
import { tuning } from '../tuning';
import type { AiState, KartState } from '../types';
import { curvatureAlong } from './curvature';

/** Odd multipliers that spread the inputs of the route roll over the 32-bit seed. */
const HASH = { kart: 0x9e3779b1, lap: 0x85ebca77, route: 0xc2b2ae3d, personality: 0x27d4eb2f };
/** Personality values are rounded to this many steps per unit before hashing. */
const HASH_PRECISION = 1000;

/**
 * Deterministic 0..1 for a driver, a lap and a route (the same race always makes the same calls,
 * and on every JS engine: integer hashing into the sim's seeded RNG). The driver's seeded
 * personality goes in, so the calls differ from race to race.
 */
export function routeRoll(kart: KartState, ai: AiState, lap: number, index: number): number {
  const personality =
    Math.round(ai.lineOffset * HASH_PRECISION) * HASH_PRECISION +
    Math.round(ai.skill * HASH_PRECISION);
  const seed =
    Math.imul(kart.id + 1, HASH.kart) ^
    Math.imul(lap + 1, HASH.lap) ^
    Math.imul(index + 1, HASH.route) ^
    Math.imul(personality, HASH.personality);
  return rngFloat({ rngState: seedRng(seed >>> 0) });
}

/**
 * The route the AI is driving right now (MK-61), if any: it rolls once per lap per route whether to
 * take it, and follows it from where it leaves the main road until it has rejoined. A kart that
 * ends up on a route anyway (knocked through the drop) follows it too, whatever it rolled. Worked
 * out from the kart's position every tick, so it costs no sim state.
 */
export function aiRoute(kart: KartState, ai: AiState, geometry: TrackGeometry) {
  const infos = routeInfos(geometry);
  if (!infos.length) return undefined;
  const offRoad = geometry.project(kart.position).surface === 'out';
  for (const [index, info] of infos.entries()) {
    const near = nearestOnRoute(info, kart.position);
    if (near.along >= info.length - tuning.ai.routeEndMargin) continue;
    const onIt = offRoad && near.distance <= info.route.halfWidth;
    const chose = routeRoll(kart, ai, kart.race.lap, index) < info.route.aiChance;
    if (onIt || (chose && near.distance <= info.route.halfWidth + tuning.ai.routeCapture)) {
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
  // Only as far as the route goes (past its end the points bunch up and the angles mean nothing).
  const reach = Math.min(horizon, route.info.length - route.along - 2 * ROUTE_STEP);
  const curvature = curvatureAlong(
    (d) => pointOnRoute(route.info, route.along + d),
    reach,
    ROUTE_STEP,
  );
  return { error: wrapAngleDelta(desired - kart.heading), curvature };
}

/** Spacing of the curvature checks along a route, m. */
const ROUTE_STEP = 6;
