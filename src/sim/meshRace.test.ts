// Racing on a mesh track (MK-105): the grid, item boxes, laps and positions, AI that gets round,
// on the synthetic `mk8-test-ramp` (no pack needed); and the glide-zone launch and the fall onto
// ground below the road, on a small course built here.
import { beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../content/tracks';
import { centrelineGaps, courseRace } from '../mk8/content/courses/courseCheck';
import { TEST_RAMP_ID } from '../mk8/content/courses/test-ramp';
import { registerTestRamp } from '../mk8/content/courses/test-ramp/register';
import { collisionFromTriangles, MESH_SURFACES, type MeshTrackDef } from './meshTrack';
import { createRace } from './race/createRace';
import type { RouteDef } from './route';
import { createSimState } from './state';
import { step } from './step';
import { tuning } from './tuning';
import { NEUTRAL_INPUT, type SimEvent, type SimState } from './types';

beforeAll(registerTestRamp);

describe('mesh track races (test ramp)', () => {
  it('puts 8 karts on the route grid with the road’s up, and item boxes on the route rows', () => {
    const state = createRace({
      trackId: TEST_RAMP_ID,
      seed: 1,
      engineClass: 150,
      itemsOn: true,
      racers: Array.from({ length: 8 }, (_, i) => ({
        kartId: 'maple' as const,
        controller: i === 0 ? ('local' as const) : ('ai' as const),
      })),
    });
    expect(state.karts).toHaveLength(8);
    for (const kart of state.karts) expect(kart.up?.y).toBeCloseTo(1, 6);
    expect(state.entities.filter((e) => e.kind === 'itemBox')).toHaveLength(8);
  });

  it('a player on the autopilot and 7 AI finish 3 laps; nobody stuck', () => {
    const r = courseRace(TEST_RAMP_ID, 3);
    expect(r.unfinished).toEqual([]);
    expect(r.playerLaps).toBe(3);
    expect(r.raceTimes.every((t) => t !== undefined)).toBe(true);
    expect(r.worstStuck).toBeLessThan(5);
  });

  it('has ground under every metre of its centreline (outside its respawn ranges)', () => {
    expect(centrelineGaps(TEST_RAMP_ID)).toEqual([]);
  });
});

/**
 * A 12 m road along +X from x = 0 to 50, a gap, the road again from x = 75 at y = −4, and a floor
 * at y = −12 under the gap. The route runs along the road (closing back round far away).
 */
function jumpCourse(id: string, glide: boolean): MeshTrackDef {
  const tris: number[] = [];
  const surfaces: number[] = [];
  const quad = (x0: number, x1: number, y: number, z0: number, z1: number) => {
    tris.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    surfaces.push(0, 0);
  };
  quad(-20, 50, 0, -6, 6);
  quad(75, 300, -4, -6, 6);
  quad(50, 75, -12, -30, 30);
  const p = (x: number, y: number, z = 0) => ({ x, y, z, width: 12 });
  const route: RouteDef = {
    points: [
      p(0, 0),
      p(25, 0),
      p(50, 0),
      p(62, -2),
      p(75, -4),
      p(150, -4),
      p(250, -4),
      p(150, 400),
    ],
    checkpoints: [0],
    respawnPoints: [],
    gridSlots: [],
    itemBoxRows: [],
    coinLines: [],
    zones: glide ? [{ kind: 'glide', from: 0.07, to: 0.1 }] : [],
  };
  const collision = collisionFromTriangles(
    new Float32Array(tris),
    new Uint8Array(surfaces.map(() => MESH_SURFACES.indexOf('road'))),
    4,
  );
  return { id, kind: 'mesh', collision, route };
}

function drive(
  id: string,
  speed: number,
  ticks: number,
): { states: SimState[]; events: SimEvent[] } {
  let state = createSimState({
    seed: 1,
    trackId: id,
    engineClass: 150,
    itemsOn: false,
    karts: [
      { position: { x: 30, y: 0, z: 0 }, heading: -Math.PI / 2, up: { x: 0, y: 1, z: 0 }, speed },
    ],
  });
  const states: SimState[] = [];
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const r = step(state, [{ ...NEUTRAL_INPUT, throttle: 1 }]);
    state = r.state;
    states.push(state);
    events.push(...r.events);
  }
  return { states, events };
}

describe('glide zones and falls on mesh tracks (MK-105)', () => {
  beforeAll(() => {
    for (const [id, glide] of [
      ['mk105-jump-glide', true],
      ['mk105-jump-plain', false],
    ] as const) {
      if (!tracks.has(id))
        tracks.register({ id, name: id, order: 2000, def: jumpCourse(id, glide), testOnly: true });
    }
  });

  it('leaving the ground in a glide zone launches the kart level along the road, like a ramp lip', () => {
    const takeoff = (id: string) => {
      const { states } = drive(id, 20, 90);
      const air = states.find((s) => s.karts[0]?.grounded === false)?.karts[0];
      if (!air) throw new Error('never left the ground');
      return air;
    };
    const glide = takeoff('mk105-jump-glide');
    const plain = takeoff('mk105-jump-plain');
    expect(glide.velocity.y).toBeGreaterThan(20 * tuning.rampLaunch * 0.8);
    expect(plain.velocity.y).toBeLessThan(1);
    expect(glide.antigrav).toBe(false);
  });

  it('landing on ground well below the road is a fall: the kart is put back', () => {
    // Too slow to clear the gap: it drops onto the floor 12 m under the road.
    const { events, states } = drive('mk105-jump-plain', 6, 240);
    expect(events.some((e) => e.type === 'respawn')).toBe(true);
    // Well before the 3 s in the air a fall takes otherwise.
    const at = states.findIndex((s) => (s.karts[0]?.respawnTimer ?? 0) > 0);
    expect(at).toBeLessThan(tuning.mk8.fallSeconds * 60);
  });
});

describe('sinking under water on mesh tracks (MK-128)', () => {
  const deep = 'mk128-deep-water';
  beforeAll(() => {
    if (tracks.has(deep)) return;
    const def = jumpCourse(deep, false);
    // A deep pool over the far straight (its floor is the road at y −4).
    const pool = {
      kind: 'water' as const,
      min: { x: 100, y: -10, z: -50 },
      max: { x: 300, y: 300, z: 50 },
    };
    const withPool = { ...def, route: { ...def.route, zones: [pool] } };
    tracks.register({ id: deep, name: deep, order: 2000, def: withPool, testOnly: true });
  });

  /** A kart let go `height` m over the far straight: respawns in the first `seconds` s. */
  const respawns = (id: string, height: number, seconds: number) => {
    let state = createSimState({
      seed: 1,
      trackId: id,
      engineClass: 150,
      itemsOn: false,
      karts: [{ position: { x: 200, y: height, z: 0 }, heading: -Math.PI / 2 }],
    });
    state.karts[0]!.grounded = false;
    for (let i = 0; i < seconds * 60; i += 1) {
      const r = step(state, [NEUTRAL_INPUT]);
      state = r.state;
      if (r.events.some((e) => e.type === 'respawn')) return true;
    }
    return false;
  };

  it('isn’t a fall however long it takes to sink to the floor; in the air it is', () => {
    const seconds = tuning.mk8.fallSeconds + 1;
    expect(respawns(deep, 150, seconds)).toBe(false);
    expect(respawns('mk105-jump-plain', 150, seconds)).toBe(true);
  });
});
