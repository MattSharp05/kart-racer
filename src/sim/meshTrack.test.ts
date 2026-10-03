import { describe, expect, it } from 'vitest';
import { writeCollision } from '../../tools/mk8/collisionFormat.ts';
import { testRampTrack, TEST_RAMP_LAYOUT as L } from '../mk8/content/courses/test-ramp';
import {
  LAP_LENGTH,
  centreAt,
  heightOnA,
  heightOnC,
} from '../mk8/content/courses/test-ramp/layout';
import type { Vec3 } from './math';
import {
  collisionFromTriangles,
  decodeCollision,
  groundAt,
  inWater,
  MESH_SURFACES,
  progressAt,
  raycastMesh,
  surfaceMask,
  wallContact,
  type CollisionMesh,
} from './meshTrack';
import { rngRange, seedRng, type RngHolder } from './rng';
import { routeGeometry } from './route';
import { groundAt as trackGroundAt, VOID_HEIGHT } from './track';
import { tuning } from './tuning';

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const track = testRampTrack();
const mesh = track.collision;
const zC = 2 * L.turnRadius;

describe('collision.bin decoding', () => {
  const bytes = writeCollision(mesh);

  it('reads back exactly what the pipeline writes, and adds the face normals', () => {
    const decoded = decodeCollision(bytes.slice().buffer as ArrayBuffer);
    expect(decoded.positions).toEqual(mesh.positions);
    expect(decoded.surfaces).toEqual(mesh.surfaces);
    expect(decoded.cellSize).toBe(mesh.cellSize);
    expect(decoded.gridMin).toEqual(mesh.gridMin);
    expect(decoded.gridDims).toEqual(mesh.gridDims);
    expect(decoded.cellStart).toEqual(mesh.cellStart);
    expect(decoded.cellTris).toEqual(mesh.cellTris);
    expect(decoded.normals).toEqual(mesh.normals);
    // A view into a bigger buffer works too.
    const padded = new Uint8Array(bytes.byteLength + 8);
    padded.set(bytes, 4);
    expect(decodeCollision(padded.subarray(4, 4 + bytes.byteLength)).positions).toEqual(
      mesh.positions,
    );
  });

  it('rejects a bad magic, version, length or triangle index', () => {
    const broken = (edit: (b: Uint8Array) => Uint8Array) => () =>
      decodeCollision(edit(bytes.slice()));
    expect(broken((b) => (b.set([0x58], 0), b))).toThrow(/magic/);
    expect(broken((b) => (new DataView(b.buffer).setUint32(4, 9, true), b))).toThrow(/version/);
    expect(broken((b) => b.subarray(0, b.byteLength - 4))).toThrow(/expected/);
    expect(broken((b) => b.subarray(0, 10))).toThrow(/too short/);
    expect(
      broken((b) => {
        new DataView(b.buffer).setUint32(b.byteLength - 4, 0xffffff, true);
        return b;
      }),
    ).toThrow(/triangle/);
  });
});

