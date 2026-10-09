// MK8 Mode's drivable courses (MK-105, ADR 0010): one folder each under `src/mk8/content/courses/`
// (folder name = the pack's course id) with `route.ts`, `materials.ts` and an `index.ts` that
// default-exports its `Mk8CourseContent`; add one line to the list below. A course registers as a
// track once its pack files are loaded (`src/mk8/courses.ts`); `test-ramp` is the code-built fixture.
import { tracks } from '../../../content/tracks';
import {
  decodeCollision,
  withoutTriangles,
  type CollisionMesh,
  type MeshTrackDef,
} from '../../../sim/meshTrack';
import { conformRoute, scaleCollision, scaleHazard, scaleRoute } from '../../../sim/meshScale';
import type { RouteDef } from '../../../sim/route';
import { routeSurfaces } from '../../../sim/routeSurfaces';
import { modelCollision } from './modelCollision';
import marioKartStadium from './mario-kart-stadium';
import sweetSweetCanyon from './sweet-sweet-canyon';
import thwompRuins from './thwomp-ruins';
import waterPark from './water-park';
import type { Mk8CourseContent } from './types';

export type { Mk8CourseContent } from './types';

/** Every drivable MK8 course, in cup order. */
export const MK8_COURSES: readonly Mk8CourseContent[] = [
  marioKartStadium,
  waterPark,
  sweetSweetCanyon,
  thwompRuins,
];

/**
 * Every MK8 course is drawn and driven this many times its size in the pack (MK-105 revisit: at
 * 1:1 the road fits about 4 karts across and a Stadium lap takes 24 s, against MK8's ~35 s). The
 * authored data (`route.ts`, `materials.ts`, the track editor) stays in the pack's units.
 */
export const MK8_COURSE_SCALE = 3;

/** Registry order of MK8 courses (after our tracks; they're offered only by MK8 Mode's menus). */
const ORDER = 900;

export function mk8Course(packId: string): Mk8CourseContent | undefined {
  return MK8_COURSES.find((c) => c.packId === packId);
}

/** The pack files a course drives and draws with (`quality=low`: the `-low` model). */
export const collisionPath = (packId: string): string => `models/courses/${packId}/collision.bin`;
export const modelPath = (packId: string, low: boolean): string =>
  `models/courses/${packId}/course${low ? '-low' : ''}.glb`;

/**
 * The pack file a course's collision comes from: its `collision.bin`, or its full model when the
 * course builds its collision from the model (`collisionFromModel`, never the `-low` one: the sim
 * mustn't depend on `&quality`).
 */
export const collisionSourcePath = (course: Mk8CourseContent): string =>
  course.collisionFromModel ? modelPath(course.packId, false) : collisionPath(course.packId);

/**
 * A course's collision from the bytes of its `collisionSourcePath`. A course built from its model
 * needs `modelCollisionReady` (`modelCollision.ts`) to have resolved.
 */
export function courseCollision(course: Mk8CourseContent, bytes: ArrayBuffer): CollisionMesh {
  return course.collisionFromModel
    ? modelCollision(bytes, course.collisionFromModel).mesh
    : decodeCollision(bytes);
}

/**
 * The course as a mesh track: the pack's collision, with surfaces the route corrects (in the
 * pack's units, where those rules were tuned) and its `collisionHoles` taken out, then everything
 * scaled by `MK8_COURSE_SCALE` and the route laid back onto the road where its longer spans left
 * it (`conformRoute`).
 */
export function courseTrack(
  course: Mk8CourseContent,
  collision: CollisionMesh,
  route: RouteDef = course.route,
  factor: number = MK8_COURSE_SCALE,
): MeshTrackDef {
  const surfaced = routeSurfaces(collision, route, course.surfaceRules);
  const scaled = scaleCollision(withoutTriangles(surfaced, course.collisionHoles ?? []), factor);
  return {
    id: course.trackId,
    kind: 'mesh',
    collision: scaled,
    route: conformRoute(scaleRoute(route, factor), scaled, factor),
    ...(course.hazards ? { hazards: course.hazards.map((h) => scaleHazard(h, factor)) } : {}),
    ...(factor !== 1 && { scale: factor }),
  };
}

/**
 * Registers `course` as a track from the bytes of its `collisionSourcePath` (`collision.bin`, or the
 * model: see `courseCollision`), once; later calls are no-ops. `route` replaces the committed one
 * (the track editor's Test drive).
 */
export function registerCourse(
  course: Mk8CourseContent,
  collisionBytes: ArrayBuffer,
  route?: RouteDef,
): void {
  if (tracks.has(course.trackId)) return;
  const index = MK8_COURSES.indexOf(course);
  tracks.register({
    id: course.trackId,
    name: course.name,
    order: ORDER + Math.max(0, index),
    def: courseTrack(course, courseCollision(course, collisionBytes), route),
    // Not in the original game's track select: MK8 Mode's cup and course select offers it.
    testOnly: true,
  });
}
