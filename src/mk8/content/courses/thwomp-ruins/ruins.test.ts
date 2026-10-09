// Thwomp Ruins (MK-124; its route traced on the pack in MK-128). The route and Thwomp checks run
// everywhere, and so do races on a stand-in mesh of the route's own road (`routeRibbon.ts`: the AI,
// its Thwomp timing and the laps without the pack). The drive checks on the real course need the pack (`$MK8_OUT`, default `.mk8-out/`;
// never in CI, ADR 0009) and are skipped without it. `pnpm mk8:course-check COURSE=thwomp-ruins`
// runs the full pass, with each race's crush counts.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../../../../content/tracks';
import { hazardPose } from '../../../../sim/hazards';
import { add, scale } from '../../../../sim/math';
import { decodeCollision, GROUND_SURFACES, raycastMesh } from '../../../../sim/meshTrack';
import { routeGeometry, type RouteZone } from '../../../../sim/route';
import { validateRoute } from '../../../../sim/routeValidation';
import { getTrack } from '../../../../sim/track';
import { DT, tuning } from '../../../../sim/tuning';
import { insideWater } from '../../../../sim/underwater';
import { MK8_CUPS } from '../../cups';
import { collisionPath, courseTrack, MK8_COURSE_SCALE, mk8Course, registerCourse } from '..';
import { centrelineGaps, courseRace } from '../courseCheck';
import { routeRibbonCollision } from '../routeRibbon';
import ruins from '.';
import { MODEL_THWOMPS, thwomps } from './thwomps';

const PACK = resolve(process.env.MK8_OUT ?? '.mk8-out');
const COLLISION = resolve(PACK, collisionPath(ruins.packId));
const hasPack = existsSync(COLLISION);

const zone = <K extends RouteZone['kind']>(kind: K) =>
  ruins.route.zones.find((z): z is Extract<RouteZone, { kind: K }> => z.kind === kind);
const geometry = routeGeometry(ruins.route);
/** The Thwomps' places on the lap. */
const spots = thwomps.map((def) => ({ def, at: geometry.project(def.centre) }));

describe('Thwomp Ruins: route and data (MK-124, MK-128)', () => {
  it('is the Mushroom Cup’s fourth course, by its pack id and track id', () => {
    const course = MK8_CUPS.find((c) => c.id === 'mushroom')?.courses[3];
    expect(course).toMatchObject({ pack: ruins.packId, trackId: ruins.trackId });
    expect(mk8Course('thwomp-ruins')).toBe(ruins);
    expect(ruins.trackId).toBe('mk8-ruins');
    expect(ruins.name).toBe('Thwomp Ruins');
  });

  it('has a valid route: closed, gates in order, 8 grid slots, items and coins on the lap', () => {
    expect(validateRoute(ruins.route)).toEqual([]);
    expect(ruins.route.gridSlots).toHaveLength(8);
    expect(ruins.route.checkpoints.length).toBeGreaterThanOrEqual(4);
    expect(ruins.route.itemBoxRows.length).toBeGreaterThanOrEqual(3);
    expect(ruins.route.coinLines.length).toBeGreaterThanOrEqual(5);
  });

  it('runs anti-gravity through the tunnel and up the spiral (over 100 m), banked only there', () => {
    const antigrav = zone('antigrav');
    expect(antigrav).toBeDefined();
    if (!antigrav) return;
    expect((antigrav.to - antigrav.from) * geometry.length).toBeGreaterThan(100);
    const banked = geometry.samples.filter((s) => s.up.y < Math.cos((30 * Math.PI) / 180));
    expect(banked.length).toBeGreaterThan(0);
    for (const s of banked) {
      const t = s.s / geometry.length;
      expect(t).toBeGreaterThan(antigrav.from);
      expect(t).toBeLessThan(antigrav.to);
    }
  });

  it('glides off the board at the top of the spiral, carried over the gap onto the straight', () => {
    const glide = zone('glide');
    const antigrav = zone('antigrav');
    expect(glide?.landing).toBeDefined();
    if (!glide?.landing || !antigrav) return;
    expect(glide.from).toBeGreaterThanOrEqual(antigrav.to);
    expect(glide.landing).toBeGreaterThan(glide.to);
    // The gap is a respawn range: falling short puts karts back before the board.
    expect(
      ruins.route.respawnPoints.some((r) => r.from <= glide.to && r.to >= glide.landing!),
    ).toBe(true);
  });

  it('runs through the sunken passage under water for 50–100 m, never on the start straight', () => {
    const spacing = geometry.length / geometry.samples.length;
    const under = geometry.samples.filter((s) => insideWater(ruins.route, s.position)).length;
    expect(under * spacing).toBeGreaterThan(50);
    expect(under * spacing).toBeLessThan(100);
    expect(insideWater(ruins.route, geometry.frameAt(0).position)).toBe(false);
  });

  it('has four Thwomps on the road after the start, out of step, beside the centreline', () => {
    expect(thwomps).toHaveLength(4);
    expect(ruins.hazards).toBe(thwomps);
    for (const { def, at } of spots) {
      expect(def.kind).toBe('periodic');
      expect(def.thwomp?.lift).toBeGreaterThan(0);
      // On the road of the scaled course (its footprint is in metres, the route in the pack's
      // units), before the temple: clear of the centreline, inside the road's edge.
      const half = (geometry.frameAt(at.t).width / 2) * MK8_COURSE_SCALE;
      const lateral = Math.abs(at.lateral) * MK8_COURSE_SCALE;
      expect(lateral - def.halfWidth).toBeGreaterThan(tuning.hazards.kartRadius);
      expect(lateral + def.halfWidth).toBeLessThan(half);
      expect(at.t).toBeLessThan(0.2);
    }
    expect(new Set(thwomps.map((t) => t.phase)).size).toBe(thwomps.length);
    // Every tick, at least one of each side's pair is up: there's always a way on.
    const period = Math.round((thwomps[0]?.period ?? 0) / DT);
    for (let tick = 0; tick < period; tick += 1) {
      const down = thwomps.filter((t) => hazardPose(t, tick).amount > 0).length;
      expect(down).toBeLessThan(thwomps.length);
    }
  });

  it('squashes for tuning.mk8.squashTime: positions are a pure function of the tick', () => {
    expect(tuning.mk8.squashTime).toBeGreaterThan(0);
    for (const def of thwomps)
      for (const tick of [0, 100, 777.25])
        expect(hazardPose(def, tick)).toEqual(hazardPose(structuredClone(def), tick));
  });
});

