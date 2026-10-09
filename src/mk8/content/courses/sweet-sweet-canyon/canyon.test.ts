// Sweet Sweet Canyon (MK-123). The route checks run everywhere; the drive checks need the real pack
// (`$MK8_OUT`, default `.mk8-out/`; never in CI, ADR 0009), whose course model the collision is
// built from with this course's `materials.ts` (round 2), and are skipped without it.
// `pnpm mk8:course-check COURSE=sweet-sweet-canyon` runs the full pass.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../../../../content/tracks';
import { meshAutopilotInput } from '../../../../sim/ai/meshDriver';
import { headingOf } from '../../../../sim/math';
import { routeGeometry, type RouteZone } from '../../../../sim/route';
import { validateRoute } from '../../../../sim/routeValidation';
import { createSimState } from '../../../../sim/state';
import { step } from '../../../../sim/step';
import { getTrack } from '../../../../sim/track';
import type { EngineClass } from '../../../../sim/tuning';
import type { SimEvent, SimState } from '../../../../sim/types';
import { insideWater } from '../../../../sim/underwater';
import { MK8_CUPS } from '../../cups';
import { groundMaterials } from '../../../courses';
import { collisionSourcePath, MK8_COURSE_SCALE, mk8Course, registerCourse } from '..';
import { centrelineGaps, courseRace } from '../courseCheck';
import { modelCollisionReady } from '../modelCollision';
import canyon from '.';
import { materials } from './materials';

const PACK = resolve(process.env.MK8_OUT ?? '.mk8-out');
const COLLISION = resolve(PACK, collisionSourcePath(canyon));
const hasPack = existsSync(COLLISION);

const zone = <K extends RouteZone['kind']>(kind: K) =>
  canyon.route.zones.find((z): z is Extract<RouteZone, { kind: K }> => z.kind === kind);
const geometry = routeGeometry(canyon.route);
/** Distance along the lap of lap fraction `t`, m. */
const metres = (t: number) => t * geometry.length;

describe('Sweet Sweet Canyon: route and data (MK-123)', () => {
  it('is the Mushroom Cup’s third course, by its pack id and track id', () => {
    const course = MK8_CUPS.find((c) => c.id === 'mushroom')?.courses[2];
    expect(course).toMatchObject({ pack: canyon.packId, trackId: canyon.trackId });
    expect(mk8Course('sweet-sweet-canyon')).toBe(canyon);
    expect(canyon.trackId).toBe('mk8-canyon');
    expect(canyon.name).toBe('Sweet Sweet Canyon');
  });

  it('has a valid route: closed, gates in order, 8 grid slots, items and coins on the lap', () => {
    expect(validateRoute(canyon.route)).toEqual([]);
    expect(canyon.route.gridSlots).toHaveLength(8);
    expect(canyon.route.checkpoints.length).toBeGreaterThanOrEqual(4);
    expect(canyon.route.itemBoxRows.length).toBeGreaterThanOrEqual(3);
    expect(canyon.route.coinLines.length).toBeGreaterThanOrEqual(5);
  });

  it('a lap is about 620 m', () => {
    expect(geometry.length).toBeGreaterThan(600);
    expect(geometry.length).toBeLessThan(640);
  });

  it('glides from the tunnel’s mouth to the giant cake: a landing 110 m on and 10 m up', () => {
    const glide = zone('glide');
    expect(glide?.landing).toBeDefined();
    if (glide?.landing === undefined) return;
    const lip = geometry.frameAt(glide.to).position;
    const landing = geometry.frameAt(glide.landing).position;
    expect(Math.hypot(landing.x - lip.x, landing.z - lip.z)).toBeGreaterThan(100);
    expect(landing.y - lip.y).toBeGreaterThan(8);
    // A fall into the lake on the way puts the kart back on the deck.
    const respawn = canyon.route.respawnPoints.find(
      (r) => r.from <= glide.from && r.to >= glide.landing!,
    );
    expect(respawn && metres(respawn.t)).toBeGreaterThan(metres(glide.landing));
  });

  it('dives into the soda before the gravity panel and comes out on the candy ribbons', () => {
    const antigrav = zone('antigrav');
    expect(antigrav).toBeDefined();
    if (!antigrav) return;
    // Anti-gravity from the panel (under the soda) to the end of the ribbons, about 150 m.
    expect(metres(antigrav.to - antigrav.from)).toBeGreaterThan(140);
    expect(insideWater(canyon.route, geometry.frameAt(antigrav.from).position)).toBe(true);
    expect(insideWater(canyon.route, geometry.frameAt(antigrav.to).position)).toBe(false);
    // Under water for 50–90 m of the lap; never on the start straight.
    const under = geometry.samples.filter((s) => insideWater(canyon.route, s.position)).length;
    const spacing = geometry.length / geometry.samples.length;
    expect(under * spacing).toBeGreaterThan(50);
    expect(under * spacing).toBeLessThan(90);
    expect(insideWater(canyon.route, geometry.frameAt(0).position)).toBe(false);
  });

  it('maps the soda’s surface out of the collision and the road under it to road', () => {
    expect(materials.ef_juicenear).toBe('ignore');
    expect(materials.ef_juicefar).toBe('ignore');
    expect(materials.ck_sponge01a_water).toBe('road');
    expect(materials.ck_candy01).toBe('antigrav');
    expect(materials.ck_candy02_water).toBe('antigrav');
    expect(materials.ef_gravityboard).toBe('antigrav');
    expect(materials.ef_glideboard).toBe('glide');
    expect(materials.ck_chocosuger03).toBe('offroad');
  });

  it('builds its collision from the full course model with materials.ts, so the pack needs no rebuild (round 2)', () => {
    expect(canyon.collisionFromModel).toBe(materials);
    expect(collisionSourcePath(canyon)).toBe('models/courses/sweet-sweet-canyon/course.glb');
    // The other courses keep their collision.bin.
    const stadium = mk8Course('mario-kart-stadium');
    expect(stadium && collisionSourcePath(stadium)).toBe(
      'models/courses/mario-kart-stadium/collision.bin',
    );
    // The roads MK-93's guesses got wrong: under the soda, and the "…Blight" ones they dropped.
    expect(materials.ck_spongeMulti01_Water).toBe('road');
    expect(materials.ck_spongeMulti01_Blight).toBe('road');
    expect(materials.ef_juicenear).toBe('ignore');
    // What's ground is drawn solid; the soda and the walls aren't touched.
    const ground = groundMaterials(canyon);
    expect(ground.has('ck_spongeMulti01_Blight')).toBe(true);
    expect(ground.has('ck_candy01')).toBe(true);
    expect(ground.has('ef_juicenear')).toBe(false);
    expect(ground.has('ck_cookiewall01')).toBe(false);
  });
});

