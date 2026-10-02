import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCollision, COLLISION_DEFAULTS } from '../../../tools/mk8/collision.ts';
import { loadObj } from '../../../tools/mk8/models.ts';
import { driveLaps, groundQueryCost } from './bench';
import { CollisionWorld, collisionFromObj, guessMaterials } from './collision';
import { syntheticCourse } from './course';
import { parseObj } from './obj';

/** ADR 0010's budget: 8 karts' ground queries per tick. */
const BUDGET_MS = 0.3;

describe('MK-92: ground query cost for 8 karts per tick', () => {
  it(`stays under ${BUDGET_MS} ms on the spike course`, () => {
    const course = syntheticCourse();
    const obj = parseObj(course.obj);
    const world = new CollisionWorld(collisionFromObj(obj, guessMaterials(obj.materials)));
    const { poses } = driveLaps(world, course, 1);
    expect(groundQueryCost(world, poses).meanMs).toBeLessThan(BUDGET_MS);
  });

  it(`stays under ${BUDGET_MS} ms on a 4× denser course simplified by the MK-93 pipeline`, async () => {
    const course = syntheticCourse(2);
    const obj = parseObj(course.obj);
    const file = join(mkdtempSync(join(tmpdir(), 'mk92-perf-')), 'course.obj');
    writeFileSync(file, course.obj);
    const mesh = await buildCollision(await loadObj(file), {
      ...COLLISION_DEFAULTS,
      materials: guessMaterials(obj.materials),
    });
    expect(mesh.surfaces.length).toBeLessThan(obj.positions.reduce((n, p) => n + p.length / 9, 0));
    const world = new CollisionWorld(mesh);
    const { poses } = driveLaps(world, course, 1);
    expect(groundQueryCost(world, poses).meanMs).toBeLessThan(BUDGET_MS);
  }, 60_000);
});
