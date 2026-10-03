// Loading an MK8 course (MK-105): its `collision.bin` and model from the pack (on the site behind
// the password, MK-135; locally `pnpm dev` serves `$MK8_OUT`), then the course registers as a track
// (`content/courses`) and its model as that track's view, so a race or scenario on it can start.
import * as THREE from 'three';
import { trackViews } from '../content/tracks/render';
import type { RouteDef } from '../sim/route';
import { collisionPath, modelPath, registerCourse, type Mk8CourseContent } from './content/courses';
import type { Mk8Loader } from './loader';
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
export async function loadMk8Course(
  files: Mk8Loader,
  course: Mk8CourseContent,
  onProgress: (fraction: number) => void = () => {},
  { low = lowQualityPage(), route }: { low?: boolean; route?: RouteDef } = {},
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
    trackViews.register({ id: course.trackId, model: () => courseInstance(scene) });
  }
  return true;
}

/**
 * The course never moves: matrices once, and nothing casts or takes the karts' shadows. Meshes of
 * `hidden` materials are taken out.
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
  scene.updateMatrixWorld(true);
  scene.traverse((object) => (object.matrixAutoUpdate = false));
}

/** A copy of the course for one race (shared geometry and materials: the world keeps them). */
function courseInstance(scene: THREE.Group): THREE.Object3D {
  const copy = scene.clone();
  copy.userData.sharedAssets = true;
  return copy;
}
