import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs build script, no types
import { packFiles } from '../../scripts/fetchMk8Pack.mjs';

const manifest = (paths: unknown[]) => ({
  version: 1,
  files: paths.map((path) => ({ path, bytes: 1, group: 'ui' })),
});

describe('MK8 pack build step (MK-135)', () => {
  it('copies the manifest and every file it lists', () => {
    expect(packFiles(manifest(['ui/a.webp', 'models/course/x/collision.bin']))).toEqual([
      'manifest.json',
      'ui/a.webp',
      'models/course/x/collision.bin',
    ]);
  });

  it.each(['../secret', '/etc/passwd', 'ui/../../x', 'a//b', 'a\\b', '', 'fonts/fonts.css', 3])(
    'refuses the path %s',
    (path) => {
      expect(() => packFiles(manifest([path]))).toThrow(/refusing/);
    },
  );

  it('refuses something that is not a manifest', () => {
    expect(() => packFiles({ version: 2, files: [] })).toThrow(/not a pack manifest/);
    expect(() => packFiles(null)).toThrow();
  });
});