describe('groundAt on mk8-test-ramp', () => {
  const ground = (p: Vec3, up = UP) => groundAt(mesh, p, up);

  it('finds flat road, verges, the dash panel and the glide ramp with their normals', () => {
    const road = ground(v(20.3, 0.5, 1.2));
    expect(road).toMatchObject({ surface: 'road', normal: { x: 0, y: 1, z: 0 } });
    expect(road?.height).toBeCloseTo(0.5, 6);
    expect(road?.point.y).toBeCloseTo(0, 6);
    expect(ground(v(20.3, 0.5, -9))?.surface).toBe('offroad');
    expect(ground(v(20.3, 0.5, 9))?.surface).toBe('offroad');
    expect(ground(v(12.5, 0.5, 0.5))?.surface).toBe('boost');
    const ramp = ground(v(95.5, 2.2, 0.5));
    expect(ramp?.surface).toBe('glide');
    expect(ramp?.point.y).toBeCloseTo(heightOnA(95.5), 5);
    const slope = L.glide.rise / (L.glide.to - L.glide.from);
    expect(ramp?.normal.x).toBeCloseTo(-slope / Math.hypot(slope, 1), 5);
    expect(ramp?.normal.y).toBeCloseTo(1 / Math.hypot(slope, 1), 5);
    // The road floor of a turn.
    const turn = centreAt(L.straightTo + 30);
    expect(ground({ ...turn.position, y: 0.4 })?.surface).toBe('road');
  });

  it('drives the tunnel’s 90° anti-gravity wall and its ceiling along their own up', () => {
    const wall = ground(v(45.5, 4, L.roadHalfWidth - 0.5), v(0, 0, -1));
    expect(wall).toMatchObject({ surface: 'antigrav', normal: { x: 0, y: 0, z: -1 } });
    expect(wall?.height).toBeCloseTo(0.5, 6);
    expect(wall?.point.z).toBeCloseTo(L.roadHalfWidth, 6);
    const ceiling = ground(v(45.5, L.tunnel.height - 0.5, 0.5), v(0, -1, 0));
    expect(ceiling).toMatchObject({ surface: 'antigrav', normal: { x: 0, y: -1, z: 0 } });
    expect(ceiling?.height).toBeCloseTo(0.5, 6);
    // On the tunnel floor the ceiling is far above the probe: the road is the ground.
    expect(ground(v(45.5, 0.5, 0.5))?.surface).toBe('road');
  });

  it('hits on shared triangle edges and vertices, the same way every time', () => {
    for (const x of [20, 20.5, 21, 99, 140])
      for (const z of [-11, -7, -3.5, -1.75, 0, 1.75, 3.5, 7, 11]) {
        const position = v(x, heightOnA(x) + 0.5, z);
        const hit = ground(position);
        expect(hit, `${x}, ${z}`).not.toBeNull();
        expect(hit?.height).toBeCloseTo(0.5, 5);
        expect(hit?.normal.y).toBeGreaterThan(0.95);
        expect(ground(position)).toEqual(hit);
        // A road/verge boundary: either side, but never anything else.
        if (Math.abs(z) === L.roadHalfWidth)
          expect(['road', 'offroad', 'glide']).toContain(hit?.surface);
      }
    // A diagonal of a road quad and a vertex of the curved road.
    expect(ground(v(30.25, 0.5, 0.875))?.surface).toBe('road');
    const bend = centreAt(L.straightTo + Math.PI * L.turnRadius * (17 / 126));
    expect(ground({ ...bend.position, y: 0.5 })?.height).toBeCloseTo(0.5, 5);
  });

  it('sees nothing over the gap within reach, and the void floor below it', () => {
    expect(ground(v(110, 0.5, 0))).toBeNull();
    const down = raycastMesh(mesh, v(110, 0, 0), v(0, -1, 0), 50, surfaceMask(...MESH_SURFACES));
    expect(down).toMatchObject({ surface: 'void', point: { y: L.gap.voidY } });
    expect(ground(v(110, L.gap.voidY + 0.5, 0))?.surface).toBe('void');
  });

  it('ignores the water surface: the ground is the basin floor', () => {
    expect(ground(v(80.5, 0.3, zC + 0.5))).toBeNull();
    const floor = ground(v(80.5, heightOnC(80.5) + 0.5, zC + 0.5));
    expect(floor?.surface).toBe('road');
    expect(floor?.point.y).toBeCloseTo(-L.water.depth, 5);
    const water = raycastMesh(mesh, v(80.5, 1, zC), v(0, -1, 0), 5, surfaceMask('water'));
    expect(water).toMatchObject({ surface: 'water', distance: 1 });
  });

  it('respects the probe distances from tuning', () => {
    const { groundProbeUp, groundProbeDown } = tuning.meshTrack;
    expect(ground(v(20.5, groundProbeDown - 0.01, 0.5))?.surface).toBe('road');
    expect(ground(v(20.5, groundProbeDown + 0.01, 0.5))).toBeNull();
    expect(ground(v(20.5, 0.01 - groundProbeUp, 0.5))?.height).toBeCloseTo(0.01 - groundProbeUp, 5);
    expect(ground(v(20.5, -0.01 - groundProbeUp, 0.5))).toBeNull();
    expect(ground(v(1000, 0, 1000))).toBeNull();
  });
});

