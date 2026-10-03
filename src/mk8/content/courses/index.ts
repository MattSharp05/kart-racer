// MK8 Mode's drivable courses (MK-105, ADR 0010): one folder each under `src/mk8/content/courses/`
// (folder name = the pack's course id) with `route.ts`, `materials.ts` and an `index.ts` that
// default-exports its `Mk8CourseContent`; add one line to the list below. A course registers as a
// track once its pack files are loaded (`src/mk8/courses.ts`); `test-ramp` is the code-built fixture.
import { tracks } from '../../../content/tracks';
import { decodeCollision, type CollisionMesh, type MeshTrackDef } from '../../../sim/meshTrack';
import type { RouteDef } from '../../../sim/route';
import { routeSurfaces } from '../../../sim/routeSurfaces';
import marioKartStadium from './mario-kart-stadium';
import type { Mk8CourseContent } from './types';

export type { Mk8CourseContent } from './types';

/** Every drivable MK8 course, in cup order. */
export const MK8_COURSES: readonly Mk8CourseContent[] = [marioKartStadium];

/** Registry order of MK8 courses (after our tracks; they're offered only by MK8 Mode's menus). */
const ORDER = 900;

export function mk8Course(packId: string): Mk8CourseContent | undefined {
  return MK8_COURSES.find((c) => c.packId === packId);
}

/** The pack files a course drives and draws with (`quality=low`: the `-low` model). */
export const collisionPath = (packId: string): string => `models/courses/${packId}/collision.bin`;
export const modelPath = (packId: string, low: boolean): string =>
  `models/courses/${packId}/course${low ? '-low' : ''}.glb`;

/** The course as a mesh track: the pack's collision, with surfaces the route corrects. */
export function courseTrack(
  course: Mk8CourseContent,
  collision: CollisionMesh,
  route: RouteDef = course.route,
): MeshTrackDef {
  return { id: course.trackId, kind: 'mesh', collision: routeSurfaces(collision, route), route };
}

/**
 * Registers `course` as a track from its `collision.bin` bytes (once; later calls are no-ops).
 * `route` replaces the committed one (the track editor's Test drive).
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
    def: courseTrack(course, decodeCollision(collisionBytes), route),
    // Not in the original game's track select: MK8 Mode's cup and course select offers it.
    testOnly: true,
  });
}
