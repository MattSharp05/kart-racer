import { describe, expect, it } from 'vitest';
import { collisionFromTriangles } from './meshTrack';
import type { RouteDef } from './route';
import { routeGroundPoint } from './routeGround';

/**
 * A straight tunnel along +Z (MK-143, like Thwomp Ruins'): a flat floor at y = 0, 24 m wide, a flat
 * ceiling 4 m over it, and a step up to y = 1.5 beyond x = −8 (the route's right is −X). Road everywhere, 1 m triangles.
 */
function tunnel(): ReturnType<typeof collisionFromTriangles> {
  const positions: number[] = [];
  const quad = (x: number, y: number, z: number, flipped: boolean) => {
    const a = [x, y, z];
    const b = [x, y, z + 1];
    const c = [x + 1, y, z];
    const d = [x + 1, y, z + 1];
    if (flipped) positions.push(...a, ...c, ...b, ...c, ...d, ...b);
    else positions.push(...a, ...b, ...c, ...c, ...b, ...d);
  };
  for (let x = -12; x < 12; x++)
    for (let z = -20; z < 60; z++) {
      quad(x, x < -8 ? 1.5 : 0, z, false);
      quad(x, 4, z, true);
    }
  return collisionFromTriangles(
    new Float32Array(positions),
    new Uint8Array(positions.length / 9).fill(0),
    4,
  );
}

/** A loop whose straight runs down the tunnel's middle, its up leaning `lean` radians sideways. */
function leaningRoute(lean: number, y = 0): RouteDef {
  const up = { x: -Math.sin(lean), y: Math.cos(lean), z: 0 };
  return {
    points: [
      { x: 0, y, z: -10, up, width: 14 },
      { x: 0, y, z: 10, up, width: 14 },
      { x: 0, y, z: 30, up, width: 14 },
      { x: 0, y, z: 50, up, width: 14 },
      { x: 60, y, z: 50, width: 14 },
      { x: 60, y, z: -10, width: 14 },
    ],
    checkpoints: [0],
    respawnPoints: [],
    gridSlots: [],
    itemBoxRows: [],
    coinLines: [],
    zones: [],
  };
}

describe('pickups on the ground (MK-143)', () => {
  const mesh = tunnel();

  it('lays a row on the floor although the route leans 20° across it', () => {
    const route = leaningRoute((20 * Math.PI) / 180);
    // The route's own spots: the far laterals ±2.5 m off the floor.
    for (const lateral of [-7.2, -2.4, 0, 2.4, 7.2]) {
      const p = routeGroundPoint(route, mesh, 0.12, lateral);
      expect(p.y).toBeCloseTo(0, 4);
      expect(p.x).toBeCloseTo(-lateral, 1);
    }
  });

  it('finds the floor under a buried or raised centreline, never the ceiling', () => {
    expect(routeGroundPoint(leaningRoute(0, -1.2), mesh, 0.12, 2).y).toBeCloseTo(0, 4);
    expect(routeGroundPoint(leaningRoute(0, 1.8), mesh, 0.12, -2).y).toBeCloseTo(0, 4);
  });

  it('puts a slot past a step on the step', () => {
    expect(routeGroundPoint(leaningRoute(0), mesh, 0.12, 9).y).toBeCloseTo(1.5, 4);
  });

  it('leaves pickups over a jump or a glide in the air', () => {
    const jump = { ...leaningRoute(0, 1.8), respawnPoints: [{ from: 0.1, to: 0.15, t: 0.16 }] };
    expect(routeGroundPoint(jump, mesh, 0.12, 0).y).toBeCloseTo(1.8, 4);
    const glide: RouteDef = {
      ...leaningRoute(0, 1.8),
      zones: [{ kind: 'glide', from: 0.1, to: 0.11, landing: 0.2 }],
    };
    expect(routeGroundPoint(glide, mesh, 0.12, 0).y).toBeCloseTo(1.8, 4);
  });

  it('keeps the route’s spot where there is no ground near', () => {
    const route = leaningRoute(0, 20);
    const p = routeGroundPoint(route, mesh, 0.12, 3);
    expect(p.y).toBeCloseTo(20, 4);
  });
});
