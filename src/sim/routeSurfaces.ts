// Surfaces from a course's route (MK-105). A course's `collision.bin` carries what its materials map
// to, and a pack built before the course was mapped (MK-93's guesses: every unknown material is
// road) gets things wrong that the route knows better: where anti-gravity is (the route's
// `antigrav` zones), that ground beside the road isn't road, and that scenery hanging low over the
// road (a tunnel's arch) isn't ground to stand on, and rails beside it are walls. Applied when a course is
// registered, so the course drives right with any build of its pack; on a pack built from the
// course's `materials.ts` the rules find little to change. Pure: a new mesh, the input untouched.
// MK-122: a course whose pack calls its road `water` (Water Park: every `park_Water_*` material,
// underwater road and walls alike) asks for `waterIsRoad`: those triangles get the road's rules, and
// anything lying flat on a water volume's top (the water's surface, an effect box's lid) is water.
import { dot, scale, sub, type Vec3 } from './math';
import { MESH_SURFACES, type CollisionMesh } from './meshCollision';
import { raycastMesh, surfaceMask } from './meshTrack';
import { routeGeometry, type RouteDef } from './route';
import { tuning } from './tuning';

const ROAD = MESH_SURFACES.indexOf('road');
const ANTIGRAV = MESH_SURFACES.indexOf('antigrav');
const OFFROAD = MESH_SURFACES.indexOf('offroad');
const WALL = MESH_SURFACES.indexOf('wall');
const WATER = MESH_SURFACES.indexOf('water');
const GLIDE = MESH_SURFACES.indexOf('glide');

const UNDER = surfaceMask('road', 'offroad', 'boost', 'antigrav', 'glide');

/**
 * Whether there's ground under `point` along −`up` within `height` (+ a margin): scenery over the
 * road has the road beneath it; a raised bit of the road itself hasn't.
 */
function roadBeneath(collision: CollisionMesh, point: Vec3, up: Vec3, height: number): boolean {
  const from = sub(point, scale(up, BENEATH_GAP));
  const reach = height + tuning.meshTrack.routeSurfaces.overhead;
  return raycastMesh(collision, from, scale(up, -1), reach, UNDER) !== null;
}
/** Start that far below the triangle, so its own surface isn't what the ray finds, m. */
const BENEATH_GAP = 0.3;

const inZone = (t: number, from: number, to: number) =>
  from <= to ? t >= from && t <= to : t >= from || t <= to;

export interface RouteSurfaceOptions {
  /**
   * The pack labels this course's road and walls `water` (MK-122): relabel those by the route like
   * road (the water's surface, flat on a water volume's top, stays water, and so does anything else
   * lying there).
   */
  waterIsRoad?: boolean;
  /**
   * The pack labels some of this course's road `wall` (MK-128: Thwomp Ruins' `di_Wall_B` slopes,
   * MK-93's guess from the name): wall triangles lying on the road, facing like it, become road.
   * Every other wall stays a wall.
   */
  wallIsRoad?: boolean;
  /**
   * Glide triangles outside the route's glide zones become road (MK-128: the pack guesses Thwomp
   * Ruins' trick ramps, `di_Jump`, as glide boards, and leaving one would open the glider).
   */
  glideZonesOnly?: boolean;
}

/** Whether triangle `t` lies flat on the top of one of `volumes`, over its footprint. */
function onWaterTop(
  positions: Float32Array,
  t: number,
  volumes: readonly { min: Vec3; max: Vec3 }[],
): boolean {
  const o = t * 9;
  const corner = (k: number, axis: number) => positions[o + k * 3 + axis] ?? 0;
  const xs = [corner(0, 0), corner(1, 0), corner(2, 0)];
  const ys = [corner(0, 1), corner(1, 1), corner(2, 1)];
  const zs = [corner(0, 2), corner(1, 2), corner(2, 2)];
  const tolerance = tuning.meshTrack.routeSurfaces.waterTopTolerance;
  // Big lids (an effect box over a whole pool) count when any of them is over the volume.
  return volumes.some(
    ({ min, max }) =>
      Math.max(...xs) >= min.x &&
      Math.min(...xs) <= max.x &&
      Math.max(...zs) >= min.z &&
      Math.min(...zs) <= max.z &&
      ys.every((y) => Math.abs(y - max.y) <= tolerance),
  );
}

