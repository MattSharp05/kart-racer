// Mario Kart Stadium (MK-105). The route checks run everywhere; the drive checks need the real pack
// (`$MK8_OUT`, default `.mk8-out/`; never in CI, ADR 0009) and are skipped without it.
// `pnpm mk8:course-check` runs the full 5-seed pass.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../../../../content/tracks';
import { routeGeometry } from '../../../../sim/route';
import { validateRoute } from '../../../../sim/routeValidation';
import { MK8_CUPS } from '../../cups';
import { collisionPath, mk8Course, registerCourse } from '..';
import { centrelineGaps, courseRace } from '../courseCheck';
import stadium from '.';
import { materials } from './materials';

const PACK = resolve(process.env.MK8_OUT ?? '.mk8-out');
const COLLISION = resolve(PACK, collisionPath(stadium.packId));
const hasPack = existsSync(COLLISION);

describe('Mario Kart Stadium: route and data (MK-105)', () => {
  it('is the Mushroom Cup’s first course, by its pack id and track id', () => {
    const course = MK8_CUPS.find((c) => c.id === 'mushroom')?.courses[0];
    expect(course).toMatchObject({ pack: stadium.packId, trackId: stadium.trackId });
    expect(mk8Course('mario-kart-stadium')).toBe(stadium);
    expect(stadium.trackId).toBe('mk8-stadium');
    expect(stadium.name).toBe('Mario Kart Stadium');
  });

  it('has a valid route: closed, gates in order, 8 grid slots, items and coins on the lap', () => {
    expect(validateRoute(stadium.route)).toEqual([]);
    expect(stadium.route.gridSlots).toHaveLength(8);
    expect(stadium.route.itemBoxRows.length).toBeGreaterThanOrEqual(3);
    expect(stadium.route.coinLines.length).toBeGreaterThanOrEqual(5);
  });

  it('marks the anti-gravity section (the bridge’s gravity panel to the U’s glide board)', () => {
    const zones = stadium.route.zones;
    const antigrav = zones.find((z) => z.kind === 'antigrav');
    const glide = zones.find((z) => z.kind === 'glide');
    expect(antigrav).toBeDefined();
    expect(glide).toBeDefined();
    const length = routeGeometry(stadium.route).length;
    if (antigrav?.kind !== 'antigrav' || glide?.kind !== 'glide') return;
    // Roughly 140 m of the lap, ending at the glide board.
    expect((antigrav.to - antigrav.from) * length).toBeGreaterThan(140);
    expect(glide.from).toBeLessThan(antigrav.to);
    expect(glide.to).toBeGreaterThan(antigrav.to);
  });

  it('a lap is about 470 m', () => {
    const length = routeGeometry(stadium.route).length;
    expect(length).toBeGreaterThan(450);
    expect(length).toBeLessThan(490);
  });

  it('maps the gravity materials to anti-gravity and the dash panels to boost', () => {
    expect(materials.fc_road_G).toBe('antigrav');
    expect(materials.ef_gravityboard).toBe('antigrav');
    expect(materials.ef_dashboard).toBe('boost');
    expect(materials.ef_glideboard).toBe('glide');
    expect(materials.fc_StaticShadow).toBe('ignore');
  });
});

describe.skipIf(!hasPack)('Mario Kart Stadium on the real pack (local only)', () => {
  beforeAll(() => {
    if (tracks.has(stadium.trackId)) return;
    const bytes = readFileSync(COLLISION);
    registerCourse(
      stadium,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
  });

  it('has drivable ground under every metre of the centreline (the jump excepted)', () => {
    expect(centrelineGaps(stadium.trackId)).toEqual([]);
  });

  it('a 150cc race: the player on the autopilot and 7 AI finish 3 laps, nobody stuck', () => {
    const r = courseRace(stadium.trackId, 1);
    expect(r.unfinished).toEqual([]);
    expect(r.playerLaps).toBe(3);
    expect(r.respawns[0]).toBe(0);
    expect(r.worstStuck).toBeLessThan(5);
  });
});
