// A course's collision built from its model is never simplified (MK-123 round 2,
// `modelCollision.ts`), so this holds a dense one to ADR 0010's query budget: 8 karts × (5 ground
// rays + wall) per tick under 0.3 ms. The real course models stay local (ADR 0009), so the course is
// generated: 300k triangles over ~720 m (road and wall layers of 1.6 m quads, each wall layer over
// its road: several times what a real course keeps after its `ignore` materials), written as the pipeline writes a course GLB
// (meshopt, quantized) and scaled like an MK8 course.
import { Document } from '@gltf-transform/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { encodeGlb, MODEL_DEFAULTS, optimiseGeometry } from '../../../../tools/mk8/models';
import type { Vec3 } from '../../../sim/math';
import type { CollisionMesh } from '../../../sim/meshCollision';
import { scaleCollision } from '../../../sim/meshScale';
import { groundAt, wallContact } from '../../../sim/meshTrack';
import { MK8_COURSE_SCALE } from '.';
import { modelCollision, modelCollisionReady } from './modelCollision';

const BUDGET_MS = 0.3;
/** One-off build at load; generous for CI's runners (about 0.4 s in a cloud container). */
const BUILD_BUDGET_MS = 3000;
const KARTS = 8;
const TICKS = 600;
/** 60 patches of 50 × 25 quads per layer, 1.6 m each, 90 m apart. */
const PATCHES = 60;
const QUAD = 1.6;
const SPACING = 90;

function denseCourse(): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  doc.getRoot().setDefaultScene(scene);
  const road = doc.createMaterial('road');
  const wall = doc.createMaterial('wall');
  for (let k = 0; k < PATCHES; k += 1)
    for (const material of [road, wall]) {
      const [n, w] = [50, 25];
      const positions: number[] = [];
      const indices: number[] = [];
      const height = material === wall ? 4 : 0.3;
      for (let j = 0; j <= w; j += 1)
        for (let i = 0; i <= n; i += 1)
          positions.push(
            i * QUAD + (k % 8) * SPACING,
            Math.sin(i * 0.3 + j) * height,
            j * QUAD + Math.floor(k / 8) * SPACING,
          );
      for (let j = 0; j < w; j += 1)
        for (let i = 0; i < n; i += 1) {
          const a = j * (n + 1) + i;
          indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
        }
      const prim = doc
        .createPrimitive()
        .setMaterial(material)
        .setAttribute(
          'POSITION',
          doc
            .createAccessor()
            .setType('VEC3')
            .setArray(new Float32Array(positions))
            .setBuffer(buffer),
        )
        .setIndices(
          doc
            .createAccessor()
            .setType('SCALAR')
            .setArray(new Uint32Array(indices))
            .setBuffer(buffer),
        );
      scene.addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
    }
  return doc;
}

describe('MK-123: collision built from a dense course model', () => {
  let glb: Uint8Array;
  let mesh: CollisionMesh;
  let buildMs = Infinity;

  beforeAll(async () => {
    const doc = denseCourse();
    await optimiseGeometry(doc, MODEL_DEFAULTS);
    glb = await encodeGlb(doc, MODEL_DEFAULTS.lowTextureSize, MODEL_DEFAULTS);
    await modelCollisionReady;
    for (let round = 0; round < 3; round += 1) {
      const start = performance.now();
      mesh = modelCollision(glb, { road: 'road', wall: 'wall' }).mesh;
      buildMs = Math.min(buildMs, performance.now() - start);
    }
    mesh = scaleCollision(mesh, MK8_COURSE_SCALE);
  }, 120_000);

  it(`builds once at load in under ${BUILD_BUDGET_MS} ms`, () => {
    expect(mesh.surfaces.length).toBe(PATCHES * 2 * 50 * 25 * 2);
    console.info(
      `MK-123 perf: ${mesh.surfaces.length} triangles built in ${buildMs.toFixed(0)} ms`,
    );
    expect(buildMs).toBeLessThan(BUILD_BUDGET_MS);
  });

  it(`8 karts' 5 ground rays + wall stay under ${BUDGET_MS} ms per tick`, () => {
    const up: Vec3 = { x: 0, y: 1, z: 0 };
    const s = MK8_COURSE_SCALE;
    // Karts spread over the patches, moving 0.47 m (28 m/s) a tick.
    const pose = (tick: number, kart: number): Vec3 => {
      const patch = (kart * 7) % PATCHES;
      return {
        x: ((patch % 8) * SPACING + ((tick * 0.47) % 76) + 2) * s,
        // Within the ground probe of the road (±0.3 m before scaling).
        y: 0.5,
        z: (Math.floor(patch / 8) * SPACING + 4 + kart * 4) * s,
      };
    };
    let grounded = 0;
    const pass = () => {
      const start = performance.now();
      for (let tick = 0; tick < TICKS; tick += 1)
        for (let kart = 0; kart < KARTS; kart += 1) {
          const p = pose(tick, kart);
          for (const [dx, dz] of [
            [0, 0],
            [1, 0.7],
            [1, -0.7],
            [-1, 0.7],
            [-1, -0.7],
          ])
            if (groundAt(mesh, { x: p.x + (dx ?? 0), y: p.y, z: p.z + (dz ?? 0) }, up))
              grounded += 1;
          wallContact(mesh, p, 0.9 * s, up);
        }
      return (performance.now() - start) / TICKS;
    };
    pass();
    const ms = Math.min(pass(), pass(), pass());
    console.info(`MK-123 perf: 8 karts × (5 rays + wall): ${ms.toFixed(3)} ms per tick`);
    expect(grounded).toBeGreaterThan(0.95 * 4 * TICKS * KARTS * 5);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
