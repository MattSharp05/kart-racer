import { describe, expect, it } from 'vitest';
import { MK8_COURSES } from './content/courses';
import { loadMk8Course, preloadMk8Course } from './courses';
import { PackNotInstalledError, type Mk8Loader } from './loader';

/** A loader whose manifest answers after `release()`; counts the fetches. */
function slowLoader(fail = false) {
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const counts = { manifest: 0 };
  const files = {
    loadManifest: async () => {
      counts.manifest += 1;
      await gate;
      if (fail) throw new PackNotInstalledError();
      return { files: [] };
    },
  } as unknown as Mk8Loader;
  return { files, counts, release };
}

describe('MK8 course preload (MK-133)', () => {
  const course = MK8_COURSES[1]!;

  it('a load while the preload runs waits for it instead of loading the course again', async () => {
    const { files, counts, release } = slowLoader();
    preloadMk8Course(files, course);
    const next = loadMk8Course(files, course, undefined, { low: false });
    release();
    await expect(next).resolves.toBe(false); // this pack hasn't got the course
    expect(counts.manifest).toBe(1);
    // Once it settles the next load starts afresh.
    await loadMk8Course(files, course, undefined, { low: false });
    expect(counts.manifest).toBe(2);
  });

  it('a failed preload is quiet; the real load reports the failure', async () => {
    const { files, release } = slowLoader(true);
    preloadMk8Course(files, course);
    const next = loadMk8Course(files, course, undefined, { low: false });
    release();
    await expect(next).rejects.toBeInstanceOf(PackNotInstalledError);
  });
});
