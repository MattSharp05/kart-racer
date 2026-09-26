import { computeRacingLine } from '../../../sim/ai/racingLine';
import type { ZoneEffectHazard } from '../../../sim/hazards/types';
import { TrackGeometry, type SplinePoint, type SplineTrackDef } from '../../../sim/splineTrack';
import type { TrackContent } from '..';
import type { TrackTheme } from '../theme';

/** Default road width, m. */
const W = 16;
/** Plateau hairpin (right, east → west through the south) at the end of the long straight. */
const H1 = { x: 330, z: -80, radius: 32 };
/** Final canyon U-turn (right, south → north through the south); its inside is the slot canyon. */
const U = { x: 45, z: 150, radius: 45 };
type Corner = { x: number; z: number };
/** The slot canyon: a narrow sandy corridor straight across the final U, at this z. */
const SLOT = { z: 140, halfWidth: 7 };
/**
 * Its floor (world x, z), east mouth to west mouth. The mouths flare towards where a kart turns
 * in (north of the entry, as it comes south down the east leg) and out (north again, up the west
 * leg), so it can be taken at speed; between them it narrows to 14 m.
 */
const SLOT_FLOOR: readonly [Corner, Corner, Corner, Corner, Corner, Corner, Corner, Corner] = [
  { x: 83, z: 112 },
  { x: 64, z: SLOT.z - SLOT.halfWidth },
  { x: 26, z: SLOT.z - SLOT.halfWidth },
  { x: 7, z: 120 },
  { x: 7, z: 151 },
  { x: 26, z: SLOT.z + SLOT.halfWidth },
  { x: 64, z: SLOT.z + SLOT.halfWidth },
  { x: 83, z: 151 },
];

const p = (x: number, z: number, y = 0, width = W): SplinePoint => ({ x, y, z, width });

/** Points round a circle, angles in radians (0 = +X, π/2 = +Z), both ends excluded. */
function arc(
  centre: { x: number; z: number; radius: number },
  from: number,
  to: number,
  n: number,
) {
  return Array.from({ length: n - 1 }, (_, i) => {
    const a = from + ((to - from) * (i + 1)) / n;
    return p(centre.x + centre.radius * Math.cos(a), centre.z + centre.radius * Math.sin(a));
  });
}

/**
 * Dune Canyon (MK-58): a desert canyon. Driving order, starting on the canyon floor heading north
 * (−Z): fast right sweeper up onto the plateau → long plateau straight east (sand drifts at the
 * edges; the sandstorm blows here) → tight right hairpin → return straight west with a jump over
 * the dry riverbed → canyon S-bends heading south → the big right U-turn home, whose inside is the
 * slot-canyon shortcut.
 */
const points: SplinePoint[] = [
  // Canyon floor straight (start/finish at the first point).
  p(0, 100),
  p(0, 60),
  p(0, 20),
  p(0, -20),
  p(0, -55),
  // Turn 1: right sweeper, climbing onto the plateau.
  p(6, -85, 1),
  p(26, -108, 2.5),
  p(58, -120, 3.5),
  // Plateau straight.
  p(95, -123, 4),
  p(140, -124, 4),
  p(185, -124, 4),
  p(230, -124, 4),
  p(270, -122, 4),
  p(H1.x - 30, -H1.radius + H1.z - 10, 3),
  // Hairpin H1 (right), a little narrower.
  p(H1.x, H1.z - H1.radius, 2, 15),
  ...arc(H1, -Math.PI / 2, Math.PI / 2, 6).map((q) => ({ ...q, y: 1.5, width: 15 })),
  p(H1.x, H1.z + H1.radius, 1, 15),
  // Return straight west, down off the plateau, with the riverbed jump: ramp up to a sharp lip.
  p(295, -48, 0.5),
  p(270, -48),
  p(252, -48),
  p(240, -48, 3),
  p(238.5, -48, 0),
  p(222, -48),
  p(205, -48),
  p(185, -46),
  // Canyon S-bends, turning south.
  p(160, -36),
  p(145, -15),
  p(150, 12),
  p(138, 40),
  p(U.x + U.radius + 8, 70),
  p(U.x + U.radius, 100),
  // Final U-turn (right): down the east leg, round the south, up the west leg onto the straight.
  p(U.x + U.radius, U.z),
  ...arc(U, 0, Math.PI, 10),
  p(U.x - U.radius, U.z),
  p(U.x - U.radius, 125),
];