describe.skipIf(!hasPack)('Sweet Sweet Canyon on the real pack (local only)', () => {
  beforeAll(async () => {
    if (tracks.has(canyon.trackId)) return;
    await modelCollisionReady;
    const bytes = readFileSync(COLLISION);
    registerCourse(
      canyon,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
  });

  it('has drivable ground under every metre of the centreline (the glide and the step excepted)', () => {
    expect(centrelineGaps(canyon.trackId)).toEqual([]);
  });

  for (const cc of [100, 150, 200] as EngineClass[])
    it(`at ${cc}cc the glide ramp launches a glide that lands on the giant cake`, () => {
      const track = getTrack(canyon.trackId);
      if (track.kind !== 'mesh') throw new Error('not a mesh track');
      // The course as registered: 3× the pack's size (MK-105 revisit), its route with it.
      const raced = routeGeometry(track.route);
      const at = (t: number) => t * raced.length;
      const glide = track.route.zones.find((z) => z.kind === 'glide');
      if (glide?.kind !== 'glide' || glide.landing === undefined)
        throw new Error('no glide landing');
      const frame = raced.frameAt(glide.from - (30 * MK8_COURSE_SCALE) / raced.length);
      let state: SimState = createSimState({
        seed: 1,
        trackId: canyon.trackId,
        engineClass: cc,
        itemsOn: false,
        karts: [
          {
            position: frame.position,
            heading: headingOf(frame.tangent, 0),
            up: frame.up,
            speed: 20,
          },
        ],
      });
      const events: SimEvent[] = [];
      const stuck = { stuckTime: 0, recoverTime: 0 };
      for (let i = 0; i < 60 * 12 * MK8_COURSE_SCALE; i += 1) {
        const kart = state.karts[0]!;
        const r = step(state, [meshAutopilotInput(kart, track, cc, 1, stuck)]);
        state = r.state;
        events.push(...r.events);
        if (events.some((e) => e.type === 'glideClose')) break;
      }
      const kart = state.karts[0]!;
      expect(events.filter((e) => e.type === 'glideOpen')).toHaveLength(1);
      expect(events.some((e) => e.type === 'respawn')).toBe(false);
      expect(kart.grounded).toBe(true);
      // Down on the deck or the spiral's first bend, not in the lake.
      const landed = at(kart.lastSafeT);
      expect(landed).toBeGreaterThan(at(glide.landing) - 5 * MK8_COURSE_SCALE);
      expect(landed).toBeLessThan(at(glide.landing) + 45 * MK8_COURSE_SCALE);
    });

  it('a 150cc race: the player on the autopilot and 7 AI finish 3 laps, nobody stuck', () => {
    const r = courseRace(canyon.trackId, 1);
    expect(r.unfinished).toEqual([]);
    expect(r.playerLaps).toBe(3);
    expect(r.respawns[0]).toBe(0);
    expect(r.worstStuck).toBeLessThan(5);
  });
});
