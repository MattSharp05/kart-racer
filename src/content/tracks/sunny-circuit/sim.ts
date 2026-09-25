import { computeRacingLine } from '../../../sim/ai/racingLine';
import { TrackGeometry, type SplinePoint, type SplineTrackDef } from '../../../sim/splineTrack';
import type { TrackContent } from '..';

/** Default road width, m. */
const W = 16;
/** Centre and radius of the U-turn whose grass infield is the shortcut. */
const U_CENTRE = { x: 75, z: -40 };
const U_RADIUS = 35;
/** Grass infield of the U that karts may cut across (inside the road's inner verge). */
const INFIELD_RADIUS = U_RADIUS - W / 2 - 1;

const p = (x: number, z: number, y = 0, width = W): SplinePoint => ({ x, y, z, width });

/** Left-hand U-turn: heading west at the top, round the west side, heading east at the bottom. */
function uTurn(): SplinePoint[] {
  const points: SplinePoint[] = [];
  for (let i = 1; i < 12; i += 1) {
    const phi = (i / 12) * Math.PI;
    points.push(p(U_CENTRE.x - U_RADIUS * Math.sin(phi), U_CENTRE.z - U_RADIUS * Math.cos(phi)));
  }
  return points;
}

/**
 * Sunny Circuit — the MVP track (PRD → Content; MK-10). Driving order, starting on the main straight
 * heading north (−Z): fast right sweeper → hill crest → tight right hairpin → S-bends → big left U-turn
 * around a grass infield (the shortcut) → jump on the return straight → long right sweeper home.
 */
const points: SplinePoint[] = [
  // Main straight (start/finish at the first point).
  p(0, 100),
  p(0, 60),
  p(0, 20),
  p(0, -20),
  p(0, -60),
  p(0, -100),
  p(0, -130),
  // Turn 1: fast right sweeper.
  p(6, -160),
  p(26, -183),
  p(58, -195),
  // Hill crest.
  p(95, -198, 1.5),
  p(135, -196, 5),
  p(175, -190, 5),
  p(210, -178, 1.5),
  // Hairpin (right, east → west through south), a little narrower.
  p(240, -160, 0, 15),
  p(258, -135, 0, 15),
  p(258, -105, 0, 15),
  p(240, -88, 0, 15),
  // S-bends heading west.
  p(212, -92),
  p(190, -78),
  p(165, -92),
  p(140, -78),
  p(115, -75),
  p(95, -75),
  // U-turn around the infield.
  p(U_CENTRE.x, U_CENTRE.z - U_RADIUS),
  ...uTurn(),
  p(U_CENTRE.x, U_CENTRE.z + U_RADIUS),
  // Return straight with the jump: ramp up to a sharp lip, then flat landing.
  p(92, -5),
  p(104, -5),
  p(116, -5, 3),
  p(117.5, -5, 0),
  p(130, -5),
  p(150, -5),
  p(172, -5),
  // Final sweeper: right turn south, then a long right curve back west and north onto the straight.
  p(198, 12),
  p(208, 42),
  p(198, 78),
  p(170, 108),
  p(125, 128),
  p(70, 138),
  p(28, 134),
  p(6, 120),
];

const base: SplineTrackDef = {
  id: 'sunny-circuit',
  name: 'Sunny Circuit',
  kind: 'spline',
  points,
  offroadWidth: 7,
  wallGaps: [],
  surfaceZones: [],
  checkpoints: [0],
};

/** Positions below are authored in world space and converted to lap fractions once. */
const geometry = new TrackGeometry(base);
const tAt = (x: number, z: number) => geometry.project({ x, y: 0, z }).t;

/** Lap fractions where the U-turn starts and ends (its inner wall is removed so the infield opens up). */
const uStart = tAt(U_CENTRE.x + 12, U_CENTRE.z - U_RADIUS);
const uEnd = tAt(U_CENTRE.x + 12, U_CENTRE.z + U_RADIUS);

/** Boost pad strip across the middle of the road, `length` m long, centred at (x, z). */
function boostPad(x: number, z: number, length = 8) {
  const t = tAt(x, z);
  const half = length / 2 / geometry.length;
  return { from: t - half, to: t + half, lateralMin: -3, lateralMax: 3, type: 'boostPad' as const };
}

/** 8 grid slots behind the line, 2 per row, staggered. */
function gridSlots() {
  const slots: { t: number; lateral: number }[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (const [lateral, back] of [
      [-3.5, 8],
      [3.5, 12],
    ] as const) {
      const s = geometry.length - (back + row * 9);
      slots.push({ t: s / geometry.length, lateral });
    }
  }
  return slots;
}

export const sunnyCircuit: SplineTrackDef = {
  ...base,
  wallGaps: [{ from: uStart, to: uEnd, side: 'left' }],
  surfaceZones: [boostPad(0, -40), boostPad(130, -196), boostPad(150, -5)],
  checkpoints: [0, tAt(58, -195), tAt(240, -88), tAt(150, -5), tAt(125, 128)],
  shortcuts: [
    {
      y: 0,
      polygon: Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return {
          x: U_CENTRE.x + INFIELD_RADIUS * Math.cos(a),
          z: U_CENTRE.z + INFIELD_RADIUS * Math.sin(a),
        };
      }),
    },
  ],
  // The ramp ends at its top (the lip); crossing it launches the kart.
  ramps: [{ from: tAt(104, -5), to: tAt(116, -5) }],
  gridSlots: gridSlots(),
  aiLine: computeRacingLine(geometry),
  itemBoxRows: [
    { t: tAt(0, -80), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(200, -84), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(198, 78), laterals: [-4.5, -1.5, 1.5, 4.5] },
  ],
};

/** Centre and radius of the shortcut infield, for tests and scenarios. */
export const SUNNY_INFIELD = { ...U_CENTRE, radius: INFIELD_RADIUS };

export default {
  id: sunnyCircuit.id,
  name: 'Sunny Circuit',
  order: 10,
  def: sunnyCircuit,
} satisfies TrackContent;
