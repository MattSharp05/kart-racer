import { describe, expect, it } from 'vitest';
import { testRampTrack } from '../mk8/content/courses/test-ramp';
import { collisionFromTriangles, MESH_SURFACES, type MeshSurface } from './meshCollision';
import type { RouteDef } from './route';
import { validateRoute } from './routeValidation';

const ramp = testRampTrack();

/** A 100 m square loop at y = 0, 10 m wide, eight points (clockwise from above). */
function squareRoute(overrides: Partial<RouteDef> = {}): RouteDef {
  const corners = [
    [0, 0],
    [50, 0],
    [100, 0],
    [100, 50],
    [100, 100],
    [50, 100],
    [0, 100],
    [0, 50],
  ] as const;
  return {
    points: corners.map(([x, z]) => ({ x, y: 0, z, width: 10 })),
    checkpoints: [0, 0.25, 0.5, 0.75],
    respawnPoints: [{ from: 0.05, to: 0.1, t: 0.05 }],
    gridSlots: Array.from({ length: 8 }, (_, i) => ({ t: 0.99 - i * 0.005, lateral: 0 })),
    itemBoxRows: [],
    coinLines: [],
    zones: [],
    ...overrides,
  };
}

/** A road floor under the whole square, plus a 1 m high wall block over x 40–60 on the z = 0 side. */
function squareCollision() {
  const positions: number[] = [];
  const surfaces: number[] = [];
  const quad = (
    [x0, z0]: [number, number],
    [x1, z1]: [number, number],
    y: number,
    surface: MeshSurface,
  ) => {
    positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1);
    const code = MESH_SURFACES.indexOf(surface);
    surfaces.push(code, code);
  };
  quad([-20, -20], [120, 120], 0, 'road');
  quad([40, -6], [60, 6], 1, 'wall');
  return collisionFromTriangles(new Float32Array(positions), new Uint8Array(surfaces), 8);
}

describe('validateRoute', () => {
  it('passes the test-ramp route over its collision mesh', () => {
    expect(validateRoute(ramp.route, ramp.collision)).toEqual([]);
  });

  it('passes a closed square over a road floor', () => {
    expect(validateRoute(squareRoute(), squareCollision())).toEqual([]);
  });

  it('catches an open route', () => {
    // Stops three quarters of the way round: the closing segment spans the missing quarter.
    const route = squareRoute();
    route.points = route.points.slice(0, 5);
    const issues = validateRoute(route);
    expect(issues).toEqual([expect.objectContaining({ layer: 'route', index: 4 })]);
    expect(issues[0]?.message).toMatch(/open/);
  });

  it('catches too few points', () => {
    const route = squareRoute();
    route.points = route.points.slice(0, 3);
    expect(validateRoute(route, squareCollision())).toEqual([
      expect.objectContaining({ layer: 'route', message: expect.stringMatching(/at least 4/) }),
    ]);
  });

  it('catches gates out of order', () => {
    const issues = validateRoute(squareRoute({ checkpoints: [0, 0.5, 0.25, 0.75] }));
    expect(issues).toEqual([expect.objectContaining({ layer: 'gates', index: 2 })]);
    expect(issues[0]?.message).toMatch(/out of order/);
  });

  it('catches a missing finish-line gate', () => {
    expect(validateRoute(squareRoute({ checkpoints: [0.1, 0.5] }))).toEqual([
      expect.objectContaining({ layer: 'gates', index: 0 }),
    ]);
  });

  it('catches a respawn on a wall', () => {
    // The first side (z = 0, x 0 → 100) spans t 0–0.25, so t 0.125 is x = 50, on the wall block.
    const route = squareRoute({ respawnPoints: [{ from: 0.1, to: 0.2, t: 0.125 }] });
    const issues = validateRoute(route, squareCollision());
    expect(issues).toEqual([
      { layer: 'respawn', index: 0, message: 'Respawn 1 is on wall, not road' },
    ]);
  });

  it('catches a respawn with no ground and a grid slot off the road', () => {
    const route = squareRoute({ respawnPoints: [{ from: 0.1, to: 0.2, t: 0.125 }] });
    route.gridSlots[3] = { t: 0.125, lateral: 2 };
    const floorOnly = collisionFromTriangles(
      new Float32Array([-20, 0, -20, 120, 0, -20, 120, 0, -10]),
      new Uint8Array([MESH_SURFACES.indexOf('road')]),
      8,
    );
    const issues = validateRoute(route, floorOnly);
    expect(issues.map((i) => [i.layer, i.index])).toEqual([
      ['respawn', 0],
      ['grid', 0],
      ['grid', 1],
      ['grid', 2],
      ['grid', 3],
      ['grid', 4],
      ['grid', 5],
      ['grid', 6],
      ['grid', 7],
    ]);
    expect(issues[0]?.message).toBe('Respawn 1 has no ground under it');
  });

  it('catches a grid with the wrong number of slots', () => {
    const route = squareRoute();
    route.gridSlots = route.gridSlots.slice(0, 6);
    expect(validateRoute(route, squareCollision())).toEqual([
      expect.objectContaining({ layer: 'grid', message: 'Grid has 6 slots, needs 8' }),
    ]);
  });

  it('checks item rows, coin lines and zones', () => {
    const route = squareRoute({
      itemBoxRows: [{ t: 1.2, laterals: [] }],
      coinLines: [{ from: 0.1, to: 0.2, lateral: 0, count: 0 }],
      zones: [
        { kind: 'glide', from: -0.1, to: 0.2 },
        { kind: 'water', min: { x: 0, y: 1, z: 0 }, max: { x: 1, y: 0, z: 1 } },
        { kind: 'boostBumper', position: { x: 0, y: 0, z: 0 }, radius: 0 },
        { kind: 'antigrav', from: 0.1, to: 0.3 },
      ],
    });
    expect(validateRoute(route).map((i) => [i.layer, i.index])).toEqual([
      ['itemBoxes', 0],
      ['itemBoxes', 0],
      ['coins', 0],
      ['zones', 0],
      ['zones', 1],
      ['zones', 2],
    ]);
  });
});
