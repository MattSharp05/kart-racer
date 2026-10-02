// MK-92 spike: measurements shared by the perf test and the report (`pnpm mk8:spike-report`).
import { Autopilot } from './autopilot';
import type { CollisionWorld } from './collision';
import type { SyntheticCourse } from './course';
import { makeKart, probeGround, speedOf, SPIKE_TUNING, stepKart, type SpikeKart } from './kart';

const DEG = 180 / Math.PI;
const KARTS = 8;

export interface DriveStats {
  laps: number;
  ticks: number;
  respawns: number;
  /** Ticks off the ground while on an anti-gravity sample (after the first 2 s). */
  airTicksAntigrav: number;
  /** Largest per-tick turn of `up` on anti-gravity samples, degrees. */
  maxUpStepDeg: number;
  /** Largest |ride height error| on anti-gravity samples, metres. */
  maxGapAntigrav: number;
  minUpY: number;
  /** Slowest speed on the barrel roll (centre above 1 m), m/s. */
  minSpeedInRoll: number;
}

/** Autopilot laps at full throttle; returns stats and the kart poses of every tick. */
export function driveLaps(
  world: CollisionWorld,
  course: SyntheticCourse,
  laps: number,
): { stats: DriveStats; poses: SpikeKart[] } {
  const kart = makeKart(course.start.position, course.start.forward, course.start.up);
  const pilot = new Autopilot(course.samples);
  const poses: SpikeKart[] = [];
  const stats: DriveStats = {
    laps: 0,
    ticks: 0,
    respawns: 0,
    airTicksAntigrav: 0,
    maxUpStepDeg: 0,
    maxGapAntigrav: 0,
    minUpY: 1,
    minSpeedInRoll: Infinity,
  };
  const limit = 60 * 60 * laps;
  while (pilot.laps < laps && stats.ticks < limit) {
    stepKart(world, kart, pilot.input(kart));
    poses.push({ ...kart });
    stats.ticks++;
    const s = pilot.sample;
    if (!s || stats.ticks < 120) continue;
    if (s.antigrav) {
      if (!kart.grounded) stats.airTicksAntigrav++;
      stats.maxUpStepDeg = Math.max(stats.maxUpStepDeg, kart.upStep * DEG);
      stats.maxGapAntigrav = Math.max(stats.maxGapAntigrav, Math.abs(kart.groundGap));
      stats.minUpY = Math.min(stats.minUpY, kart.up[1]);
    }
    if (s.section === 'A' && s.c[1] > 1)
      stats.minSpeedInRoll = Math.min(stats.minSpeedInRoll, speedOf(kart));
  }
  stats.laps = pilot.laps;
  stats.respawns = kart.respawns;
  return { stats, poses };
}

export interface QueryCost {
  /** Mean and worst ground-query time for 8 karts in one tick, ms (fastest of the rounds). */
  meanMs: number;
  p99Ms: number;
  /** Triangles ray-tested per kart query, on average. */
  trianglesPerKart: number;
  ticks: number;
}

/**
 * Ground query cost for 8 karts per tick: the poses of one recorded lap, 8 karts spread evenly
 * along it, each doing the kart's 5-ray `probeGround`. Fastest of `rounds` passes.
 */
export function groundQueryCost(world: CollisionWorld, poses: SpikeKart[], rounds = 5): QueryCost {
  const ticks = Math.floor(poses.length / KARTS);
  const pass = () => {
    const times: number[] = [];
    world.tested = 0;
    for (let tick = 0; tick < ticks; tick++) {
      const start = performance.now();
      for (let k = 0; k < KARTS; k++) {
        const pose = poses[tick + k * ticks];
        if (pose) probeGround(world, pose);
      }
      times.push(performance.now() - start);
    }
    return times;
  };
  pass(); // warm up
  let best: number[] | undefined;
  let tested = 0;
  for (let r = 0; r < rounds; r++) {
    const times = pass();
    const sum = times.reduce((a, b) => a + b, 0);
    if (!best || sum < best.reduce((a, b) => a + b, 0)) {
      best = times;
      tested = world.tested;
    }
  }
  const sorted = [...(best ?? [0])].sort((a, b) => a - b);
  return {
    meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p99Ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
    trianglesPerKart: tested / (ticks * KARTS),
    ticks,
  };
}

/** Whole kart step (ground + walls + physics) for 8 karts, ms per tick (mean, fastest round). */
export function stepCost(world: CollisionWorld, poses: SpikeKart[], rounds = 3): number {
  const ticks = Math.floor(poses.length / KARTS);
  const input = { throttle: 1, brake: 0, steer: 0, drift: false, item: false };
  let best = Infinity;
  for (let r = 0; r < rounds + 1; r++) {
    const start = performance.now();
    for (let tick = 0; tick < ticks; tick++)
      for (let k = 0; k < KARTS; k++) {
        const pose = poses[tick + k * ticks];
        if (pose) stepKart(world, { ...pose }, input);
      }
    if (r > 0) best = Math.min(best, (performance.now() - start) / ticks);
  }
  return best;
}

export const TOP_SPEED = SPIKE_TUNING.topSpeed;
