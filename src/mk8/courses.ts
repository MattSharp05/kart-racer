// Loading an MK8 course (MK-105): its `collision.bin` and model from the pack (on the site behind
// the password, MK-135; locally `pnpm dev` serves `$MK8_OUT`), then the course registers as a track
// (`content/courses`) and its model as that track's view, so a race or scenario on it can start.
import * as THREE from 'three';
import { tracks } from '../content/tracks';
import { trackViews } from '../content/tracks/render';
import type { TrackLook, TrackLookContext } from '../render/trackLook';
import type { RouteDef } from '../sim/route';
import { ambiencePlayer, CourseAmbience, gameMuted } from './audio/ambience';
import { collisionPath, modelPath, registerCourse, type Mk8CourseContent } from './content/courses';
import testRampLook from './content/courses/test-ramp/look';
import { testRampTrack } from './content/courses/test-ramp';
import type { CourseLook } from './content/courses/types';
import type { Mk8Loader } from './loader';
import { batchCourseMeshes } from './render/courseBatch';
import { createCourseLook } from './render/look';
import { parseGlb } from './render/racerModel';

/** Whether the page asked for low quality (`&quality=low`): the `-low` model (smaller textures). */
export function lowQualityPage(search = typeof location === 'undefined' ? '' : location.search) {
  return new URLSearchParams(search).get('quality') === 'low';
}

/**
 * Loads `course` from the pack and registers it (track and model; once). False when the pack
 * hasn't got the course (an older or partial build): the race then runs on the stand-in. Throws
 * what the loader throws: `PackNotInstalledError` (no pack), `PackLockedError` (log in first),
 * `PackLoadError` (a file failed). `route` replaces the committed one (the track editor's Test
 * drive).
 */
export function loadMk8Course(
  files: Mk8Loader,
  course: Mk8CourseContent,
  onProgress: (fraction: number) => void = () => {},
  { low = lowQualityPage(), route }: { low?: boolean; route?: RouteDef } = {},
): Promise<boolean> {
  // One load per course at a time (MK-133): the results screen preloads the next course, and the
  // Next button's load then waits for that one instead of parsing the model again.
  if (route) return loadCourseFiles(files, course, onProgress, low, route);
  const key = `${course.packId}${low ? '-low' : ''}`;
  const pending = loading.get(key);
  if (pending?.files === files) return pending.promise;
  const promise = loadCourseFiles(files, course, onProgress, low);
  loading.set(key, { files, promise });
  promise.then(
    () => loading.get(key)?.promise === promise && loading.delete(key),
    () => loading.get(key)?.promise === promise && loading.delete(key),
  );
  return promise;
}

/** Course loads under way, by pack id (and `-low`). */
const loading = new Map<string, { files: Mk8Loader; promise: Promise<boolean> }>();

/**
 * Starts loading `course` in the background (MK-133: during a race's results, the cup's next
 * course), so Next starts it sooner. Failures are left for the real load to report.
 */
export function preloadMk8Course(files: Mk8Loader, course: Mk8CourseContent): void {
  loadMk8Course(files, course).catch(() => {});
}

async function loadCourseFiles(
  files: Mk8Loader,
  course: Mk8CourseContent,
  onProgress: (fraction: number) => void,
  low: boolean,
  route?: RouteDef,
): Promise<boolean> {
  const collision = collisionPath(course.packId);
  const model = modelPath(course.packId, low);
  const manifest = await files.loadManifest();
  const has = (path: string) => manifest.files.some((e) => e.path === path);
  if (!has(collision) || !has(model)) return false;
  await files.loadFiles([collision, model], onProgress);
  const collisionBytes = files.file(collision);
  const modelBytes = files.file(model);
  if (!collisionBytes || !modelBytes) throw new Error(`${course.name}: pack files missing`);
  registerCourse(course, collisionBytes, route);
  if (!trackViews.has(course.trackId)) {
    const scene = await parseGlb(modelBytes);
    prepareCourseModel(scene, new Set(course.hiddenMaterials));
    trackViews.register({
      id: course.trackId,
      model: () => courseInstance(scene),
      ...(course.look && { look: courseLook(course.look, files) }),
    });
  }
  return true;
}

/**
 * The course never moves: matrices once, and nothing casts or takes the karts' shadows. Meshes of
 * `hidden` materials are taken out, and the rest merged by material and cell (MK-133: a few dozen
 * draws instead of hundreds; `userData.batch` keeps the mesh counts).
 */
function prepareCourseModel(scene: THREE.Group, hidden: ReadonlySet<string>): void {
  const drop: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    if (materials.some((m) => hidden.has(m.name))) drop.push(object);
    object.castShadow = false;
    object.receiveShadow = false;
  });
  for (const object of drop) object.removeFromParent();
  scene.userData.batch = batchCourseMeshes(scene);
  scene.updateMatrixWorld(true);
  scene.traverse((object) => (object.matrixAutoUpdate = false));
}

/** A copy of the course for one race (shared geometry and materials: the world keeps them). */
function courseInstance(scene: THREE.Group): THREE.Object3D {
  const copy = scene.clone();
  copy.userData.sharedAssets = true;
  return copy;
}

/** The test ramp again under its own id, with a course look (MK-125). */
export const LOOK_RAMP_ID = 'mk8-look-ramp';

/**
 * Registers the look ramp (MK-125): the test ramp's track with a course's light, water,
 * post-processing and ambience, so CI checks the look without the pack. A copy, so the other test
 * ramp scenarios (and their screenshots and timings) keep the plain look.
 */
export function registerLookRamp(files: Mk8Loader): void {
  if (!tracks.has(LOOK_RAMP_ID)) {
    tracks.register({
      id: LOOK_RAMP_ID,
      name: 'MK8 Look Ramp',
      order: LOOK_RAMP_ORDER,
      def: { ...testRampTrack(), id: LOOK_RAMP_ID },
      testOnly: true,
    });
  }
  if (!trackViews.has(LOOK_RAMP_ID))
    trackViews.register({ id: LOOK_RAMP_ID, look: courseLook(testRampLook, files) });
}

/** After the test ramp's place (1000) in the track registry. */
const LOOK_RAMP_ORDER = 1001;

/** A course's look for its track view: drawn by `render/look.ts`, its loops from the pack. */
function courseLook(look: CourseLook, files: Mk8Loader): (context: TrackLookContext) => TrackLook {
  return (context) =>
    createCourseLook(
      look,
      context,
      new CourseAmbience(
        look.ambience,
        ambiencePlayer((path) => files.file(path)),
        gameMuted,
      ),
    );
}
