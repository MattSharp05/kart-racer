// Karts drawn on the road as it's drawn (MK-105 / MK-122 / MK-101 QA, 2026-10-09). An MK8 course
// races on its `collision.bin`, which the pack pipeline simplified (meshoptimizer, an error bound
// relative to the whole course: up to about a metre in the pack's units, ×3 once the course is
// scaled): its vertices are the model's, but across a curved stretch (a crowned road, a gutter
// curving up into a wall, a grass mound) its flat triangles cut under the drawn surface, and karts
// standing on them looked sunk to the driver's waist. The sim stays on the collision (the AI, the
// course checks and the netcode agree on it); the kart *model* is seated on the course model instead:
// at load the course's solid triangles go into the same grid index the sim uses, and each frame a
// grounded kart's model is moved along its up onto the drawn surface under it (at most
// `SEAT_RAISE` up or `SEAT_LOWER` down) and pushed out of drawn walls it would poke into.
import * as THREE from 'three';
import { collisionFromTriangles, type CollisionMesh } from '../sim/meshCollision';
import { raycastMesh, surfaceMask, wallContact } from '../sim/meshTrack';
import { tuning } from '../sim/tuning';
import type { TrackDef } from '../sim/track';

/** How far a kart's model may be raised onto the drawn road, or lowered onto it, m. */
export const SEAT_RAISE = 1.2;
export const SEAT_LOWER = 0.6;
/** How fast the seat offset follows the drawn road, 1/s (smooths steps between drawn layers). */
const SEAT_RATE = 25;
/** Drawn walls: query sphere radius (a kart's half-width), its height, the most it pushes, m. */
const WALL_RADIUS = 0.75;
const WALL_LIFT = 0.55;
const WALL_PUSH = 0.5;
/** Drawn steps lower than this under the kart's floor don't push it, m (as `tuning.mk8.wallFloor`). */
const WALL_STEP = 0.3;
/** Drawn triangles further than this outside the collision's bounds are left out (backdrops), m. */
const BOUNDS_MARGIN = 10;

/** Drawn triangles tagged as the sim's surface codes: ground (`road`) and walls (`wall`). */
const GROUND_CODE = 0;
const WALL_CODE = 3;
const ANY = surfaceMask('road', 'wall');
const WALLS = surfaceMask('wall');

const models = new WeakMap<TrackDef, THREE.Object3D>();
const grounds = new WeakMap<CollisionMesh, CollisionMesh | null>();

/** Remembers the model drawn for a mesh track (`createTrackView`). */
export function setDrawnModel(track: TrackDef, model: THREE.Object3D): void {
  models.set(track, model);
}

/**
 * The drawn ground of `track` (built once per course: every race on it shares the model's
 * geometry); undefined for tracks without a drawn model.
 */
export function drawnGroundFor(track: TrackDef): CollisionMesh | undefined {
  if (track.kind !== 'mesh') return undefined;
  const model = models.get(track);
  if (!model) return undefined;
  let ground = grounds.get(track.collision);
  if (ground === undefined) {
    ground = buildDrawnGround(model, track.collision);
    grounds.set(track.collision, ground);
  }
  return ground ?? undefined;
}

/** Whether every material a mesh draws with is solid (cut-outs and see-through layers aren't ground). */
function solid(material: THREE.Material): boolean {
  if (!material.visible) return false;
  if (material.transparent || material.alphaTest > 0) return false;
  return true;
}

function shown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/**
 * The model's solid triangles (world space, inside `bounds`' grid plus a margin) in the sim's grid
 * index: ground, and walls where a face is steeper than `tuning.mk8.maxSlope` (ceilings are ground:
 * anti-gravity drives on them). Null when the model has no solid triangles.
 */
