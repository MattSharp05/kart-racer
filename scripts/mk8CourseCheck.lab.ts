import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { collisionSourcePath, mk8Course, registerCourse } from '../src/mk8/content/courses';
import { modelCollisionReady } from '../src/mk8/content/courses/modelCollision';
import { centrelineGaps, courseRace } from '../src/mk8/content/courses/courseCheck';
import { getTrack } from '../src/sim/track';
import { MESH_SURFACES } from '../src/sim/meshTrack';
import { tuning, type EngineClass } from '../src/sim/tuning';

/**
 * An MK8 course's drive check (MK-105): `pnpm mk8:course-check`. Needs the real pack (`$MK8_OUT`,
 * default `.mk8-out/`; ADR 0009, never CI). Registers the course from its `collision.bin`, or its
 * model for a course that builds collision from it (MK-123), the route's surface rules applied, sweeps the route's centreline for missing ground, then runs
 * seeded 3-lap races (the player on the route autopilot + 7 AI, items on) and checks everyone
 * finishes with nobody stuck for more than 5 s. `COURSE=` another pack id, `SEEDS=` how many,
 * `CC=` another engine class.
 */
const COURSE = process.env.COURSE ?? 'mario-kart-stadium';
const SEEDS = Number(process.env.SEEDS ?? 5);
const CC = Number(process.env.CC ?? 150) as EngineClass;
if (!(CC in tuning.topSpeed)) throw new Error(`CC=${process.env.CC}: not an engine class`);
/** The ticket's limit on any kart standing still, s. */
const STUCK_LIMIT = 5;

it(`MK8 course check: ${COURSE}, ${SEEDS} seeds at ${CC}cc`, { timeout: 30 * 60_000 }, async () => {
  const course = mk8Course(COURSE);
  if (!course) throw new Error(`No MK8 course content for ${COURSE}`);
  const file = resolve(process.env.MK8_OUT ?? '.mk8-out', collisionSourcePath(course));
  await modelCollisionReady;
  const bytes = readFileSync(file);
  registerCourse(
    course,
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  const track = getTrack(course.trackId);
  if (track.kind !== 'mesh') throw new Error(`${course.trackId} isn't a mesh track`);
  const surfaces: Record<string, number> = {};
  for (const code of track.collision.surfaces) {
    const name = MESH_SURFACES[code] ?? '?';
    surfaces[name] = (surfaces[name] ?? 0) + 1;
  }
  const gaps = centrelineGaps(course.trackId);
  const lines = [
    `${course.name} (${file})`,
    `collision triangles by surface (after the route's rules): ${JSON.stringify(surfaces)}`,
    `centreline gaps: ${gaps.length ? gaps.map((t) => t.toFixed(3)).join(' ') : 'none'}`,
    '',
    'seed | player s | fastest s | slowest s | best lap s | worst stuck s | respawns (player, AI) | crushes (player, AI) | ms CPU',
  ];
  const results = [];
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const start = performance.now();
    const r = courseRace(course.trackId, seed, CC);
    const ms = performance.now() - start;
    results.push(r);
    const done = r.raceTimes.filter((t): t is number => t !== undefined);
    lines.push(
      [
        seed,
        r.raceTimes[0]?.toFixed(1) ?? 'DNF',
        Math.min(...done).toFixed(1),
        `${Math.max(...done).toFixed(1)}${done.length < 8 ? ` (${done.length}/8 finished)` : ''}`,
        r.bestLap.toFixed(2),
        r.worstStuck.toFixed(1),
        `${r.respawns[0] ?? 0}, ${r.respawns.slice(1).reduce((a, b) => a + b, 0)}`,
        `${r.crushes[0] ?? 0}, ${r.crushes.slice(1).reduce((a, b) => a + b, 0)}`,
        ms.toFixed(0),
      ].join(' | '),
    );
  }
  console.log(`\n${lines.join('\n')}\n`);
  expect(gaps).toEqual([]);
  for (const r of results) {
    expect(r.unfinished, `seed ${r.seed}`).toEqual([]);
    expect(r.worstStuck, `seed ${r.seed}`).toBeLessThan(STUCK_LIMIT);
  }
});
