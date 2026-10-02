import { describe, expect, it } from 'vitest';
import { collisionFromObj, guessMaterials } from '../mk8/spike/collision';
import { syntheticCourse, type CourseSample } from '../mk8/spike/course';
import { parseObj } from '../mk8/spike/obj';
import type { Vec3 } from './math';
import { collisionMesh, groundAt, wallContact, type CollisionMesh } from './meshTrack';

/**
 * ADR 0010's budget, MK-98's acceptance criterion: 8 karts × (ground + wall) per tick. Mario Kart
 * Stadium's real collision isn't available to builders (ADR 0009: local only), so this runs on the
 * MK-92 synthetic anti-gravity course at 4× tessellation, unsimplified: 57,820 collision triangles
 * (barrel roll, 80° bank, rails), about twice the pipeline's 25k cap, so heavier than a real course
 * should be. The real-mesh check is deferred to Matthew's local build (see the ticket).
 */
const BUDGET_MS = 0.3;
const KARTS = 8;
/** 150cc top speed, m/s, so karts move about as far per tick as in a race. */
const SPEED = 28;
const DT = 1 / 60;
/** Kart centre above the road and its wall-sphere radius (the spike's kart), m. */
const RIDE_HEIGHT = 0.45;
const WALL_RADIUS = 0.9;

interface Pose {
  position: Vec3;
  up: Vec3;
  /** Wheel offsets (forward ±1 m, right ±0.7 m), for the 5-ray variant. */
  wheels: Vec3[];
}

const vec = (v: readonly number[]): Vec3 => ({ x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0 });
const offset = (p: Vec3, d: readonly number[], k: number): Vec3 => ({
  x: p.x + (d[0] ?? 0) * k,
  y: p.y + (d[1] ?? 0) * k,
  z: p.z + (d[2] ?? 0) * k,
});

/** One lap of poses per kart: 8 karts spread round the lap, each on its own line across the road. */
function racePoses(samples: CourseSample[], spacing: number): Pose[][] {
  const perTick = Math.max(1, Math.round((SPEED * DT) / spacing));
  const ticks = Math.floor(samples.length / perTick);
  return Array.from({ length: ticks }, (_, tick) =>
    Array.from({ length: KARTS }, (_, k) => {
      const s =
        samples[(tick * perTick + Math.floor((k * samples.length) / KARTS)) % samples.length];
      if (!s) throw new Error('no sample');
      // −11.5 … +11.5 m: the outer karts ride against the rails at ±12 m.
      const lateral = -11.5 + (23 * k) / (KARTS - 1);
      const position = offset(offset(vec(s.c), s.r, lateral), s.u, RIDE_HEIGHT);
      const wheels = [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([f, r]) => offset(offset(position, s.t, f ?? 0), s.r, 0.7 * (r ?? 0)));
      return { position, up: vec(s.u), wheels };
    }),
  );
}

/** Mean and p99 ms per tick, fastest of `rounds` passes (a busy machine doesn't flake it). */
function timePerTick(ticks: Pose[][], step: (pose: Pose) => void, rounds = 5) {
  const pass = () =>
    ticks.map((karts) => {
      const start = performance.now();
      for (const pose of karts) step(pose);
      return performance.now() - start;
    });
  pass(); // warm up
  let best: number[] = [];
  let bestSum = Infinity;
  for (let r = 0; r < rounds; r++) {
    const times = pass();
    const sum = times.reduce((a, b) => a + b, 0);
    if (sum < bestSum) {
      bestSum = sum;
      best = times;
    }
  }
  const sorted = [...best].sort((a, b) => a - b);
  return {
    meanMs: bestSum / best.length,
    p99Ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
  };
}

describe('MK-98: mesh queries for 8 karts per tick', () => {
  const detail = 2;
  const course = syntheticCourse(detail);
  const obj = parseObj(course.obj);
  const mesh: CollisionMesh = collisionMesh(collisionFromObj(obj, guessMaterials(obj.materials)));
  const ticks = racePoses(course.samples, 1 / detail);
  let grounded = 0;
  let walls = 0;
  const groundAndWall = (pose: Pose) => {
    if (groundAt(mesh, pose.position, pose.up)) grounded++;
    if (wallContact(mesh, pose.position, WALL_RADIUS, pose.up)) walls++;
  };

  it(`ground + wall stays under ${BUDGET_MS} ms on a Stadium-scale mesh`, () => {
    expect(mesh.surfaces.length).toBeGreaterThan(50_000);
    const cost = timePerTick(ticks, groundAndWall);
    console.info(
      `MK-98 perf: ${mesh.surfaces.length} triangles, ${ticks.length} ticks × 8 karts: ground + wall ` +
        `mean ${cost.meanMs.toFixed(3)} ms, p99 ${cost.p99Ms.toFixed(3)} ms per tick`,
    );
    // The poses really are on the road, and the outer karts really touch the rails.
    expect(grounded / (ticks.length * KARTS * 6)).toBeGreaterThan(0.95);
    expect(walls).toBeGreaterThan(0);
    expect(cost.meanMs).toBeLessThan(BUDGET_MS);
  });

  it(`a kart's 5 ground rays (4 wheels + centre) + wall stay under ${BUDGET_MS} ms too`, () => {
    const cost = timePerTick(ticks, (pose) => {
      for (const wheel of pose.wheels) groundAt(mesh, wheel, pose.up);
      groundAt(mesh, pose.position, pose.up);
      wallContact(mesh, pose.position, WALL_RADIUS, pose.up);
    });
    console.info(
      `MK-98 perf: 5 rays + wall: mean ${cost.meanMs.toFixed(3)} ms, p99 ${cost.p99Ms.toFixed(3)} ms per tick`,
    );
    expect(cost.meanMs).toBeLessThan(BUDGET_MS);
  });
});
