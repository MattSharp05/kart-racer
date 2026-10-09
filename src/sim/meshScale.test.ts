import { describe, expect, it } from 'vitest';
import type { PeriodicHazard } from './hazards/types';
import {
  collisionFromTriangles,
  meshFallLimits,
  raycastMesh,
  surfaceMask,
  type MeshTrackDef,
} from './meshTrack';
import { conformRoute, scaleCollision, scaleHazard, scaleRoute } from './meshScale';
import { routeGeometry, type RouteDef } from './route';
import { tuning } from './tuning';

/** A rolling ground, y = 3·sin(x/9)·cos(z/9), as road triangles 2 m across. */
function hills(): ReturnType<typeof collisionFromTriangles> {
  const height = (x: number, z: number) => 3 * Math.sin(x / 9) * Math.cos(z / 9);
  const positions: number[] = [];
  const step = 2;
  for (let x = -100; x < 100; x += step)
    for (let z = -100; z < 100; z += step) {
      const p = (px: number, pz: number) => [px, height(px, pz), pz];
      positions.push(...p(x, z), ...p(x, z + step), ...p(x + step, z));
      positions.push(...p(x + step, z), ...p(x, z + step), ...p(x + step, z + step));
    }
  return collisionFromTriangles(
    new Float32Array(positions),
    new Uint8Array(positions.length / 9),
    8,
  );
}

const ROAD = surfaceMask('road');

/** The ground's height under (x, z), by a ray. */
function groundY(mesh: ReturnType<typeof hills>, x: number, z: number): number {
  const hit = raycastMesh(mesh, { x, y: 50, z }, { x: 0, y: -1, z: 0 }, 100, ROAD);
  if (!hit) throw new Error(`no ground at ${x}, ${z}`);
  return hit.point.y;
}

/** A loop of 8 points 30 m apart on the hills (radius 40). */
function hillLoop(mesh: ReturnType<typeof hills>): RouteDef {
  return {
    points: Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * 40;
      const z = Math.sin(a) * 40;
      return { x, y: groundY(mesh, x, z), z, width: 8, racingLine: i % 2 };
    }),
    checkpoints: [0, 0.25, 0.5, 0.75],
    respawnPoints: [{ from: 0.6, to: 0.7, t: 0.72 }],
    gridSlots: [{ t: 0.98, lateral: -2 }],
    itemBoxRows: [{ t: 0.3, laterals: [-2, 0, 2] }],
    coinLines: [{ from: 0.1, to: 0.2, lateral: 1, count: 5 }],
    zones: [
      { kind: 'antigrav', from: 0.4, to: 0.5 },
      { kind: 'glide', from: 0.8, to: 0.82, landing: 0.9 },
      { kind: 'water', min: { x: -5, y: -1, z: -5 }, max: { x: 5, y: 2, z: 5 } },
      { kind: 'boostBumper', position: { x: 1, y: 2, z: 3 }, radius: 1.5 },
    ],
  };
}

/** How far each 1 m sample of the route is from the ground, along Y, outside `skip`. */
function offGround(
  route: RouteDef,
  mesh: ReturnType<typeof hills>,
  skip: (t: number) => boolean,
): number {
  const geometry = routeGeometry(route);
  let worst = 0;
  for (const s of geometry.samples) {
    if (skip(s.s / geometry.length)) continue;
    worst = Math.max(worst, Math.abs(s.position.y - groundY(mesh, s.position.x, s.position.z)));
  }
  return worst;
}