describe('wallContact on mk8-test-ramp', () => {
  const r = 1;

  it('pushes a kart out of a wall in the road plane, once per wall', () => {
    // The left wall stands at lateral −11 (z = −11 on straight A).
    for (const x of [20, 20.25, 20.5, 21]) {
      const contact = wallContact(mesh, v(x, 0.5, -10.5), r, UP);
      expect(contact?.push.z).toBeCloseTo(0.5, 6);
      expect(contact?.push.x).toBeCloseTo(0, 6);
      expect(contact?.normal).toEqual({ x: 0, y: 0, z: 1 });
    }
    expect(wallContact(mesh, v(20, 0.5, 0), r, UP)).toBeNull();
  });

  it('never lifts the kart: above a wall’s top edge the push stays sideways', () => {
    const contact = wallContact(mesh, v(20.5, L.wallHeight + 0.6, -11.2), r, UP);
    expect(contact?.push.y).toBe(0);
    expect(contact?.push.z).toBeLessThan(0);
  });

  it('combines a corner into one push and leaves anti-gravity walls to the ground query', () => {
    // Two walls at right angles (a tiny standalone mesh): the push clears both.
    const wall = (a: number[], b: number[], c: number[], d: number[]) => [
      ...a,
      ...b,
      ...c,
      ...a,
      ...c,
      ...d,
    ];
    const positions = new Float32Array([
      ...wall([0, 0, 0], [10, 0, 0], [10, 2, 0], [0, 2, 0]),
      ...wall([0, 0, 0], [0, 0, 10], [0, 2, 10], [0, 2, 0]),
    ]);
    const corner: CollisionMesh = collisionFromTriangles(positions, new Uint8Array(4).fill(3), 4);
    const contact = wallContact(corner, v(0.5, 1, 0.5), r, UP);
    expect(contact?.contacts).toBeGreaterThanOrEqual(2);
    expect(contact?.push.x).toBeCloseTo(0.5, 6);
    expect(contact?.push.z).toBeCloseTo(0.5, 6);
    expect(wallContact(mesh, v(45.5, 0.5, L.roadHalfWidth - 0.5), r, UP)).toBeNull();
  });

  it('ignores walls touched only further than `below` under the centre: a step it rolls over', () => {
    // A 0.25 m step face across the road at x = 0 (a ramp's lip): the kart's centre 0.5 m up.
    const step = new Float32Array([
      0, 0, -5, 0, 0, 5, 0, 0.25, 5, 0, 0, -5, 0, 0.25, 5, 0, 0.25, -5,
    ]);
    const lip: CollisionMesh = collisionFromTriangles(step, new Uint8Array(2).fill(3), 4);
    const centre = v(0.6, 0.5, 0);
    expect(wallContact(lip, centre, r, UP)?.push.x).toBeGreaterThan(0);
    // Touched 0.25 m under the centre: ignored when only contacts within 0.2 m count…
    expect(wallContact(lip, centre, r, UP, undefined, 0.2)).toBeNull();
    // …kept when they count down to 0.3 m.
    expect(wallContact(lip, centre, r, UP, undefined, 0.3)?.push.x).toBeGreaterThan(0);
    // A tall wall touched beside the centre still pushes.
    expect(wallContact(mesh, v(20, 0.5, -10.5), r, UP, undefined, 0.2)?.push.z).toBeCloseTo(0.5, 6);
  });
});

