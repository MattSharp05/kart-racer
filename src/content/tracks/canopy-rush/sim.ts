import { computeRacingLine } from '../../../sim/ai/racingLine';
import type { SwayHazard } from '../../../sim/hazards/types';
import type { Vec3 } from '../../../sim/math';
import {
  TrackGeometry,
  type SplinePoint,
  type SplineTrackDef,
  type TrackRoute,
} from '../../../sim/splineTrack';
import type { TrackContent } from '..';
import type { TrackTheme } from '../theme';

/** Default road width, m. */
const W = 16;
/** The rope bridges are narrower (plus the plank edges either side: `offroadWidth`). */
const BRIDGE_W = 10;
/** Heights, m: the jungle floor, the lower canopy (leg B) and the top of the climb (bridge 3). */
const FLOOR_Y = 0;
const CANOPY_Y = 14;
const TOP_Y = 26;
/** The north U-turn: the spiral down round the giant trunk, TOP_Y → CANOPY_Y. */
const TRUNK = { x: 45, z: -227, radius: 45 };
/** The two corners of the jungle floor's south end: the far one (turning west) and home (north). */
const FAR = { x: 150, z: 118, radius: 45 };
const HOME = { x: 35, z: 128, radius: 35 };

const p = (x: number, z: number, y = FLOOR_Y, width = W): SplinePoint => ({ x, y, z, width });

/** Points round a circle, angles in radians (0 = +X, π/2 = +Z), both ends excluded, y from y0 to y1. */
function arc(
  centre: { x: number; z: number; radius: number },
  from: number,
  to: number,
  n: number,
  y0: number,
  y1: number,
) {
  return Array.from({ length: n - 1 }, (_, i) => {
    const f = (i + 1) / n;
    const a = from + (to - from) * f;
    return p(
      centre.x + centre.radius * Math.cos(a),
      centre.z + centre.radius * Math.sin(a),
      y0 + (y1 - y0) * f,
    );
  });
}

/** The 3 rope bridges' decks (straight, world XZ, driving direction from → to). */
const BRIDGES = {
  b1: { from: { x: 90, z: -210 }, to: { x: 90, z: -140 }, y: CANOPY_Y },
  b2: { from: { x: 118, z: -70 }, to: { x: 176, z: -12 }, y: CANOPY_Y },
  b3: { from: { x: 0, z: -148 }, to: { x: 0, z: -213 }, y: TOP_Y },
};
type Bridge = (typeof BRIDGES)[keyof typeof BRIDGES];

/** Control points along a bridge: its ends and every ~20 m between, all at bridge width. */
function bridgePoints(bridge: Bridge): SplinePoint[] {
  const length = Math.hypot(bridge.to.x - bridge.from.x, bridge.to.z - bridge.from.z);
  const n = Math.max(2, Math.round(length / 20));
  return Array.from({ length: n + 1 }, (_, i) =>
    p(
      bridge.from.x + ((bridge.to.x - bridge.from.x) * i) / n,
      bridge.from.z + ((bridge.to.z - bridge.from.z) * i) / n,
      bridge.y,
      BRIDGE_W,
    ),
  );
}

/**
 * Canopy Rush (MK-61): a jungle treetop course. Driving order, starting on the jungle floor heading
 * north (−Z): the waterfall jump → the climb up a giant buttress root → bridge 3 at the top → the
 * spiral down round the giant trunk (north U-turn) → bridge 1 south → the tree platform (where the
 * ruins shortcut drops off its right side) → bridge 2 south-east → the far tree → the root ramp
 * down to the jungle floor (where the ruins rejoin) → the south U-turn home.
 */
