// Surfaces from a course's route (MK-105). A course's `collision.bin` carries what its materials map
// to, and a pack built before the course was mapped (MK-93's guesses: every unknown material is
// road) gets things wrong that the route knows better: where anti-gravity is (the route's
// `antigrav` zones), that ground beside the road isn't road, and that scenery hanging low over the
// road (a tunnel's arch) isn't ground to stand on, and rails beside it are walls. Applied when a course is
// registered, so the course drives right with any build of its pack; on a pack built from the
// course's `materials.ts` the rules find little to change. Pure: a new mesh, the input untouched.
import { dot, sub } from './math';
import { MESH_SURFACES, type CollisionMesh } from './meshCollision';
import { routeGeometry, type RouteDef } from './route';
import { tuning } from './tuning';

const ROAD = MESH_SURFACES.indexOf('road');
const ANTIGRAV = MESH_SURFACES.indexOf('antigrav');
const OFFROAD = MESH_SURFACES.indexOf('offroad');
const WALL = MESH_SURFACES.indexOf('wall');

const inZone = (t: number, from: number, to: number) =>
  from <= to ? t >= from && t <= to : t >= from || t <= to;

/**
 * `collision` with its road triangles relabelled by the route: over the road, low enough for a
 * kart's ground rays to reach → wall (they look past it); on the road inside an `antigrav` zone →
 * anti-gravity; beside the road (further out than its edge, at its level): standing up from it →
 * wall, facing up like it → offroad. Everything else keeps its surface.
 */
export function routeSurfaces(collision: CollisionMesh, route: RouteDef): CollisionMesh {
  const r = tuning.meshTrack.routeSurfaces;
  const geometry = routeGeometry(route);
  const zones = route.zones.flatMap((z) => (z.kind === 'antigrav' ? [z] : []));
  const { positions, normals } = collision;
  const surfaces = collision.surfaces.slice();
  for (let t = 0; t < surfaces.length; t += 1) {
    if (surfaces[t] !== ROAD) continue;
    const o = t * 9;
    const centre = {
      x: ((positions[o] ?? 0) + (positions[o + 3] ?? 0) + (positions[o + 6] ?? 0)) / 3,
      y: ((positions[o + 1] ?? 0) + (positions[o + 4] ?? 0) + (positions[o + 7] ?? 0)) / 3,
      z: ((positions[o + 2] ?? 0) + (positions[o + 5] ?? 0) + (positions[o + 8] ?? 0)) / 3,
    };
    const near = geometry.project(centre);
    if (near.distance > r.reach) continue;
    const frame = geometry.frameAt(near.t);
    const offset = sub(centre, frame.position);
    const height = dot(offset, frame.up);
    if (Math.abs(height) > r.heightTolerance) continue;
    const beyond = Math.abs(dot(offset, frame.right)) - frame.width / 2;
    if (height > r.overhead && beyond <= r.antigravMargin) {
      surfaces[t] = WALL;
      continue;
    }
    if (beyond <= r.antigravMargin && zones.some((z) => inZone(near.t, z.from, z.to))) {
      surfaces[t] = ANTIGRAV;
      continue;
    }
    const facing =
      (normals[t * 3] ?? 0) * frame.up.x +
      (normals[t * 3 + 1] ?? 0) * frame.up.y +
      (normals[t * 3 + 2] ?? 0) * frame.up.z;
    // Standing up beside the road (a rail, a kerb's face): a wall.
    if (beyond > 0 && Math.abs(facing) < r.wallFacing) surfaces[t] = WALL;
    else if (beyond > r.offroadMargin && Math.abs(facing) >= r.offroadFacing) surfaces[t] = OFFROAD;
  }
  return { ...collision, surfaces };
}