describe('route queries on mk8-test-ramp', () => {
  const route = track.route;

  it('knows where the water is', () => {
    expect(inWater(route, v(80, -1, zC))).toBe(true);
    expect(inWater(route, v(80, 0.5, zC))).toBe(false);
    expect(inWater(route, v(80, -1, 0))).toBe(false);
  });

  it('gives monotonically increasing progress around the lap', () => {
    const rng: RngHolder = { rngState: seedRng(98) };
    let previous = progressAt(route, v(0, 0.5, 0));
    expect(previous).toBeCloseTo(0, 3);
    let wraps = 0;
    for (let s = 0.5; s <= LAP_LENGTH + 0.25; s += 0.5) {
      const frame = centreAt(s);
      const lateral = rngRange(rng, -6, 6);
      const p = frame.position;
      const y = frame.section === 'A' ? heightOnA(p.x) : frame.section === 'C' ? heightOnC(p.x) : 0;
      const position = v(p.x + frame.right.x * lateral, y + 0.5, p.z + frame.right.z * lateral);
      const t = progressAt(route, position, previous);
      if (t < previous) {
        wraps += 1;
        expect(previous, `wrap at s = ${s}`).toBeGreaterThan(0.99);
      } else expect(t, `s = ${s}`).toBeGreaterThan(previous);
      // Without a hint the answer is the same here (nothing overlaps on this course).
      expect(progressAt(route, position)).toBe(t);
      expect(Math.abs(t - (s % LAP_LENGTH) / LAP_LENGTH) * LAP_LENGTH, `s = ${s}`).toBeLessThan(2);
      previous = t;
    }
    expect(wraps).toBe(1);
  });

  it('places the grid, item boxes and coins over the road', () => {
    const geometry = routeGeometry(route);
    const spots = [
      ...route.gridSlots,
      ...route.itemBoxRows.flatMap((row) => row.laterals.map((lateral) => ({ t: row.t, lateral }))),
      ...route.coinLines.map((line) => ({ t: line.from, lateral: line.lateral })),
    ];
    for (const { t, lateral } of spots) {
      const frame = geometry.frameAt(t, lateral);
      const hit = groundAt(mesh, { ...frame.position, y: frame.position.y + 0.5 }, frame.up);
      expect(hit?.surface, `t = ${t}`).toBe('road');
    }
    expect(geometry.length).toBeCloseTo(LAP_LENGTH, -1);
  });
});

describe('sim/track groundAt on a mesh track', () => {
  it('dispatches to the mesh and maps its surfaces for the current kart step', () => {
    expect(trackGroundAt(track, v(20.5, 0.5, 0.5))).toMatchObject({
      height: 0,
      surface: 'road',
      meshSurface: 'road',
      normal: { x: 0, y: 1, z: 0 },
    });
    expect(trackGroundAt(track, v(12.5, 0.5, 0.5)).surface).toBe('boostPad');
    expect(trackGroundAt(track, v(20.5, 0.5, -9)).surface).toBe('offroad');
    expect(trackGroundAt(track, v(110, 0.5, 0))).toEqual({ height: VOID_HEIGHT, surface: 'out' });
    expect(trackGroundAt(track, v(110, L.gap.voidY + 0.5, 0))).toEqual({
      height: VOID_HEIGHT,
      surface: 'out',
    });
  });
});

describe('determinism', () => {
  /** 10k seeded ground + wall queries anywhere on the course, with random `up`s. */
  function queries(seed: number) {
    const rng: RngHolder = { rngState: seedRng(seed) };
    const [minX, minY, minZ] = mesh.gridMin;
    const span = mesh.gridDims.map((d) => d * mesh.cellSize);
    return Array.from({ length: 10_000 }, () => {
      const position = v(
        rngRange(rng, minX, minX + (span[0] ?? 0)),
        rngRange(rng, minY, minY + (span[1] ?? 0)),
        rngRange(rng, minZ, minZ + (span[2] ?? 0)),
      );
      // Mostly +Y, sometimes any direction.
      const tilt = rngRange(rng, 0, 1) < 0.7;
      const raw = tilt ? UP : v(rngRange(rng, -1, 1), rngRange(rng, -1, 1), rngRange(rng, -1, 1));
      const len = Math.hypot(raw.x, raw.y, raw.z) || 1;
      return { position, up: v(raw.x / len, raw.y / len, raw.z / len) };
    });
  }
  const run = (m: CollisionMesh, list: ReturnType<typeof queries>) =>
    list.map(({ position, up }) => ({
      ground: groundAt(m, position, up),
      wall: wallContact(m, position, 1.5, up),
    }));

  it('gives the same answers run to run, in any order and on a freshly decoded mesh', () => {
    const list = queries(4242);
    const first = run(mesh, list);
    expect(first.filter((r) => r.ground).length).toBeGreaterThan(100);
    expect(first.filter((r) => r.wall).length).toBeGreaterThan(100);
    expect(run(mesh, list)).toEqual(first);
    expect(run(mesh, [...list].reverse()).reverse()).toEqual(first);
    expect(run(decodeCollision(writeCollision(mesh)), list)).toEqual(first);
  });
});