const points: SplinePoint[] = [
  // Leg A: the start straight on the jungle floor (start/finish at the first point).
  p(0, 75),
  p(0, 52),
  // The waterfall jump: up to a lip over the stream, then a flat landing.
  p(0, 34),
  p(0, 22, 2.2),
  p(0, 20.5),
  p(0, 4),
  // The climb up the buttress root.
  p(-4, -22, 2),
  p(-9, -52, 8),
  p(-9, -85, 15),
  p(-5, -112, 21),
  p(0, -132, 25),
  // Bridge 3.
  ...bridgePoints(BRIDGES.b3),
  // The spiral down round the giant trunk.
  p(TRUNK.x - TRUNK.radius, TRUNK.z, TOP_Y),
  ...arc(TRUNK, Math.PI, 2 * Math.PI, 8, TOP_Y, CANOPY_Y),
  p(TRUNK.x + TRUNK.radius, TRUNK.z, CANOPY_Y),
  // Leg B: bridge 1.
  ...bridgePoints(BRIDGES.b1),
  // The tree platform: straight on, then left towards bridge 2.
  p(90, -120, CANOPY_Y),
  p(93, -100, CANOPY_Y),
  p(103, -83, CANOPY_Y),
  // Bridge 2, south-east across the gorge.
  ...bridgePoints(BRIDGES.b2),
  // The far tree: right, heading south.
  p(189, 4, CANOPY_Y),
  p(195, 25, CANOPY_Y),
  // The root ramp down to the jungle floor.
  p(196, 48, 11),
  p(196, 72, 5),
  p(195, 95, 0.5),
  // The far corner, west along the floor, and the home corner north onto the start straight.
  p(FAR.x + FAR.radius, FAR.z),
  ...arc(FAR, 0, Math.PI / 2, 4, FLOOR_Y, FLOOR_Y),
  p(FAR.x, FAR.z + FAR.radius),
  p(95, HOME.z + HOME.radius),
  p(HOME.x, HOME.z + HOME.radius),
  ...arc(HOME, Math.PI / 2, Math.PI, 3, FLOOR_Y, FLOOR_Y),
  p(HOME.x - HOME.radius, HOME.z),
  p(0, 100),
];

const base: SplineTrackDef = {
  id: 'canopy-rush',
  name: 'Canopy Rush',
  kind: 'spline',
  points,
  offroadWidth: 3,
  wallGaps: [],
  surfaceZones: [],
  checkpoints: [0],
};

/** Positions below are authored in world space and converted to lap fractions once. */
const geometry = new TrackGeometry(base);
const tAt = (x: number, z: number) => geometry.project({ x, y: 0, z }).t;

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

/** A bridge's stretch of the lap, and the wall gaps (both sides) along it. */
const bridgeRange = (bridge: Bridge) => ({
  from: tAt(bridge.from.x, bridge.from.z),
  to: tAt(bridge.to.x, bridge.to.z),
});

/** Sway: seconds per full swing, and peak push mid-span (m/s²), per bridge. */
export const SWAY = { period: 4, push: 24 };

/** A bridge's swaying deck: road plus plank edges, out of step with the others by `phase`. */
function swayDeck(bridge: Bridge, phase: number): SwayHazard {
  return {
    kind: 'sway',
    from: { x: bridge.from.x, y: bridge.y, z: bridge.from.z },
    to: { x: bridge.to.x, y: bridge.y, z: bridge.to.z },
    halfWidth: BRIDGE_W / 2 + base.offroadWidth,
    period: SWAY.period,
    push: SWAY.push,
    phase,
  };
}

export const SWAY_DECKS: SwayHazard[] = [
  swayDeck(BRIDGES.b1, 0),
  swayDeck(BRIDGES.b2, 1 / 3),
  swayDeck(BRIDGES.b3, 2 / 3),
];

/**
 * The ruins below the bridges: a stone floor on the jungle floor, from a landing plaza under the
 * tree platform's right side, south down the gorge, to where it rejoins the road at the foot of the
 * root ramp. World XZ outline, driving order down its west side and back up its east side.
 */
const RUINS_FLOOR: readonly { x: number; z: number }[] = [
  { x: 79, z: -112 },
  { x: 50, z: -100 },
  { x: 52, z: -60 },
  { x: 66, z: -30 },
  { x: 76, z: 40 },
  { x: 88, z: 100 },
  { x: 86, z: 130 },
  { x: 58, z: 157 },
  { x: 118, z: 157 },
  { x: 114, z: 120 },
  { x: 112, z: 96 },
  { x: 94, z: 35 },
  { x: 84, z: -32 },
  { x: 79, z: -72 },
];

