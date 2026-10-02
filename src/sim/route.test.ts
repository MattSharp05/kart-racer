import { describe, expect, it } from 'vitest';
import { progressAt, routeGeometry, type RouteDef, type RoutePoint } from './route';

const p = (x: number, y: number, z: number, up?: RoutePoint['up']): RoutePoint => ({
  x,
  y,
  z,
  width: 12,
  ...(up ? { up } : {}),
});

const empty = {
  checkpoints: [0],
  respawnPoints: [],
  gridSlots: [],
  itemBoxRows: [],
  coinLines: [],
  zones: [],
};

/**
 * Out along +X at ground level, up a hill and back along −X over the same stretch 10 m higher,
 * then down and round: the two passes are stacked (MK8 courses cross over themselves).
 */
const stacked: RouteDef = {
  ...empty,
  points: [
    p(0, 0, 0),
    p(50, 0, 0),
    p(100, 0, 0),
    p(130, 5, 20),
    p(100, 10, 3),
    p(50, 10, 3),
    p(0, 10, 3),
    p(-30, 5, 20),
  ],
};

describe('route geometry', () => {
  it('builds an evenly spaced 3D frame (tangent, up, right orthonormal; right of travel)', () => {
    const geometry = routeGeometry(stacked);
    expect(routeGeometry(stacked)).toBe(geometry);
    for (const s of geometry.samples) {
      const dot = (a: typeof s.up, b: typeof s.up) => a.x * b.x + a.y * b.y + a.z * b.z;
      expect(dot(s.tangent, s.tangent)).toBeCloseTo(1, 9);
      expect(dot(s.up, s.up)).toBeCloseTo(1, 9);
      expect(dot(s.tangent, s.up)).toBeCloseTo(0, 9);
      expect(dot(s.right, s.up)).toBeCloseTo(0, 9);
    }
    // Driving +X with up +Y, right is +Z (heading 0 faces −Z, whose right is +X).
    const start = geometry.frameAt(0.01);
    expect(start.tangent.x).toBeGreaterThan(0.95);
    expect(start.right.z).toBeGreaterThan(0.95);
    expect(geometry.frameAt(0.01, 2).position.z).toBeCloseTo(
      start.position.z + 2 * start.right.z,
      9,
    );
  });

  it('follows per-point up vectors (a road banked onto its side)', () => {
    const side = { x: 0, y: 0, z: -1 };
    const banked: RouteDef = {
      ...empty,
      points: [p(0, 0, 0, side), p(40, 0, 0, side), p(40, 0, 40, side), p(0, 0, 40, side)],
    };
    const frame = routeGeometry(banked).frameAt(0.1);
    expect(frame.up.z).toBeCloseTo(-1, 2);
    expect(Math.abs(frame.right.y)).toBeCloseTo(1, 2);
  });

  it('keeps progress on the right pass where the route is stacked', () => {
    const lower = progressAt(stacked, { x: 50, y: 0.5, z: 1.5 });
    const upper = progressAt(stacked, { x: 50, y: 10.5, z: 1.5 });
    expect(lower).toBeLessThan(0.3);
    expect(upper).toBeGreaterThan(0.5);
    // Halfway between the passes, the hint (last tick's progress) decides.
    const between = { x: 50, y: 5, z: 1.5 };
    expect(progressAt(stacked, between, lower)).toBeCloseTo(lower, 2);
    expect(progressAt(stacked, between, upper)).toBeCloseTo(upper, 2);
  });

  it('rejects routes with fewer than 4 points', () => {
    expect(() => routeGeometry({ ...empty, points: [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1)] })).toThrow(
      /4 points/,
    );
  });
});
