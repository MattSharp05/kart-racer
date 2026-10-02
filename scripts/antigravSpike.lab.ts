// MK-92 spike report (`pnpm mk8:spike-report`): the numbers on the ticket and in
// `src/mk8/spike/NOTES.md`, measured on the synthetic anti-gravity course. Detail 1 is the course
// the spike page drives; detail 2 is 4× denser and goes through the MK-93 pipeline's simplifier
// (to the 25k cap), the way a real course mesh would.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'vitest';
import {
  buildCollision,
  COLLISION_DEFAULTS,
  readCollision,
  writeCollision,
} from '../tools/mk8/collision.ts';
import { loadObj } from '../tools/mk8/models.ts';
import { driveLaps, groundQueryCost, stepCost } from '../src/mk8/spike/bench';
import { CollisionWorld, guessMaterials, SURFACES } from '../src/mk8/spike/collision';
import { syntheticCourse } from '../src/mk8/spike/course';
import { parseObj } from '../src/mk8/spike/obj';

const fmt = (n: number, digits = 3) => n.toFixed(digits);

it('MK-92 anti-gravity spike report', async () => {
  const lines: string[] = [];
  const log = (line = '') => {
    lines.push(line);
    process.stdout.write(`${line}\n`);
  };
  for (const detail of [1, 2]) {
    const course = syntheticCourse(detail);
    const obj = parseObj(course.obj);
    const materials = guessMaterials(obj.materials);
    const dir = mkdtempSync(join(tmpdir(), 'mk92-report-'));
    const file = join(dir, 'course.obj');
    writeFileSync(file, course.obj);
    const doc = await loadObj(file);
    const bytes = writeCollision(
      await buildCollision(doc, {
        ...COLLISION_DEFAULTS,
        materials,
        cellSize: Number(process.env.CELL ?? COLLISION_DEFAULTS.cellSize),
      }),
    );
    const mesh = readCollision(bytes);
    const world = new CollisionWorld(mesh);
    const raw = Object.values(course.triangles).reduce((a, b) => a + b, 0);
    const kept = Object.entries(course.triangles)
      .filter(([m]) => materials[m] !== 'ignore')
      .reduce((a, [, n]) => a + n, 0);

    log(`## Detail ${detail}`);
    if (detail === 1) {
      log('Material → surface (proposed rules):');
      for (const m of obj.materials)
        log(`  ${m.padEnd(22)} ${materials[m]} (${course.triangles[m]} tris)`);
    }
    log(
      `Triangles: raw ${raw}, after dropping decoration ${kept}, in collision.bin ${mesh.surfaces.length}`,
    );
    log(
      `  by surface: ${SURFACES.map((s, code) => `${s} ${mesh.surfaces.filter((c) => c === code).length}`).join(', ')}`,
    );
    log(
      `collision.bin: ${bytes.byteLength} bytes (${fmt(bytes.byteLength / 1024 / 1024, 2)} MB), grid ${mesh.gridDims.join('×')} cells of ${mesh.cellSize} m, ${mesh.cellTris.length} index entries`,
    );
    const { stats, poses } = driveLaps(world, course, 2);
    log(
      `Drive (2 laps, autopilot, full throttle): laps ${stats.laps}, respawns ${stats.respawns}, air ticks in anti-grav ${stats.airTicksAntigrav}, min up.y ${fmt(stats.minUpY)}, slowest on the roll ${fmt(stats.minSpeedInRoll, 2)} m/s, max up turn ${fmt(stats.maxUpStepDeg, 2)}°/tick, max ride-height error ${fmt(stats.maxGapAntigrav, 4)} m`,
    );
    const cost = groundQueryCost(world, poses.slice(0, Math.floor(poses.length / 2)));
    log(
      `Ground query, 8 karts × 5 rays per tick: mean ${fmt(cost.meanMs, 4)} ms, p99 ${fmt(cost.p99Ms, 4)} ms (${cost.ticks} ticks), ${fmt(cost.trianglesPerKart, 1)} triangles tested per kart`,
    );
    log(
      `Whole kart step (ground + walls + physics), 8 karts: ${fmt(stepCost(world, poses), 4)} ms per tick`,
    );
    log();
  }
  writeFileSync(join(tmpdir(), 'mk92-report.txt'), `${lines.join('\n')}\n`);
}, 300_000);