export function buildDrawnGround(
  model: THREE.Object3D,
  bounds: Pick<CollisionMesh, 'gridMin' | 'gridDims' | 'cellSize'>,
): CollisionMesh | null {
  model.updateMatrixWorld(true);
  const lo = bounds.gridMin.map((v) => v - BOUNDS_MARGIN);
  const hi = bounds.gridMin.map(
    (v, a) => v + (bounds.gridDims[a] ?? 0) * bounds.cellSize + BOUNDS_MARGIN,
  );
  const minWallY = Math.cos(tuning.mk8.maxSlope);
  const positions: number[] = [];
  const codes: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const inside = (v: THREE.Vector3) =>
    v.x >= (lo[0] ?? 0) &&
    v.x <= (hi[0] ?? 0) &&
    v.y >= (lo[1] ?? 0) &&
    v.y <= (hi[1] ?? 0) &&
    v.z >= (lo[2] ?? 0) &&
    v.z <= (hi[2] ?? 0);
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !shown(object)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!position) return;
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const materials: THREE.Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    // Each draw range with its material (one range, the whole mesh, without groups).
    const ranges =
      geometry.groups.length > 0
        ? geometry.groups.map((g) => ({
            start: g.start,
            end: Math.min(count, g.start + g.count),
            material: materials[g.materialIndex ?? 0],
          }))
        : [{ start: 0, end: count, material: materials[0] }];
    const matrix = object.matrixWorld;
    const vertex = (i: number, out: THREE.Vector3) =>
      out.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
    for (const range of ranges) {
      if (!range.material || !solid(range.material)) continue;
      for (let i = range.start; i + 2 < range.end; i += 3) {
        vertex(i, a);
        vertex(i + 1, b);
        vertex(i + 2, c);
        if (!inside(a) && !inside(b) && !inside(c)) continue;
        const normal = e1.subVectors(b, a).cross(e2.subVectors(c, a));
        const area = normal.length();
        if (area < 1e-9) continue;
        const ny = normal.y / area;
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        codes.push(Math.abs(ny) < minWallY ? WALL_CODE : GROUND_CODE);
      }
    }
  });
  if (codes.length === 0) return null;
  return collisionFromTriangles(
    new Float32Array(positions),
    new Uint8Array(codes),
    bounds.cellSize,
  );
}

/**
 * How far along `up` the drawn surface is from `position` (a kart's sim position on the collision),
 * m: positive when the drawn road is above it. Null when there's no drawn ground within
 * `SEAT_RAISE` above / `SEAT_LOWER` below.
 */
export function drawnSeatOffset(
  ground: CollisionMesh,
  position: THREE.Vector3,
  up: THREE.Vector3,
): number | null {
  const origin = {
    x: position.x + up.x * SEAT_RAISE,
    y: position.y + up.y * SEAT_RAISE,
    z: position.z + up.z * SEAT_RAISE,
  };
  const down = { x: -up.x, y: -up.y, z: -up.z };
  const hit = raycastMesh(ground, origin, down, SEAT_RAISE + SEAT_LOWER, ANY);
  return hit ? SEAT_RAISE - hit.distance : null;
}

/**
 * How far to move a kart's model (at `position`, standing on the drawn road) to stand clear of the
 * drawn walls around it, in its own plane; at most `WALL_PUSH`. Null when it touches none.
 */
export function drawnWallPush(
  ground: CollisionMesh,
  position: THREE.Vector3,
  up: THREE.Vector3,
): THREE.Vector3 | null {
  const centre = {
    x: position.x + up.x * WALL_LIFT,
    y: position.y + up.y * WALL_LIFT,
    z: position.z + up.z * WALL_LIFT,
  };
  const wall = wallContact(ground, centre, WALL_RADIUS, up, WALLS, WALL_LIFT - WALL_STEP);
  if (!wall) return null;
  const push = new THREE.Vector3(wall.push.x, wall.push.y, wall.push.z);
  return push.length() > WALL_PUSH ? push.setLength(WALL_PUSH) : push;
}

/**
 * Per kart: the seat offset drawn last frame, eased towards the drawn road by the sim time stepped
 * (so a paused frame holds still).
 */
export class DrawnSeats {
  private readonly offsets: number[] = [];

  constructor(readonly ground: CollisionMesh) {}

  /**
   * Moves a kart model's `root` (posed at the sim position, oriented) onto the drawn road and out of
   * drawn walls. Karts in the air are drawn where the sim has them (the offset eases back to 0).
   */
  seat(
    id: number,
    root: THREE.Object3D,
    grounded: boolean,
    antigrav: boolean,
    seconds: number,
  ): void {
    const up = scratchUp.set(0, 1, 0).applyQuaternion(root.quaternion);
    const target = grounded ? (drawnSeatOffset(this.ground, root.position, up) ?? 0) : 0;
    const was = this.offsets[id];
    const k = was === undefined ? 1 : 1 - Math.exp(-SEAT_RATE * seconds);
    const offset = was === undefined ? target : was + (target - was) * k;
    this.offsets[id] = offset;
    root.position.addScaledVector(up, offset);
    // Walls: off anti-gravity only (there the road itself is steep).
    if (!grounded || antigrav) return;
    const push = drawnWallPush(this.ground, root.position, up);
    if (push) root.position.add(push);
  }
}

const scratchUp = new THREE.Vector3();
