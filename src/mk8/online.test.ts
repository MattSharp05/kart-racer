import { afterEach, describe, expect, it } from 'vitest';
import { tracks } from '../content/tracks';
import { MK8_COURSES } from './content/courses';
import { TEST_RAMP_ID } from './content/courses/test-ramp';
import { testRampTrack } from './content/courses/test-ramp';
import { Mk8Loader } from './loader';
import { courseHash, mk8RoomContent, prepareCourse, TEST_RAMP_HASH } from './online';
import { MemoryStore } from '../game/storage/store';

/** MK8 rooms (MK-132): what MK8 Mode gives the lobby, and each course's loading and hash. */

const STADIUM = MK8_COURSES[0]!;
const COLLISION = `models/courses/${STADIUM.packId}/collision.bin`;
const SHA = '0123456789abcdef0123456789abcdef';

/** A pack server answering the manifest with `status`, or a manifest of `files`. */
function loader(status = 200, files: { path: string; sha256: string }[] = []): Mk8Loader {
  const manifest = {
    version: 1,
    files: files.map((f) => ({ ...f, bytes: 1, group: 'course' })),
  };
  return new Mk8Loader({
    fetch: async (input) =>
      String(input).endsWith('manifest.json')
        ? new Response(JSON.stringify(manifest), { status })
        : new Response(null, { status: 404 }),
  });
}

describe('MK8 room content (MK-132)', () => {
  afterEach(() => {
    if (tracks.has(STADIUM.trackId) && tracks.get(STADIUM.trackId).name === 'fake') {
      tracks.unregister(STADIUM.trackId);
    }
  });

  it('offers MK8’s courses (the test ramp first in local rooms), racers and the AI’s karts', () => {
    const files = loader();
    const online = mk8RoomContent(files, { store: new MemoryStore() });
    expect(online.tracks.map((t) => t.id)).toEqual(MK8_COURSES.map((c) => c.trackId));
    const local = mk8RoomContent(files, { local: true, store: new MemoryStore() });
    expect(local.tracks[0]?.id).toBe(TEST_RAMP_ID);
    expect(local.racers.map((r) => r.id)).toContain('mk8-mario');
    expect(local.aiLoadouts.length).toBe(local.racers.length);
    expect(local.loadout().racer).toBe('mk8-mario');
  });

  it('has the test ramp ready on every device, with its built-in hash', async () => {
    expect(await prepareCourse(loader(404), TEST_RAMP_ID)).toEqual({
      state: 'ready',
      hash: TEST_RAMP_HASH,
    });
    expect(tracks.has(TEST_RAMP_ID)).toBe(true);
  });

  it('says when a course can’t load: no pack, a locked one, or a pack without it', async () => {
    expect(await prepareCourse(loader(404), STADIUM.trackId)).toEqual({ state: 'missing' });
    expect(await prepareCourse(loader(401), STADIUM.trackId)).toEqual({ state: 'locked' });
    expect(await prepareCourse(loader(200, []), STADIUM.trackId)).toEqual({ state: 'missing' });
    expect(await prepareCourse(loader(200, []), 'nope')).toEqual({ state: 'failed' });
  });

  it('hashes a loaded course by its collision file', async () => {
    // Already loaded (registered as a track): only the manifest is read.
    tracks.register({
      id: STADIUM.trackId,
      name: 'fake',
      order: 999,
      def: testRampTrack(),
      testOnly: true,
    });
    const result = await prepareCourse(
      loader(200, [{ path: COLLISION, sha256: SHA }]),
      STADIUM.trackId,
    );
    expect(result).toEqual({ state: 'ready', hash: SHA.slice(0, 16) });
  });
});

describe('course hashes for a room (MK-123 round 2)', () => {
  const sha = 'ab'.repeat(32);
  const canyon = MK8_COURSES.find((c) => c.packId === 'sweet-sweet-canyon');
  const stadium = MK8_COURSES.find((c) => c.packId === 'mario-kart-stadium');

  it('is the collision file’s hash for a course with collision.bin', () => {
    expect(stadium && courseHash(sha, stadium)).toBe(sha.slice(0, 16));
  });

  it('mixes in the material map for a course built from its model, so different maps never match', () => {
    if (!canyon?.collisionFromModel) throw new Error('Canyon builds collision from its model');
    const hash = courseHash(sha, canyon);
    expect(hash).toHaveLength(16);
    expect(hash.slice(0, 8)).toBe(sha.slice(0, 8));
    expect(courseHash(sha, { ...canyon })).toBe(hash);
    const changed = { ...canyon.collisionFromModel, ck_spongeMulti01_Blight: 'ignore' as const };
    expect(courseHash(sha, { ...canyon, collisionFromModel: changed })).not.toBe(hash);
  });
});
