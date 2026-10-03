// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { afterAll, describe, expect, it } from 'vitest';
import { testRampRoute } from '../../mk8/content/courses/test-ramp/route';
import type { RouteDef } from '../../sim/route';
import { GENERATED_HEADER, materialsSource, routeSource } from './serialize';

const dir = mkdtempSync(join(tmpdir(), 'track-editor-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Writes `source` as a module and imports it, as the game would load the committed file. */
async function load<T>(name: string, source: string): Promise<T> {
  const file = join(dir, `${name}.ts`);
  writeFileSync(file, source);
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as T;
}

async function prettier(source: string): Promise<string> {
  const options = await resolveConfig(join(import.meta.dirname, 'serialize.ts'));
  return format(source, { ...options, parser: 'typescript' });
}

describe('routeSource', () => {
  it('round-trips test-ramp: export, load, identical data', async () => {
    const source = routeSource(testRampRoute, 'test-ramp');
    const { route } = await load<{ route: RouteDef }>('route-1', source);
    expect(route).toEqual(testRampRoute);
    // Exporting what was loaded gives the same file.
    expect(routeSource(route, 'test-ramp')).toBe(source);
  });

  it('keeps editor-only fields and every zone kind', async () => {
    const route: RouteDef = {
      ...testRampRoute,
      points: testRampRoute.points.map((p, i) =>
        i === 2 ? { ...p, racingLine: -2.5, up: { x: 0, y: 0.8, z: 0.6 } } : p,
      ),
      zones: [
        ...testRampRoute.zones,
        { kind: 'antigrav', from: 0.1, to: 0.2 },
        { kind: 'boostBumper', position: { x: -0, y: 1e-7, z: 123456.789 }, radius: 1 },
      ],
    };
    const { route: loaded } = await load<{ route: RouteDef }>('route-2', routeSource(route, 'x'));
    expect(loaded).toEqual(route);
    expect(Object.is((loaded.zones.at(-1) as { position: { x: number } }).position.x, -0)).toBe(
      true,
    );
  });

  it('is already in Prettier style and starts with the generated header', async () => {
    const source = routeSource(testRampRoute, 'test-ramp');
    expect(source.startsWith(GENERATED_HEADER)).toBe(true);
    expect(await prettier(source)).toBe(source);
  });

  it('writes an empty route', async () => {
    const empty: RouteDef = {
      points: [],
      checkpoints: [0],
      respawnPoints: [],
      gridSlots: [],
      itemBoxRows: [],
      coinLines: [],
      zones: [],
    };
    const source = routeSource(empty, 'new-course');
    expect((await load<{ route: RouteDef }>('route-3', source)).route).toEqual(empty);
    expect(await prettier(source)).toBe(source);
  });
});

describe('materialsSource', () => {
  it('round-trips, sorted, quoting names that need it', async () => {
    const materials = {
      zz_road: 'road',
      'Kinoko Wall.001': 'wall',
      "it's water": 'water',
      tree_leaf: 'ignore',
    } as const;
    const source = materialsSource(materials, 'c');
    const loaded = await load<{ materials: Record<string, string> }>('materials', source);
    expect(loaded.materials).toEqual(materials);
    expect(Object.keys(loaded.materials)).toEqual([
      'Kinoko Wall.001',
      "it's water",
      'tree_leaf',
      'zz_road',
    ]);
    expect(await prettier(source)).toBe(source);
  });
});