/**
 * `collision` with its road triangles relabelled by the route: over the road, low enough for a
 * kart's ground rays to reach → wall (they look past it); on the road inside an `antigrav` zone →
 * anti-gravity; beside the road (further out than its edge, at its level): standing up from it →
 * wall, facing up like it → offroad. Everything else keeps its surface. With `waterIsRoad`, `water`
 * triangles get the same rules, except that over the road they stay water. With `wallIsRoad`,
 * `wall` triangles on the road facing up like it become road; with `glideZonesOnly`, `glide`
 * triangles outside the glide zones become road.
 */
export function routeSurfaces(
  collision: CollisionMesh,
  route: RouteDef,
  { waterIsRoad = false, wallIsRoad = false, glideZonesOnly = false }: RouteSurfaceOptions = {},
): CollisionMesh {
  const r = tuning.meshTrack.routeSurfaces;
  const geometry = routeGeometry(route);
  const zones = route.zones.flatMap((z) => (z.kind === 'antigrav' ? [z] : []));
  const glides = route.zones.flatMap((z) => (z.kind === 'glide' ? [z] : []));
  const volumes = waterIsRoad ? route.zones.flatMap((z) => (z.kind === 'water' ? [z] : [])) : [];
  const { positions, normals } = collision;
  const surfaces = collision.surfaces.slice();
  for (let t = 0; t < surfaces.length; t += 1) {
    const water = surfaces[t] === WATER;
    const wall = surfaces[t] === WALL;
    const glide = surfaces[t] === GLIDE;
    if (
      surfaces[t] !== ROAD &&
      !(water && waterIsRoad) &&
      !(wall && wallIsRoad) &&
      !(glide && glideZonesOnly)
    )
      continue;
    if (
      (water || surfaces[t] === ROAD) &&
      volumes.length > 0 &&
      onWaterTop(positions, t, volumes)
    ) {
      surfaces[t] = WATER;
      continue;
    }
    const o = t * 9;
    const centre = {
      x: ((positions[o] ?? 0) + (positions[o + 3] ?? 0) + (positions[o + 6] ?? 0)) / 3,
      y: ((positions[o + 1] ?? 0) + (positions[o + 4] ?? 0) + (positions[o + 7] ?? 0)) / 3,
      z: ((positions[o + 2] ?? 0) + (positions[o + 5] ?? 0) + (positions[o + 8] ?? 0)) / 3,
    };
    const near = geometry.project(centre);
    if (glide) {
      if (!glides.some((z) => inZone(near.t, z.from, z.to))) surfaces[t] = ROAD;
      continue;
    }
    if (near.distance > r.reach) continue;
    const frame = geometry.frameAt(near.t);
    const offset = sub(centre, frame.position);
    const height = dot(offset, frame.up);
    if (Math.abs(height) > r.heightTolerance) continue;
    const beyond = Math.abs(dot(offset, frame.right)) - frame.width / 2;
    const facing =
      (normals[t * 3] ?? 0) * frame.up.x +
      (normals[t * 3 + 1] ?? 0) * frame.up.y +
      (normals[t * 3 + 2] ?? 0) * frame.up.z;
    if (wall) {
      if (beyond <= 0 && Math.abs(height) <= r.overhead && facing >= r.offroadFacing)
        surfaces[t] = ROAD;
      continue;
    }
    if (
      height > r.overhead &&
      beyond <= r.antigravMargin &&
      roadBeneath(collision, centre, frame.up, height)
    ) {
      if (!water) surfaces[t] = WALL;
      continue;
    }
    // Facing like the road, not its kerbs' sides or the end of a deck (MK-122: karts stuck to it).
    if (
      beyond <= r.antigravMargin &&
      Math.abs(facing) >= r.antigravFacing &&
      zones.some((z) => inZone(near.t, z.from, z.to))
    ) {
      surfaces[t] = ANTIGRAV;
      continue;
    }
    // Standing up beside the road (a rail, a kerb's face): a wall.
    if (beyond > 0 && Math.abs(facing) < r.wallFacing) surfaces[t] = WALL;
    else if (beyond > r.offroadMargin && Math.abs(facing) >= r.offroadFacing) surfaces[t] = OFFROAD;
    else if (water) surfaces[t] = ROAD;
  }
  return { ...collision, surfaces };
}
