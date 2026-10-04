// A stand-in collision mesh for a course's route (MK-124): its road as a ribbon along the route's
// frames (anti-gravity in its anti-gravity zones), walled on both edges. For unit tests of a course
// built without the pack: the AI, its Thwomps and its laps run on the route's own shape. Never a
// substitute for the pack's mesh (`courseCheck.ts` runs on that).
import { add, scale, type Vec3 } from '../../../sim/math';
import {
  collisionFromTriangles,
  MESH_SURFACES,
  type CollisionMesh,
  type MeshSurface,
} from '../../../sim/meshTrack';
import { routeGeometry, type RouteDef, type RouteSample } from '../../../sim/route';
import { inRange } from '../../../sim/splineTrack';

/** The pipeline's grid cell (`COLLISION_DEFAULTS.cellSize`), m. */
const CELL_SIZE = 4;
/** Height of the walls along both edges, m. */
const WALL_HEIGHT = 1.5;

const at = (s: RouteSample, lateral: number, lift = 0): Vec3 =>
  add(add(s.position, scale(s.right, lateral)), scale(s.up, lift));

export function routeRibbonCollision(route: RouteDef): CollisionMesh {
  const geometry = routeGeometry(route);
  const positions: number[] = [];
  const surfaces: number[] = [];
  const triangle = (a: Vec3, b: Vec3, c: Vec3, surface: MeshSurface) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    surfaces.push(MESH_SURFACES.indexOf(surface));
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, surface: MeshSurface) => {
    triangle(a, b, c, surface);
    triangle(a, c, d, surface);
  };
  const antigrav = route.zones.flatMap((z) => (z.kind === 'antigrav' ? [z] : []));
  const n = geometry.samples.length;
  for (let i = 0; i < n; i += 1) {
    const a = geometry.sample(i);
    const b = geometry.sample(i + 1);
    const t = (a.s + geometry.length / n / 2) / geometry.length;
    const surface = antigrav.some((z) => inRange(t, z)) ? 'antigrav' : 'road';
    const half = (s: RouteSample) => s.width / 2;
    for (const [l0, l1] of [
      [-1, 0],
      [0, 1],
    ] as const) {
      quad(
        at(a, l0 * half(a)),
        at(b, l0 * half(b)),
        at(b, l1 * half(b)),
        at(a, l1 * half(a)),
        surface,
      );
    }
    for (const side of [-1, 1]) {
      quad(
        at(a, side * half(a)),
        at(b, side * half(b)),
        at(b, side * half(b), WALL_HEIGHT),
        at(a, side * half(a), WALL_HEIGHT),
        'wall',
      );
    }
  }
  return collisionFromTriangles(new Float32Array(positions), new Uint8Array(surfaces), CELL_SIZE);
}
