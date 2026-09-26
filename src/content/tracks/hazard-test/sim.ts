import { TrackGeometry, type SplinePoint, type SplineTrackDef } from '../../../sim/splineTrack';
import type { TrackContent } from '..';
import type { TrackTheme } from '../theme';

const STRAIGHT_HALF = 75;
const RADIUS = 45;
const WIDTH = 16;
const STEP = 10;

/**
 * Hazard test track (MK-49): a flat oval with one of each hazard kind and surface, the worked
 * example for the track tickets. Anticlockwise from above, starting at (45, 0, 75) heading −Z.
 * Start straight: oncoming traffic (mover) in the start lane, then a crusher. First bend: a
 * sandstorm. Back straight: ice, sand and a conveyor belt pushing to the right. Last bend: a
 * spinning bar.
 */
function points(): SplinePoint[] {
  const out: SplinePoint[] = [];
  const add = (x: number, z: number) => out.push({ x, y: 0, z, width: WIDTH });
  for (let z = STRAIGHT_HALF; z > -STRAIGHT_HALF; z -= STEP) add(RADIUS, z);
  for (let a = 0; a < Math.PI; a += Math.PI / 12) {
    add(RADIUS * Math.cos(a), -STRAIGHT_HALF - RADIUS * Math.sin(a));
  }
  for (let z = -STRAIGHT_HALF; z < STRAIGHT_HALF; z += STEP) add(-RADIUS, z);
  for (let a = Math.PI; a < 2 * Math.PI; a += Math.PI / 12) {
    add(RADIUS * Math.cos(a), STRAIGHT_HALF - RADIUS * Math.sin(a));
  }
  return out;
}

const base: SplineTrackDef = {
  id: 'hazard-test',
  name: 'Hazard Test',
  kind: 'spline',
  points: points(),
  offroadWidth: 6,
  wallGaps: [],
  surfaceZones: [],
  checkpoints: [0, 0.25, 0.5, 0.75],
};

/** Hazards and zones are placed in world space and converted to lap fractions once. */
const geometry = new TrackGeometry(base);
const tAt = (x: number, z: number) => geometry.project({ x, y: 0, z }).t;
const half = WIDTH / 2;

/** A full-width surface zone on the back straight (x = −45) between `z0` and `z1`. */
function zone(z0: number, z1: number, type: 'ice' | 'sand' | 'conveyor', flowAngle?: number) {
  return {
    from: tAt(-RADIUS, z0),
    to: tAt(-RADIUS, z1),
    lateralMin: -half,
    lateralMax: half,
    type,
    ...(flowAngle === undefined ? {} : { flowAngle }),
  };
}

/** Where each feature is, for tests and scenarios (lap fractions). */
export const HAZARD_TEST = {
  /** The traffic kart drives the start lane between these two points. */
  moverFrom: { x: RADIUS, y: 0, z: 10 },
  moverTo: { x: RADIUS, y: 0, z: -40 },
  crusher: { x: RADIUS, y: 0, z: -58 },
  sandstorm: { x: 0, y: 0, z: -STRAIGHT_HALF - RADIUS },
  ice: { from: -55, to: -35 },
  sand: { from: -20, to: 0 },
  conveyor: { from: 15, to: 35 },
  spinner: { x: 0, y: 0, z: STRAIGHT_HALF + RADIUS },
  tAt,
};

export const hazardTest: SplineTrackDef = {
  ...base,
  surfaceZones: [
    zone(HAZARD_TEST.ice.from, HAZARD_TEST.ice.to, 'ice'),
    zone(HAZARD_TEST.sand.from, HAZARD_TEST.sand.to, 'sand'),
    zone(HAZARD_TEST.conveyor.from, HAZARD_TEST.conveyor.to, 'conveyor', Math.PI / 2),
  ],
  hazards: [
    {
      kind: 'mover',
      path: [HAZARD_TEST.moverFrom, HAZARD_TEST.moverTo],
      period: 8,
      radius: 1.5,
    },
    {
      kind: 'periodic',
      centre: HAZARD_TEST.crusher,
      halfWidth: 3,
      halfLength: 2.5,
      heading: 0,
      period: 4,
      closedFraction: 0.3,
    },
    {
      kind: 'zoneEffect',
      centre: HAZARD_TEST.sandstorm,
      radius: 30,
      period: 10,
      activeFraction: 0.5,
      grip: 0.5,
      visibility: 40,
    },
    { kind: 'rotator', centre: HAZARD_TEST.spinner, armLength: 7, armWidth: 1, period: 5 },
  ],
};

/** Dusk in the desert: shows a theme different from Sunny Circuit's. */
const theme: TrackTheme = {
  sky: { top: 0x3a2a6a, middle: 0xf08a4b, horizon: 0xffd29a },
  fog: { colour: 0xf2b27a, near: 80, far: 400 },
  light: { sky: 0xffe0b0, ground: 0x7a5a3a, fillIntensity: 1.0, sun: 0xffc080, sunIntensity: 1.3 },
  palette: {
    road: 0x7a6a5a,
    verge: 0xd9b77a,
    terrain: 0xc9a064,
    infield: 0xb08850,
    wallA: 0x8ecae6,
    wallB: 0x219ebc,
  },
  scenery: 'desert',
};

export default {
  id: hazardTest.id,
  name: 'Hazard Test',
  order: 920,
  def: hazardTest,
  testOnly: true,
  theme,
} satisfies TrackContent;
