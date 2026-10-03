// Glides carried to a landing (MK-123): a glide ramp whose route zone names a `landing` carries the
// flight to it, so a long glide up to higher ground (Sweet Sweet Canyon's, from the wafer tunnel
// to the giant cake) lands there at every engine class, whatever the pitch.
import { beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../content/tracks';
import { glideAim } from './glide';
import { collisionFromTriangles, MESH_SURFACES, type MeshSurface } from './meshCollision';
import type { MeshTrackDef } from './meshTrack';
import { routeGeometry, type RouteDef, type RoutePoint } from './route';
import { createSimState } from './state';
import { step } from './step';
import { tuning, type EngineClass } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type KartState, type SimEvent } from './types';

/**
 * A synthetic course along +X: a run-up, a glide ramp (x 90–100, rising 1.5 m), a 115 m gap over a
 * void floor, then a landing deck 10 m above the ramp's lip (x 215–330). The route closes through
 * the air far to the side, where nobody drives.
 */
const GAP = { rampFrom: 90, rampTo: 100, rise: 1.5, deckFrom: 215, deckTo: 330, deckY: 11.5 };
const HALF_WIDTH = 7;
const AIMED_ID = 'mk8-test-glide-aim';
const PLAIN_ID = 'mk8-test-glide-aim-plain';
/** Heading along +X (heading 0 faces −Z). */
const ALONG_X = -Math.PI / 2;

function gapCollision(): MeshTrackDef['collision'] {
  const positions: number[] = [];
  const surfaces: number[] = [];
  const quad = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    surface: MeshSurface,
    w = HALF_WIDTH,
  ) => {
    const code = MESH_SURFACES.indexOf(surface);
    // Two triangles facing up (counter-clockwise seen from above with +Z towards the viewer).
    positions.push(x0, y0, w, x1, y1, w, x1, y1, -w, x0, y0, w, x1, y1, -w, x0, y0, -w);
    surfaces.push(code, code);
  };
  for (let x = -40; x < GAP.rampFrom; x += 10) quad(x, 0, x + 10, 0, 'road');
  quad(GAP.rampFrom, 0, GAP.rampTo, GAP.rise, 'glide');
  for (let x = GAP.deckFrom; x < GAP.deckTo; x += 15) quad(x, GAP.deckY, x + 15, GAP.deckY, 'road');
  quad(GAP.rampTo, -30, GAP.deckFrom, -30, 'void', 40);
  return collisionFromTriangles(new Float32Array(positions), new Uint8Array(surfaces), 4);
}

const point = (x: number, y: number, z = 0): RoutePoint => ({ x, y, z, width: 2 * HALF_WIDTH });

function gapRoute(): RouteDef {
  const points = [
    point(-30, 0),
    point(30, 0),
    point(GAP.rampTo, GAP.rise),
    point(155, 7),
    point(GAP.deckFrom, GAP.deckY),
    point(270, GAP.deckY),
    point(320, GAP.deckY),
    point(380, 20, 150),
    point(-90, 20, 150),
  ];
  return {
    points,
    checkpoints: [0],
    respawnPoints: [],
    gridSlots: [],
    itemBoxRows: [],
    coinLines: [],
    zones: [],
  };
}

/** Lap fraction of the point on the run-up (x < the ramp's end) or the deck at `x`. */
function tAt(x: number): number {
  const y = x < GAP.rampTo ? 0 : GAP.deckY;
  return routeGeometry(gapRoute()).project({ x, y, z: 0 }).t;
}

beforeAll(() => {
  for (const [id, landing] of [
    [AIMED_ID, true],
    [PLAIN_ID, false],
  ] as const) {
    if (tracks.has(id)) continue;
    const def: MeshTrackDef = { id, kind: 'mesh', collision: gapCollision(), route: gapRoute() };
    def.route.zones = [
      {
        kind: 'glide',
        from: tAt(GAP.rampFrom),
        to: tAt(GAP.rampTo + 1),
        ...(landing ? { landing: tAt(GAP.deckFrom + 8) } : {}),
      },
    ];
    def.route.respawnPoints = [
      { from: tAt(GAP.rampTo), to: tAt(GAP.deckFrom), t: tAt(GAP.deckFrom + 8) },
    ];
    tracks.register({ id, name: id, order: 1002, def, testOnly: true });
  }
});

