// Pickups laid on a mesh track's ground (MK-143). Item boxes and coins sit at a route spot (a lap
// fraction and an offset across the road), but the route only says where the race goes, not where
// the ground is (`route.ts`): its up is a smoothed, hand-traced guess, so across a wide row a box
// 7 m off the centreline could hang metres above the floor or sit under it (Thwomp Ruins' tunnel,
// where the route leans ~20° on a flat floor). Each spot is found on the collision surface instead:
// the ground under the centreline, then across the road in that ground's plane, then the ground
// there.
import { add, dot, length, normalize, orthonormal, scale, type Vec3 } from './math';
import { flies } from './meshScale';
import { raycastMesh, surfaceMask } from './meshTrack';
import type { CollisionMesh } from './meshCollision';
import { routeGeometry, type RouteDef } from './route';
import { tuning } from './tuning';

/** Ground a pickup can rest on. */
const GROUND = surfaceMask('road', 'offroad', 'boost', 'antigrav', 'glide');

/**
 * The ground nearest `point` along `up` (within `tuning.mk8.pickupGround.search`, above or below),
 * with its normal facing `up`'s side; null if there's none.
 */
export function groundNear(
  collision: CollisionMesh,
  point: Vec3,
  up: Vec3,
): { point: Vec3; normal: Vec3 } | null {
  const reach = tuning.mk8.pickupGround.search;
  const down = scale(up, -1);
  // Downwards from the point, and from `reach` above it (a spot buried under the floor).
  const below = raycastMesh(collision, point, down, reach, GROUND);
  const above = raycastMesh(collision, add(point, scale(up, reach)), down, reach, GROUND);
  const hit =
    below && above ? (below.distance <= reach - above.distance ? below : above) : (below ?? above);
  if (!hit) return null;
  const normal = dot(hit.normal, up) >= 0 ? hit.normal : scale(hit.normal, -1);
  return { point: hit.point, normal };
}

/**
 * Where a pickup at lap fraction `t`, `lateral` m right of the centreline, rests on the ground.
 * Over a jump or a glide (`flies`: coins in the air on purpose), and where no ground is near, the
 * route's own spot.
 */
export function routeGroundPoint(
  route: RouteDef,
  collision: CollisionMesh,
  t: number,
  lateral: number,
): Vec3 {
  const geometry = routeGeometry(route);
  const frame = geometry.frameAt(t, 0);
  const routeSpot = add(frame.position, scale(frame.right, lateral));
  if (flies(route, t)) return routeSpot;
  const centre = groundNear(collision, frame.position, frame.up);
  if (!centre) return routeSpot;
  // Across the road in the ground's own plane, not the route's leaning one.
  const across = orthonormal(frame.right, centre.normal);
  if (length(across) < 0.5) return routeSpot;
  const spot = add(centre.point, scale(normalize(across), lateral));
  const ground = groundNear(collision, spot, centre.normal);
  if (ground) return ground.point;
  // A row wider than the floor there: the route's spot, if it's on the ground.
  const fallback = groundNear(collision, routeSpot, frame.up);
  return fallback ? fallback.point : spot;
}