const base: SplineTrackDef = {
  id: 'dune-canyon',
  name: 'Dune Canyon',
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

/** A sand drift: a patch across `lateralMin..lateralMax` (m), `length` m long, centred at (x, z). */
function sand(x: number, z: number, length: number, lateralMin: number, lateralMax: number) {
  const t = tAt(x, z);
  const half = length / 2 / geometry.length;
  return { from: t - half, to: t + half, lateralMin, lateralMax, type: 'sand' as const };
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

/** The slot canyon's mouth on one leg of the U, z0..z1 (the inner wall opens there). */
const slotGap = (x: number, z0: number, z1: number) => {
  const a = tAt(x, z0);
  const b = tAt(x, z1);
  return { from: Math.min(a, b), to: Math.max(a, b), side: 'right' as const };
};

/**
 * The sandstorm: 20 s of every 60 on the open plateau, starting 40 s into each minute (so never on
 * the first lap's opening seconds). Grip drops a little and the view closes in.
 */
export const SANDSTORM: ZoneEffectHazard = {
  kind: 'zoneEffect',
  centre: { x: 180, y: 4, z: -115 },
  radius: 115,
  period: 60,
  activeFraction: 1 / 3,
  // `phase` shifts the cycle: on while (t / period + phase) mod 1 < activeFraction.
  phase: 1 / 3,
  grip: 0.75,
  visibility: 45,
  warning: 'SANDSTORM!',
  dust: 0xe8b070,
};

export const duneCanyon: SplineTrackDef = {
  ...base,
  wallGaps: [slotGap(U.x + U.radius, 110, 152), slotGap(U.x - U.radius, 118, 152)],
  surfaceZones: [
    // Turn 1 exit, on the outside.
    sand(40, -116, 22, 2, 8),
    // Plateau: drifts blown in from alternate edges.
    sand(120, -124, 26, -8, -2),
    sand(185, -124, 26, 1, 8),
    sand(250, -123, 24, -8, -1),
    // Inside of the hairpin exit.
    sand(300, -48, 18, 2, 8),
    // S-bends: one across the middle, the racing line must thread it.
    sand(147, 0, 16, -3, 3),
  ],
  checkpoints: [0, tAt(58, -120), tAt(H1.x + H1.radius, H1.z), tAt(205, -48), tAt(138, 40)],
  // The corridor starts on the legs' verges, where the walls open.
  shortcuts: [{ y: 0, polygon: [...SLOT_FLOOR] }],
  // The ramp ends at its lip; the dry riverbed lies just past it.
  ramps: [{ from: tAt(252, -48), to: tAt(240, -48) }],
  gridSlots: gridSlots(),
  aiLine: computeRacingLine(geometry),
  itemBoxRows: [
    { t: tAt(0, -20), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(210, -124), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(270, -48), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(U.x + U.radius, 100), laterals: [-4.5, -1.5, 1.5, 4.5] },
  ],
  hazards: [SANDSTORM],
};

/** Where features are, for tests, scenarios and the view (world space). */
export const DUNE_CANYON = {
  /** The slot canyon: from the east leg (x0) to the west leg (x1) of the U, at z. */
  slot: { x0: U.x + U.radius, x1: U.x - U.radius, z: SLOT.z, halfWidth: SLOT.halfWidth },
  slotFloor: SLOT_FLOOR,
  u: U,
  /** The dry riverbed crosses the return straight here, running north–south. */
  riverbed: { x: 228, z: -48, width: 14 },
  /** A point on the plateau straight, inside the sandstorm. */
  plateau: { x: 185, z: -124 },
  tAt,
};

/** Hot afternoon in a desert canyon: warm sky, orange haze, rust-red rock. */
const theme: TrackTheme = {
  sky: { top: 0x2f7fc4, middle: 0xf2b36a, horizon: 0xffdfa8 },
  fog: { colour: 0xf0b070, near: 120, far: 520 },
  light: { sky: 0xfff0d0, ground: 0x9a5a30, fillIntensity: 1.1, sun: 0xffd8a0, sunIntensity: 1.6 },
  palette: {
    road: 0x8c7462,
    verge: 0xe2b47a,
    terrain: 0xd49a5c,
    infield: 0xc58a50,
    wallA: 0xc8643c,
    wallB: 0x8e3b22,
  },
  scenery: 'canyon',
};

export default {
  id: duneCanyon.id,
  name: 'Dune Canyon',
  order: 20,
  def: duneCanyon,
  theme,
} satisfies TrackContent;