describe('Thwomp Ruins on its route’s stand-in mesh (MK-124, no pack)', () => {
  const id = 'mk8-ruins-ribbon';
  beforeAll(() => {
    if (tracks.has(id)) return;
    const def = { ...courseTrack(ruins, routeRibbonCollision(ruins.route)), id };
    tracks.register({ id, name: 'Thwomp Ruins (route ribbon)', order: 2000, def, testOnly: true });
  });

  it('has drivable ground under every metre of the centreline', () => {
    expect(centrelineGaps(id)).toEqual([]);
  });

  for (const seed of [1, 2])
    it(`seed ${seed}: the player on the autopilot and 7 AI finish 3 laps; the AI mostly time the Thwomps`, () => {
      const r = courseRace(id, seed);
      expect(r.unfinished).toEqual([]);
      expect(r.playerLaps).toBe(3);
      expect(r.worstStuck).toBeLessThan(5);
      // 7 AI × 3 laps × 4 Thwomps = 84 passes under a Thwomp: crushed on under 1 in 10.
      const aiCrushes = r.crushes.slice(1).reduce((a, b) => a + b, 0);
      expect(aiCrushes).toBeLessThan(84 / 10);
    });
});

describe.skipIf(!hasPack)('Thwomp Ruins on the real pack (local only)', () => {
  beforeAll(() => {
    if (tracks.has(ruins.trackId)) return;
    const bytes = readFileSync(COLLISION);
    registerCourse(
      ruins,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
  });

  it('registers with its Thwomps, moved with the course scale', () => {
    const track = getTrack(ruins.trackId);
    expect(track.kind === 'mesh' && track.hazards).toEqual(
      thwomps.map((t) => ({
        ...t,
        centre: {
          x: t.centre.x * MK8_COURSE_SCALE,
          y: t.centre.y * MK8_COURSE_SCALE,
          z: t.centre.z * MK8_COURSE_SCALE,
        },
      })),
    );
  });

  it('takes the stone Thwomps out of the collision, and nothing else on the road', () => {
    const bytes = readFileSync(COLLISION);
    const raw = decodeCollision(bytes);
    const track = getTrack(ruins.trackId);
    if (track.kind !== 'mesh') throw new Error('not a mesh track');
    const dropped = raw.surfaces.length - track.collision.surfaces.length;
    expect(dropped).toBeGreaterThan(300);
    expect(dropped).toBeLessThan(600);
    for (const box of MODEL_THWOMPS) {
      const centre = {
        x: ((box.min.x + box.max.x) / 2) * MK8_COURSE_SCALE,
        y: box.max.y * MK8_COURSE_SCALE,
        z: ((box.min.z + box.max.z) / 2) * MK8_COURSE_SCALE,
      };
      // Straight down through where a stone Thwomp stood: the grass it stood in, nothing above.
      const hit = raycastMesh(track.collision, centre, { x: 0, y: -1, z: 0 }, 20, GROUND_SURFACES);
      expect(hit?.point.y ?? 0).toBeLessThan((box.min.y + 0.05) * MK8_COURSE_SCALE);
      expect(hit?.point.y ?? 0).toBeGreaterThan((box.min.y - 1) * MK8_COURSE_SCALE);
    }
  });

  it('starts every kart on the ground on the grid, behind the line', () => {
    const track = getTrack(ruins.trackId);
    if (track.kind !== 'mesh') throw new Error('not a mesh track');
    const scaled = routeGeometry(track.route);
    for (const slot of track.route.gridSlots) {
      const frame = scaled.frameAt(slot.t, slot.lateral);
      const hit = raycastMesh(
        track.collision,
        add(frame.position, scale(frame.up, 3)),
        scale(frame.up, -1),
        6,
        GROUND_SURFACES,
      );
      expect(hit?.surface).toBe('road');
      expect(slot.t).toBeGreaterThan(0.95);
    }
  });

  it('has drivable ground under every metre of the centreline', () => {
    expect(centrelineGaps(ruins.trackId)).toEqual([]);
  });

  it('a 150cc race: the player on the autopilot and 7 AI finish 3 laps, nobody stuck', () => {
    const r = courseRace(ruins.trackId, 1);
    expect(r.unfinished).toEqual([]);
    expect(r.playerLaps).toBe(3);
    expect(r.worstStuck).toBeLessThan(5);
  });
});
