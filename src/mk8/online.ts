// MK8 Mode online (MK-132): what MK8 Mode gives the game's room lobby (`game/roomFlow.ts`) for an
// MK8 room: its courses, racers and the AI's karts, the player's last kart, and each course's
// loading. A course's hash is its collision file's (the manifest's sha256): the race is simulated
// on it, so every device in the room must have the same one. `?net=local` rooms also offer the
// synthetic test ramp first (no pack needed: tests and QA).
import { tracks } from '../content/tracks';
import { browserStore, type KeyValueStore } from '../game/storage/store';
import type { Mk8RoomContent } from '../game/roomFlow';
import type { MemberPack } from '../net/lobbyState';
import type { Loadout } from '../sim/types';
import { collisionPath, MK8_COURSES } from './content/courses';
import { registerTestRamp } from './content/courses/test-ramp/register';
import { TEST_RAMP_ID } from './content/courses/test-ramp';
import { defaultLoadout } from './content/parts';
import { MK8_RACERS } from './content/racers';
import { loadMk8Course } from './courses';
import { DEFAULT_LOADOUT } from './flow';
import { PackLockedError, PackNotInstalledError, type Mk8Loader } from './loader';
import { savedLoadout, savedRacer } from './loadoutPrefs';
import { registerMk8Content } from './register';
import { prepareMk8Items } from './render/items';

/** The test ramp's hash: built from code, the same on every device of one build. */
export const TEST_RAMP_HASH = 'builtin';
/** Characters of the collision file's sha256 the room compares. */
const HASH_LENGTH = 16;

/**
 * MK8 Mode's content for an MK8 room. Registers MK8 content (racers, items) so the race can be
 * built; courses register as they load (`prepare`).
 */
export function mk8RoomContent(
  files: Mk8Loader,
  { local = false, store = browserStore() }: { local?: boolean; store?: KeyValueStore } = {},
): Mk8RoomContent {
  registerMk8Content();
  if (local) registerTestRamp();
  const courses = MK8_COURSES.map((course) => ({ id: course.trackId, name: course.name }));
  return {
    // Local rooms start on the test ramp: every device has it.
    tracks: local
      ? [{ id: TEST_RAMP_ID, name: 'MK8 Test Ramp', hazard: 'Dev course, no pack' }, ...courses]
      : courses,
    racers: MK8_RACERS.map((racer) => ({ id: racer.id, name: racer.name })),
    aiLoadouts: MK8_RACERS.map((racer) => defaultLoadout(racer.id)),
    loadout: () => playerLoadout(store),
    prepare: (trackId, onProgress) => prepareCourse(files, trackId, onProgress),
  };
}

/** The kart MK8 Mode last raced (character select and the kart builder save it), or the default. */
function playerLoadout(store: KeyValueStore): Loadout {
  const racer = savedRacer(store);
  return racer ? savedLoadout(store, racer) : { ...DEFAULT_LOADOUT };
}

/** Loads a room's course and the race's item models: ready with its hash, or why not. */
export async function prepareCourse(
  files: Mk8Loader,
  trackId: string,
  onProgress: (fraction: number) => void = () => {},
): Promise<Pick<MemberPack, 'state' | 'hash'>> {
  if (trackId === TEST_RAMP_ID) {
    registerTestRamp();
    await prepareMk8Items(files);
    onProgress(1);
    return { state: 'ready', hash: TEST_RAMP_HASH };
  }
  const course = MK8_COURSES.find((c) => c.trackId === trackId);
  if (!course) return { state: 'failed' };
  try {
    const manifest = await files.loadManifest();
    const collision = manifest.files.find((e) => e.path === collisionPath(course.packId));
    if (!collision) return { state: 'missing' };
    if (!tracks.has(trackId) && !(await loadMk8Course(files, course, onProgress))) {
      return { state: 'missing' };
    }
    await prepareMk8Items(files);
    onProgress(1);
    return { state: 'ready', hash: collision.sha256.slice(0, HASH_LENGTH) };
  } catch (e) {
    if (e instanceof PackNotInstalledError) return { state: 'missing' };
    if (e instanceof PackLockedError) return { state: 'locked' };
    throw e;
  }
}
