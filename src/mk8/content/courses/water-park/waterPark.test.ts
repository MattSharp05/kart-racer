// Water Park (MK-122). The route checks run everywhere; the drive checks need the real pack
// (`$MK8_OUT`, default `.mk8-out/`; never in CI, ADR 0009) and are skipped without it.
// `pnpm mk8:course-check COURSE=water-park` runs the full 5-seed pass.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../../../../content/tracks';
import { inWater, routeGeometry } from '../../../../sim/route';
import { validateRoute } from '../../../../sim/routeValidation';
import { insideWater } from '../../../../sim/underwater';
import { MK8_CUPS } from '../../cups';
import { collisionPath, mk8Course, registerCourse } from '..';
import { centrelineGaps, courseRace } from '../courseCheck';
import waterPark from '.';
import { materials } from './materials';

const PACK = resolve(process.env.MK8_OUT ?? '.mk8-out');
const COLLISION = resolve(PACK, collisionPath(waterPark.packId));
const hasPack = existsSync(COLLISION);

/** The pool's water line, m: the model's water surface (`ef_waterF`) and caustics box top. */
const WATER_LINE = 24;
/**
 * The pool's outline (x, z), read off the course model's caustics box: a 93 × 178 m box whose
 * west side runs diagonally, its south-west corner cut off. Our numbers, not the pack's.
 */
const POOL: readonly (readonly [number, number])[] = [
  [-3.2, -87.7],
  [43.4, -87.7],
  [43.4, 90.2],
  [-29.2, 90.2],
  [-49.6, 70.3],
  [-49.6, 50.7],
];

/** Whether (x, z) is inside the pool's outline (even-odd rule). */
function inPool(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = POOL.length - 1; i < POOL.length; j = i, i += 1) {
    const [xi, zi] = POOL[i] ?? [0, 0];
    const [xj, zj] = POOL[j] ?? [0, 0];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

describe('Water Park: route and data (MK-122)', () => {
  it('is the Mushroom Cup’s second course, by its pack id and track id', () => {
    const course = MK8_CUPS.find((c) => c.id === 'mushroom')?.courses[1];
    expect(course).toMatchObject({ pack: waterPark.packId, trackId: waterPark.trackId });
    expect(mk8Course('water-park')).toBe(waterPark);
    expect(waterPark.trackId).toBe('mk8-waterpark');
    expect(waterPark.name).toBe('Water Park');
  });

  it('has a valid route: closed, gates in order, 8 grid slots, items and coins on the lap', () => {
    expect(validateRoute(waterPark.route)).toEqual([]);
    expect(waterPark.route.gridSlots).toHaveLength(8);
    expect(waterPark.route.itemBoxRows.length).toBeGreaterThanOrEqual(3);
    expect(waterPark.route.coinLines.length).toBeGreaterThanOrEqual(5);
  });

  it('a lap is about 480 m', () => {
    const length = routeGeometry(waterPark.route).length;
    expect(length).toBeGreaterThan(460);
    expect(length).toBeLessThan(500);
  });

  it('rides the ring on its side in the anti-gravity section, from the gravity panel to the S', () => {
    const geometry = routeGeometry(waterPark.route);
    const antigrav = waterPark.route.zones.find((z) => z.kind === 'antigrav');
    if (antigrav?.kind !== 'antigrav') throw new Error('no anti-gravity zone');
    // About 220 m of the lap: the coaster deck, the chute, the ring and the pool floor.
    expect((antigrav.to - antigrav.from) * geometry.length).toBeGreaterThan(200);
    const inside = geometry.samples.filter((s) => {
      const t = s.s / geometry.length;
      return t >= antigrav.from && t <= antigrav.to;
    });
    // The ring: the road's up turns sideways (a wall ride) and the top is 30 m over the water.
    expect(Math.min(...inside.map((s) => s.up.y))).toBeLessThan(0);
    expect(Math.max(...inside.map((s) => s.position.y))).toBeGreaterThan(WATER_LINE + 25);
    // Outside the section the road is never more than gently banked.
    const outside = geometry.samples.filter((s) => !inside.includes(s));
    expect(Math.min(...outside.map((s) => s.up.y))).toBeGreaterThan(0.8);
  });

  it('puts the glide board on the ramp out of the water, before the finish straight', () => {
    const glide = waterPark.route.zones.find((z) => z.kind === 'glide');
    if (glide?.kind !== 'glide') throw new Error('no glide zone');
    const frame = routeGeometry(waterPark.route).frameAt(glide.from);
    expect(frame.position.y).toBeGreaterThan(WATER_LINE - 2);
    expect(inPool(frame.position.x, frame.position.z)).toBe(true);
  });

  it('is underwater exactly where the route runs below the pool’s water line (sweep)', () => {
    const geometry = routeGeometry(waterPark.route);
    let submerged = 0;
    for (const sample of geometry.samples) {
      const { x, y, z } = sample.position;
      const below = y < WATER_LINE && inPool(x, z);
      if (below) submerged += 1;
      expect(insideWater(waterPark.route, sample.position), `at ${x}, ${y}, ${z}`).toBe(below);
      expect(inWater(waterPark.route, sample.position)).toBe(below);
    }
    // The chute, the pool floor and the S: roughly a third of the lap.
    expect(submerged / geometry.samples.length).toBeGreaterThan(0.25);
    expect(submerged / geometry.samples.length).toBeLessThan(0.45);
  });

  it('maps the pool’s road and walls, the dash panels and the effect box for the next pack build', () => {
    expect(materials.park_Water_Road).toBe('road');
    expect(materials.park_Water_RoadMetal_IN).toBe('road');
    expect(materials.park_Water_WallB).toBe('wall');
    expect(materials.park_Water_Sand).toBe('offroad');
    expect(materials.PanelFlame).toBe('boost');
    expect(materials.ef_gravityboard).toBe('antigrav');
    expect(materials.ef_glideboard).toBe('glide');
    expect(materials.ef_waterF).toBe('water');
    expect(materials.CausticsArea1).toBe('ignore');
    expect(waterPark.hiddenMaterials).toEqual(expect.arrayContaining(['CausticsArea1', 'ef_sea']));
  });
});

describe.skipIf(!hasPack)('Water Park on the real pack (local only)', () => {
  beforeAll(() => {
    if (tracks.has(waterPark.trackId)) return;
    const bytes = readFileSync(COLLISION);
    registerCourse(
      waterPark,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
  });

  it('has drivable ground under every metre of the centreline (the jump into the pool excepted)', () => {
    expect(centrelineGaps(waterPark.trackId)).toEqual([]);
  });

  it('a 150cc race: the player on the autopilot and 7 AI finish 3 laps, nobody stuck', () => {
    const r = courseRace(waterPark.trackId, 1);
    expect(r.unfinished).toEqual([]);
    expect(r.playerLaps).toBe(3);
    expect(r.respawns[0]).toBe(0);
    expect(r.worstStuck).toBeLessThan(5);
  });
});
