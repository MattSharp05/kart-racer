// Route surfaces (MK-105): a course's road relabelled by its route.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from './math';
import { collisionFromTriangles, MESH_SURFACES, type MeshSurface } from './meshCollision';
import { routeGeometry, type RouteDef } from './route';
import { routeSurfaces } from './routeSurfaces';

/** A 10 m wide loop at y = 0: out along z = 0 (x 0–100), back along z = 60, points every 10 m. */
function route(zones: RouteDef['zones'] = []): RouteDef {
  const p = (x: number, z: number) => ({ x, y: 0, z, width: 10 });
  const xs = Array.from({ length: 11 }, (_, i) => i * 10);
  return {
    points: [
      ...xs.map((x) => p(x, 0)),
      p(120, 30),
      ...xs.reverse().map((x) => p(x, 60)),
      p(-20, 30),
    ],
    checkpoints: [0],
    respawnPoints: [],
    gridSlots: [],
    itemBoxRows: [],
    coinLines: [],
    zones,
  };
}

interface Tri {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  surface?: MeshSurface;
}

const flat = (x: number, z: number, y = 0, size = 1): Tri => ({
  a: { x, y, z },
  b: { x: x + size, y, z },
  c: { x, y, z: z + size },
});

function mesh(tris: Tri[]) {
  const positions = tris.flatMap(({ a, b, c }) => [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z]);
  const surfaces = tris.map((t) => MESH_SURFACES.indexOf(t.surface ?? 'road'));
  return collisionFromTriangles(new Float32Array(positions), new Uint8Array(surfaces), 4);
}

const surfaceOf = (m: ReturnType<typeof mesh>, i: number) => MESH_SURFACES[m.surfaces[i] ?? 0];

describe('routeSurfaces (MK-105)', () => {
  it('keeps road on the road, makes level ground beside it offroad', () => {
    const input = mesh([flat(40, -1), flat(40, 8), flat(40, -12)]);
    const out = routeSurfaces(input, route());
    expect(surfaceOf(out, 0)).toBe('road');
    expect(surfaceOf(out, 1)).toBe('offroad');
    expect(surfaceOf(out, 2)).toBe('offroad');
    // The input is untouched.
    expect(input.surfaces.every((s) => s === MESH_SURFACES.indexOf('road'))).toBe(true);
  });

  it('makes the road inside an antigrav zone anti-gravity, edges included', () => {
    // The zone: 30–50 m along the first straight.
    const along = (x: number) => routeGeometry(route()).project({ x, y: 0, z: 0 }).t;
    const out = routeSurfaces(
      mesh([flat(40, 0), flat(40, 5.5), flat(10, 0)]),
      route([{ kind: 'antigrav', from: along(30), to: along(50) }]),
    );
    expect(surfaceOf(out, 0)).toBe('antigrav');
    expect(surfaceOf(out, 1)).toBe('antigrav');
    expect(surfaceOf(out, 2)).toBe('road');
  });

  it('makes road hanging low over the road (a tunnel arch) and upright faces beside it walls', () => {
    const arch = flat(40, 0, 2.2);
    const rail: Tri = {
      a: { x: 40, y: 0, z: 6 },
      b: { x: 41, y: 0, z: 6 },
      c: { x: 40, y: 1, z: 6 },
    };
    const road = flat(39, -1, 0, 3);
    const out = routeSurfaces(mesh([arch, rail, road]), route());
    expect(surfaceOf(out, 0)).toBe('wall');
    expect(surfaceOf(out, 1)).toBe('wall');
    expect(surfaceOf(out, 2)).toBe('road');
  });

  it('keeps a raised bit of the road itself (nothing beneath it) as road', () => {
    const out = routeSurfaces(mesh([flat(40, 0, 2.2)]), route());
    expect(surfaceOf(out, 0)).toBe('road');
  });

  it('leaves alone what is far from the route, well above or below it, or not road', () => {
    const out = routeSurfaces(
      mesh([flat(40, 200), flat(40, 0, 8), flat(40, 0, -8), { ...flat(40, 8), surface: 'boost' }]),
      route(),
    );
    expect([0, 1, 2].map((i) => surfaceOf(out, i))).toEqual(['road', 'road', 'road']);
    expect(surfaceOf(out, 3)).toBe('boost');
  });

  it('keeps faces standing across the road in an antigrav zone out of it (MK-122: a deck’s end)', () => {
    const along = (x: number) => routeGeometry(route()).project({ x, y: 0, z: 0 }).t;
    // Facing along the road (a deck ending in a drop), and tilted 60° (still road-like).
    const end: Tri = {
      a: { x: 40, y: 0, z: -1 },
      b: { x: 40, y: 0, z: 1 },
      c: { x: 40, y: 1, z: 0 },
    };
    const tilt = Math.tan(Math.PI / 3);
    const steep: Tri = {
      a: { x: 41, y: 0, z: -1 },
      b: { x: 41, y: 0, z: 1 },
      c: { x: 42, y: tilt, z: 0 },
    };
    const out = routeSurfaces(
      mesh([end, steep]),
      route([{ kind: 'antigrav', from: along(30), to: along(50) }]),
    );
    expect(surfaceOf(out, 0)).toBe('road');
    expect(surfaceOf(out, 1)).toBe('antigrav');
  });
});

describe('routeSurfaces with waterIsRoad (MK-122)', () => {
  const water = (t: Tri): Tri => ({ ...t, surface: 'water' });
  /** A water volume over the second straight (z = 60), its top at y = 3. */
  const pool: RouteDef['zones'][number] = {
    kind: 'water',
    min: { x: 20, y: -10, z: 50 },
    max: { x: 80, y: 3, z: 70 },
  };

  it('relabels the pack’s water by the route like road', () => {
    const rail: Tri = {
      a: { x: 40, y: 0, z: 6 },
      b: { x: 41, y: 0, z: 6 },
      c: { x: 40, y: 1, z: 6 },
      surface: 'water',
    };
    const tris = [water(flat(40, -1)), rail, water(flat(40, 9)), water(flat(40, 0, 2.2))];
    // The road under the water patch over it.
    const out = routeSurfaces(mesh([...tris, flat(39, -2, 0, 4)]), route(), { waterIsRoad: true });
    // On the road → road; upright beside → wall; level beside → offroad; over the road → water.
    expect([0, 1, 2, 3].map((i) => surfaceOf(out, i))).toEqual([
      'road',
      'wall',
      'offroad',
      'water',
    ]);
    // Without the option water is left alone.
    const plain = routeSurfaces(mesh(tris), route());
    expect([0, 1, 2, 3].map((i) => surfaceOf(plain, i))).toEqual([
      'water',
      'water',
      'water',
      'water',
    ]);
  });

  it('makes anything lying flat on a water volume’s top water, even a huge lid labelled road', () => {
    const lid: Tri = {
      a: { x: -100, y: 3, z: 40 },
      b: { x: 200, y: 3, z: 40 },
      c: { x: 50, y: 3, z: 300 },
    };
    const surface = water(flat(50, 60, 3));
    const floor = water(flat(50, 60, 0));
    const out = routeSurfaces(mesh([lid, surface, floor]), route([pool]), { waterIsRoad: true });
    expect([0, 1, 2].map((i) => surfaceOf(out, i))).toEqual(['water', 'water', 'road']);
    // Without the option the lid stays the road it was labelled.
    expect(surfaceOf(routeSurfaces(mesh([lid]), route([pool])), 0)).toBe('road');
  });
});
