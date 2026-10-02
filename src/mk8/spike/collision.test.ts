import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCollision,
  COLLISION_DEFAULTS,
  readCollision as toolsRead,
  writeCollision,
} from '../../../tools/mk8/collision.ts';
import { loadObj } from '../../../tools/mk8/models.ts';
import {
  CELL_SIZE,
  CollisionWorld,
  collisionFromObj,
  DRIVABLE,
  guessMaterials,
  SURFACES,
} from './collision';
import { syntheticCourse } from './course';
import { parseObj } from './obj';

describe('synthetic course → collision', () => {
  const course = syntheticCourse();
  const obj = parseObj(course.obj);
  const materials = guessMaterials(obj.materials);

  it('maps its material names with the proposed rules', () => {
    expect(materials).toEqual({
      Wall_Guardrail: 'wall',
      Grass_Offroad: 'offroad',
      Road_Asphalt: 'road',
      Grass_Verge_AG: 'offroad',
      Road_AntiGrav_Panel: 'antigrav',
      Wall_AntiGrav_Rail: 'wall',
      Dash_Panel: 'boost',
      Deco_Tree_Trunk: 'ignore',
      Tree_Leaves: 'ignore',
      Deco_Crowd_Stand: 'ignore',
      Sky_Dome: 'ignore',
    });
  });

  it('uses the pipeline grid cell size', () => {
    expect(CELL_SIZE).toBe(COLLISION_DEFAULTS.cellSize);
  });

  it('builds the same collision.bin bytes as the MK-93 pipeline (obj2gltf → buildCollision)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mk92-'));
    const file = join(dir, 'course.obj');
    writeFileSync(file, course.obj);
    const doc = await loadObj(file);
    const pipeline = writeCollision(
      await buildCollision(doc, { ...COLLISION_DEFAULTS, materials }),
    );
    const spike = writeCollision(collisionFromObj(obj, materials));
    expect(spike.byteLength).toBe(pipeline.byteLength);
    expect(Buffer.from(spike).equals(Buffer.from(pipeline))).toBe(true);
    // And the browser reader is the pipeline's reader.
    expect(toolsRead(spike).surfaces).toEqual(collisionFromObj(obj, materials).surfaces);
  }, 60_000);

  it('drops decoration and keeps every drivable surface', () => {
    const mesh = collisionFromObj(obj, materials);
    const counts = Object.fromEntries(
      SURFACES.map((s, code) => [s, mesh.surfaces.filter((c) => c === code).length]),
    );
    const raw = Object.values(course.triangles).reduce((a, b) => a + b, 0);
    expect(mesh.surfaces.length).toBeLessThan(raw);
    expect(counts.antigrav).toBeGreaterThan(0);
    expect(counts.boost).toBe(4);
    expect(counts.wall).toBeGreaterThan(0);
  });

  it('finds the road straight down from above the start, and nothing from below the floor', () => {
    const world = new CollisionWorld(collisionFromObj(obj, materials));
    const hit = world.raycast([5, 2, 0], [0, -1, 0], 5, DRIVABLE);
    expect(hit?.t).toBeCloseTo(2, 5);
    expect(hit?.normal[1]).toBeCloseTo(1, 5);
    expect(world.raycast([5, -2, 0], [0, -1, 0], 5, DRIVABLE)).toBeNull();
    // On the barrel roll's ceiling (θ = π at x = 130), the road faces down.
    const ceiling = world.raycast([130, 20, 0], [0, 1, 0], 10, DRIVABLE);
    expect(ceiling?.t).toBeCloseTo(4, 1);
    expect(ceiling?.normal[1]).toBeCloseTo(-1, 2);
    expect(SURFACES[ceiling?.surface ?? 0]).toBe('antigrav');
  });
});
