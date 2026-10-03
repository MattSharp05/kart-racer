import { readFileSync } from 'node:fs';
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

describe('Vercel config for the pack (MK-136)', () => {
  const config = JSON.parse(
    readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
  ) as {
    buildCommand: string;
    outputDirectory: string;
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };

  it('copies the pack into the deployed output after the build', () => {
    expect(config.buildCommand).toBe('pnpm build && node scripts/fetchMk8Pack.mjs');
    expect(config.outputDirectory).toBe('dist');
  });

  it('keeps every pack file out of shared caches, the font aside', () => {
    const rule = config.headers.find((h) =>
      h.headers.some((x) => x.key === 'Cache-Control' && x.value === 'private, no-cache'),
    );
    expect(rule).toBeDefined();
    // Vercel matches `source` as a path-to-regexp pattern; this one is a plain regular expression.
    const matches = (path: string) => new RegExp(`^${rule!.source}$`).test(path);
    for (const path of [
      '/mk8/manifest.json',
      '/mk8/models/racers/mario.glb',
      '/mk8/models/courses/water-park/collision.bin',
      '/mk8/ui/title/logo.webp',
    ])
      expect(matches(path), path).toBe(true);
    for (const path of ['/mk8/fonts/fonts.css', '/', '/assets/main.js'])
      expect(matches(path), path).toBe(false);
  });
});