interface Glide {
  kart: KartState;
  events: SimEvent[];
  opened: boolean;
}

/** A kart at top speed from x = 40 at `engineClass`, `air` input once it's off the ground. */
function glide(trackId: string, engineClass: EngineClass, air: Partial<InputFrame>): Glide {
  let state = createSimState({
    seed: 1,
    trackId,
    engineClass,
    itemsOn: false,
    karts: [{ position: { x: 40, y: 0, z: 0 }, heading: ALONG_X }],
  });
  (state.karts[0] as KartState).velocity = { x: tuning.topSpeed[engineClass], y: 0, z: 0 };
  const events: SimEvent[] = [];
  let launched = false;
  for (let i = 0; i < 900; i += 1) {
    const k = state.karts[0] as KartState;
    if (!k.grounded) launched = true;
    const frame = launched && !k.grounded ? air : { throttle: 1 };
    const r = step(state, [{ ...NEUTRAL_INPUT, ...frame }]);
    state = r.state;
    events.push(...r.events);
    const after = state.karts[0] as KartState;
    if (launched && after.grounded && after.position.x > GAP.rampTo + 5) break;
    if (r.events.some((e) => e.type === 'respawn')) break;
  }
  return {
    kart: state.karts[0] as KartState,
    events,
    opened: events.some((e) => e.type === 'glideOpen'),
  };
}

const PITCHES: [string, Partial<InputFrame>][] = [
  ['diving (throttle held)', { throttle: 1 }],
  ['level', {}],
  ['floating (brake)', { brake: 1 }],
];

describe('a glide ramp with a landing (MK-123)', () => {
  for (const cc of [100, 150, 200] as const)
    for (const [name, air] of PITCHES)
      it(`carries a ${cc}cc kart ${name} across the gap onto the higher deck`, () => {
        const g = glide(AIMED_ID, cc, air);
        expect(g.opened).toBe(true);
        expect(g.events.some((e) => e.type === 'respawn')).toBe(false);
        expect(g.kart.grounded).toBe(true);
        expect(g.kart.position.x).toBeGreaterThan(GAP.deckFrom);
        expect(g.kart.position.x).toBeLessThan(GAP.deckTo);
        expect(g.kart.position.y).toBeCloseTo(GAP.deckY, 0);
        expect(g.kart.glide).toBeUndefined();
      });

  it('without a landing the same glide falls short of the deck (the gap is real)', () => {
    const g = glide(PLAIN_ID, 200, {});
    expect(g.opened).toBe(true);
    expect(g.events.some((e) => e.type === 'respawn')).toBe(true);
  });

  it('aims above the route at the landing, only inside a glide zone that names one', () => {
    const aimed = tracks.get(AIMED_ID).def as MeshTrackDef;
    const plain = tracks.get(PLAIN_ID).def as MeshTrackDef;
    const onRamp = createSimState({
      seed: 1,
      trackId: AIMED_ID,
      karts: [{ position: { x: GAP.rampTo - 1, y: GAP.rise, z: 0 }, heading: ALONG_X }],
    }).karts[0] as KartState;
    const aim = glideAim(aimed.route, onRamp);
    expect(aim?.x).toBeCloseTo(GAP.deckFrom + 8, 0);
    expect(aim?.y).toBeCloseTo(GAP.deckY + tuning.mk8.glideAim.clearance, 0);
    expect(glideAim(plain.route, onRamp)).toBeUndefined();
    const before = { ...onRamp, position: { x: 20, y: 0, z: 0 } };
    expect(glideAim(aimed.route, before)).toBeUndefined();
  });
});
