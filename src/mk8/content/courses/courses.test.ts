// MK8 course content (MK-105): every course folder is listed, and registers as a mesh track.
import { readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MK8_COURSES } from '.';

/** Course folders built in code (fixtures), not from the pack. */
const BUILT_IN = new Set(['test-ramp']);

describe('MK8 courses (MK-105)', () => {
  it('lists every course folder (folder name = pack id) in MK8_COURSES', () => {
    const dir = new URL('.', import.meta.url);
    const folders = readdirSync(dir).filter(
      (name) => statSync(new URL(name, dir)).isDirectory() && !BUILT_IN.has(name),
    );
    expect(MK8_COURSES.map((c) => c.packId).sort()).toEqual(folders.sort());
  });

  it('gives each course an mk8- track id of its own', () => {
    const ids = MK8_COURSES.map((c) => c.trackId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^mk8-/);
  });
});