/** Where the ruins shortcut goes (on the platform → the drop → the ruins → back on the road). */
const RUINS_PATH: Vec3[] = [
  { x: 90, y: CANOPY_Y, z: -142 },
  { x: 88, y: CANOPY_Y, z: -122 },
  { x: 80, y: CANOPY_Y, z: -106 },
  { x: 70, y: FLOOR_Y, z: -84 },
  { x: 68, y: FLOOR_Y, z: -55 },
  { x: 75, y: FLOOR_Y, z: -25 },
  { x: 85, y: FLOOR_Y, z: 38 },
  { x: 97, y: FLOOR_Y, z: 90 },
  { x: 100, y: FLOOR_Y, z: 113 },
  { x: 98, y: FLOOR_Y, z: 132 },
  { x: 91, y: FLOOR_Y, z: 147 },
  { x: 80, y: FLOOR_Y, z: 157 },
  { x: 66, y: FLOOR_Y, z: 162 },
  { x: 50, y: FLOOR_Y, z: 163 },
];

export const RUINS_ROUTE: TrackRoute = { path: RUINS_PATH, halfWidth: 14, aiChance: 0.35 };

/** The two openings the ruins need: off the platform's right side, and back onto the road. */
const gap = (x0: number, z0: number, x1: number, z1: number, side: 'left' | 'right') => ({
  from: tAt(x0, z0),
  to: tAt(x1, z1),
  side,
});

export const canopyRush: SplineTrackDef = {
  ...base,
  wallGaps: [
    // The bridges: no walls, a drop either side.
    { ...bridgeRange(BRIDGES.b1), side: 'both' as const },
    { ...bridgeRange(BRIDGES.b2), side: 'both' as const },
    { ...bridgeRange(BRIDGES.b3), side: 'both' as const },
    // The drop into the ruins, off the tree platform's right side.
    gap(90, -118, 89, -104, 'right'),
    // Where the ruins rejoin, on the right of the floor straight.
    gap(122, 163, 54, 163, 'right'),
  ],
  // No checkpoint between the drop and the ruins' end: `routes` carries progress through the ruins.
  checkpoints: [0, tAt(-9, -85), tAt(TRUNK.x, TRUNK.z - TRUNK.radius), tAt(176, -12), tAt(196, 72)],
  shortcuts: [{ y: FLOOR_Y, polygon: [...RUINS_FLOOR], surface: 'road' }],
  routes: [RUINS_ROUTE],
  respawnPoints: [BRIDGES.b1, BRIDGES.b2, BRIDGES.b3].map((bridge) => ({
    ...bridgeRange(bridge),
    t: bridgeRange(bridge).from,
  })),
  gridSlots: gridSlots(),
  aiLine: computeRacingLine(geometry),
  itemBoxRows: [
    { t: tAt(0, 45), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(-9, -65), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(90, -128), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(196, 60), laterals: [-4.5, -1.5, 1.5, 4.5] },
  ],
  hazards: SWAY_DECKS,
};

/** Where features are, for tests, scenarios and the view (world space). */
export const CANOPY_RUSH = {
  bridges: BRIDGES,
  bridgeWidth: BRIDGE_W,
  trunk: TRUNK,
  far: FAR,
  home: HOME,
  ruinsFloor: RUINS_FLOOR,
  ruinsPath: RUINS_PATH,
  floorY: FLOOR_Y,
  canopyY: CANOPY_Y,
  topY: TOP_Y,
  /** The waterfall jump's lip (world z on leg A). */
  jumpZ: 21,
  /** Lap length, m. */
  length: geometry.length,
  tAt,
};

/** Green haze under the canopy: a hazy yellow-green sky, green fog, warm sun through the leaves. */
const theme: TrackTheme = {
  sky: { top: 0x5f9e6e, middle: 0xa9d3a0, horizon: 0xe4f2c8 },
  fog: { colour: 0x9cc79a, near: 70, far: 360 },
  light: { sky: 0xf2ffe0, ground: 0x2f5a2a, fillIntensity: 1.2, sun: 0xfff1c8, sunIntensity: 1.35 },
  palette: {
    road: 0x8a6a48,
    verge: 0xb58a58,
    terrain: 0x2f5d2a,
    infield: 0x3f7a34,
    wallA: 0x6a4a2c,
    wallB: 0x4f8a3a,
  },
  // Registered by `render.ts`, which also draws the canopy's own scenery instead.
  scenery: 'jungle',
};

export default {
  id: canopyRush.id,
  name: 'Canopy Rush',
  order: 50,
  def: canopyRush,
  theme,
} satisfies TrackContent;