describe('scaling a mesh track (MK-105 revisit)', () => {
  it('scales the collision: the same ray, scaled, hits the same triangle at the scaled point', () => {
    const mesh = hills();
    const big = scaleCollision(mesh, 3);
    expect(big.cellSize).toBe(mesh.cellSize * 3);
    expect(big.gridDims).toEqual(mesh.gridDims);
    expect(big.normals).toBe(mesh.normals);
    const down = { x: 0, y: -1, z: 0 };
    const hit = raycastMesh(mesh, { x: 7.3, y: 20, z: -11.1 }, down, 40, ROAD);
    const bigHit = raycastMesh(big, { x: 21.9, y: 60, z: -33.3 }, down, 120, ROAD);
    expect(bigHit?.triangle).toBe(hit?.triangle);
    expect(bigHit?.point.y).toBeCloseTo((hit?.point.y ?? 0) * 3, 4);
    expect(scaleCollision(mesh, 1)).toBe(mesh);
  });

  it('scales every metre of a route and none of its lap fractions', () => {
    const route = hillLoop(hills());
    const big = scaleRoute(route, 3);
    const [p, q] = [route.points[1], big.points[1]];
    expect(q).toEqual({
      x: (p?.x ?? 0) * 3,
      y: (p?.y ?? 0) * 3,
      z: (p?.z ?? 0) * 3,
      width: 24,
      racingLine: 3,
    });
    expect(big.checkpoints).toEqual(route.checkpoints);
    expect(big.respawnPoints).toEqual(route.respawnPoints);
    expect(big.gridSlots).toEqual([{ t: 0.98, lateral: -6 }]);
    expect(big.itemBoxRows).toEqual([{ t: 0.3, laterals: [-6, 0, 6] }]);
    expect(big.coinLines).toEqual([{ from: 0.1, to: 0.2, lateral: 3, count: 5 }]);
    expect(big.zones).toEqual([
      { kind: 'antigrav', from: 0.4, to: 0.5 },
      { kind: 'glide', from: 0.8, to: 0.82, landing: 0.9 },
      { kind: 'water', min: { x: -15, y: -3, z: -15 }, max: { x: 15, y: 6, z: 15 } },
      { kind: 'boostBumper', position: { x: 3, y: 6, z: 9 }, radius: 4.5 },
    ]);
    expect(routeGeometry(big).length).toBeCloseTo(routeGeometry(route).length * 3, 3);
  });

  it("moves a hazard's place, not its size or timing", () => {
    const thwomp: PeriodicHazard = {
      kind: 'periodic',
      centre: { x: 10, y: 0, z: -4 },
      halfWidth: 2.6,
      halfLength: 2.6,
      heading: 1,
      period: 3.6,
      closedFraction: 0.3,
      thwomp: { lift: 5 },
    };
    expect(scaleHazard(thwomp, 3)).toEqual({ ...thwomp, centre: { x: 30, y: 0, z: -12 } });
  });

  it('scales the fall limits with the course: deeper drops, longer falls and glides', () => {
    const track = { kind: 'mesh', scale: 3 } as MeshTrackDef;
    expect(meshFallLimits(track)).toEqual({
      depth: tuning.fallDepth * 3,
      airSeconds: tuning.mk8.fallSeconds * Math.sqrt(3),
      glideSeconds: tuning.mk8.glide.fallSeconds * 3,
    });
    expect(meshFallLimits({ kind: 'mesh' } as MeshTrackDef)).toEqual({
      depth: tuning.fallDepth,
      airSeconds: tuning.mk8.fallSeconds,
      glideSeconds: tuning.mk8.glide.fallSeconds,
    });
  });
});

describe('conformRoute (MK-105 revisit)', () => {
  const mesh = hills();
  const route = scaleRoute(hillLoop(mesh), 1);
  // Jumps and glides, and the authored span either side (a span that reaches into one is left
  // as it is, all of it).
  const SPAN = 1 / 8;
  const flying = (r: RouteDef) => (t: number) =>
    r.respawnPoints.some((p) => t >= p.from - SPAN && t <= p.to + SPAN) ||
    r.zones.some(
      (z) => z.kind === 'glide' && t >= z.from - SPAN && t <= (z.landing ?? z.to) + SPAN,
    );

  it('lays the curve back on the ground between its points, leaving jumps and glides alone', () => {
    const before = offGround(route, mesh, flying(route));
    const conformed = conformRoute(route, mesh, 3);
    expect(before).toBeGreaterThan(1);
    expect(conformed.points.length).toBeGreaterThan(route.points.length);
    expect(offGround(conformed, mesh, flying(conformed))).toBeLessThan(0.5);
    // The authored points are all still there, in order.
    expect(conformed.points.filter((p) => route.points.includes(p))).toEqual(route.points);
  });

  it('moves lap fractions with the curve: a gate on an authored point stays on it', () => {
    const atPoint3 = routeGeometry(route).pointS[3]! / routeGeometry(route).length;
    const gated = { ...route, checkpoints: [0, atPoint3, 0.5, 0.75] };
    const conformed = conformRoute(gated, mesh, 3);
    const geometry = routeGeometry(conformed);
    const index = conformed.points.indexOf(route.points[3]!);
    expect(conformed.checkpoints[0]).toBe(0);
    expect(conformed.checkpoints[1]).toBeCloseTo(geometry.pointS[index]! / geometry.length, 9);
    // Everything else stays in order and in range.
    for (const r of conformed.respawnPoints) expect(r.from).toBeLessThan(r.to);
    expect(conformed.zones.slice(2)).toEqual(gated.zones.slice(2));
  });

  it('changes nothing on a route that already lies on its ground', () => {
    const flat = collisionFromTriangles(
      new Float32Array([
        -500, 0, -500, -500, 0, 500, 500, 0, -500, 500, 0, -500, -500, 0, 500, 500, 0, 500,
      ]),
      new Uint8Array(2),
      50,
    );
    const level = { ...route, points: route.points.map((p) => ({ ...p, y: 0 })) };
    expect(conformRoute(level, flat, 3)).toBe(level);
  });
});
