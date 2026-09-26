import { computeRacingLine } from '../../../sim/ai/racingLine';
import type { PeriodicHazard } from '../../../sim/hazards/types';
import type { Vec3 } from '../../../sim/math';
import {
  TrackGeometry,
  type SplinePoint,
  type SplineTrackDef,
  type SurfaceZone,
  type TrackRoute,
} from '../../../sim/splineTrack';
import type { TrackContent } from '..';
import type { TrackTheme } from '../theme';

/** Default road width, m, and the verge either side of it (inside the walls). */
const W = 16;
const VERGE = 3;
/** The factory floor, m. */
const FLOOR_Y = 0;

/** The rotating-gear turntable: the north hairpin, turning right from the start straight. */
const TURNTABLE = { x: 45, z: -40, radius: 45 };
/** The corner off the conveyor straight (left, onto the gauntlet) and the east U-turn. */
const C1 = { x: 130, z: 75, radius: 38 };
const EAST = { x: 250, z: 163, radius: 50 };
/** The corner home (right, onto the start straight). */
const HOME = { x: 38, z: 175, radius: 38 };

/** The conveyor straight (world x, heading south) and the stretch of it the belts cover (z). */
const CONVEYOR = { x: 90, z0: -22, z1: 55 };
/** The crusher gauntlet (heading east along z): the three pistons' x. */
const GAUNTLET_Z = C1.z + C1.radius;
const PISTON_X = [175, 203, 231] as const;
/** The furnace detour and the catwalk straight across it (world z of the back straight). */
const BACK_Z = EAST.z + EAST.radius;
const CATWALK = { x0: 212, x1: 72, halfWidth: 4 };

const p = (x: number, z: number, y = FLOOR_Y, width = W): SplinePoint => ({ x, y, z, width });

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
 * Cog Works (MK-62): a giant clockwork factory. Driving order, starting heading north (−Z) up the
 * start straight: the turntable hairpin (right, round a giant turning gear) → the conveyor straight
 * south (belts forward in the left lane, backward in the right) → left onto the crusher gauntlet,
 * east under 3 pistons → the east U-turn → west along the back → the furnace detour (the road loops
 * south round the furnace; the catwalk goes straight across it) → right, home.
 */
const points: SplinePoint[] = [
  // The start straight (start/finish at the first point).
  p(0, 135),
  p(0, 90),
  p(0, 45),
  p(0, 0),
  p(0, TURNTABLE.z),
  // The turntable hairpin.
  ...arc(TURNTABLE, Math.PI, 2 * Math.PI, 8),
  p(TURNTABLE.x + TURNTABLE.radius, TURNTABLE.z),
  // The conveyor straight.
  p(CONVEYOR.x, -5),
  p(CONVEYOR.x, 35),
  p(CONVEYOR.x, C1.z),
  // Left onto the gauntlet.
  ...arc(C1, Math.PI, Math.PI / 2, 4),
  p(C1.x, GAUNTLET_Z),
  // The crusher gauntlet.
  p(160, GAUNTLET_Z),
  p(190, GAUNTLET_Z),
  p(220, GAUNTLET_Z),
  p(EAST.x, GAUNTLET_Z),
  // The east U-turn.
  ...arc(EAST, -Math.PI / 2, Math.PI / 2, 6),
  p(EAST.x, BACK_Z),
  // West along the back, then the detour south round the furnace.
  p(CATWALK.x0 + 12, BACK_Z),
  p(CATWALK.x0 - 6, BACK_Z + 4),
  p(190, BACK_Z + 22),
  p(172, BACK_Z + 50),
  p(142, BACK_Z + 60),
  p(112, BACK_Z + 50),
  p(94, BACK_Z + 22),
  p(CATWALK.x1 + 6, BACK_Z + 4),
  p(CATWALK.x1 - 12, BACK_Z),
  // Home.
  p(HOME.x, BACK_Z),
  ...arc(HOME, Math.PI / 2, Math.PI, 3),
  p(HOME.x - HOME.radius, HOME.z),
];

const base: SplineTrackDef = {
  id: 'cog-works',
  name: 'Cog Works',
  kind: 'spline',
  points,
  offroadWidth: VERGE,
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

/**
 * The belts: heading south, the left lane (east side) runs forward, the right lane backward. Their
 * speed is `tuning.surfaces.conveyorSpeed`.
 */
const belt = (flowAngle: number, lateralMin: number, lateralMax: number): SurfaceZone => ({
  from: tAt(CONVEYOR.x, CONVEYOR.z0),
  to: tAt(CONVEYOR.x, CONVEYOR.z1),
  lateralMin,
  lateralMax,
  type: 'conveyor',
  flowAngle,
});
export const BELTS = { forward: belt(0, -W / 2, 0), backward: belt(Math.PI, 0, W / 2) };

/** Crusher rhythm: seconds per cycle, and the share of it each piston stays down. */
export const CRUSHER = { period: 3, closedFraction: 0.3 };

/**
 * The 3 pistons, as wide as the road and its verges. Each drops a third of a cycle after the one
 * before it, about the time a kart at speed takes between them: time the first and ride the wave.
 */
export const PISTONS: PeriodicHazard[] = PISTON_X.map((x, i) => ({
  kind: 'periodic',
  centre: { x, y: FLOOR_Y, z: GAUNTLET_Z },
  halfWidth: W / 2 + VERGE,
  halfLength: 3,
  // Along the road: the gauntlet heads east.
  heading: -Math.PI / 2,
  period: CRUSHER.period,
  closedFraction: CRUSHER.closedFraction,
  phase: (1 - i / 3) % 1,
  piston: true,
}));

/** The catwalk across the furnace: flared where it leaves and rejoins the road, narrow between. */
const CATWALK_FLOOR: readonly { x: number; z: number }[] = [
  { x: CATWALK.x0 + 4, z: BACK_Z - 6 },
  { x: CATWALK.x0 - 14, z: BACK_Z - CATWALK.halfWidth },
  { x: CATWALK.x1 + 14, z: BACK_Z - CATWALK.halfWidth },
  { x: CATWALK.x1 - 4, z: BACK_Z - 6 },
  { x: CATWALK.x1 - 4, z: BACK_Z + 8 },
  { x: CATWALK.x1 + 14, z: BACK_Z + CATWALK.halfWidth },
  { x: CATWALK.x0 - 14, z: BACK_Z + CATWALK.halfWidth },
  { x: CATWALK.x0 + 4, z: BACK_Z + 8 },
];

/** Where the catwalk goes: off the back straight, straight across, back onto the road. */
const CATWALK_PATH: Vec3[] = [
  { x: CATWALK.x0 + 12, y: FLOOR_Y, z: BACK_Z },
  { x: CATWALK.x1 - 12, y: FLOOR_Y, z: BACK_Z },
];

export const CATWALK_ROUTE: TrackRoute = { path: CATWALK_PATH, halfWidth: 10, aiChance: 0.35 };

/** The detour's stretch of the lap (the catwalk stands in for it). */
const DETOUR = { from: tAt(CATWALK.x0 + 12, BACK_Z), to: tAt(CATWALK.x1 - 12, BACK_Z) };

/** The AI line, with the conveyor straight in the forward (left) lane, blended in and out. */
function aiLine(): number[] {
  const line = computeRacingLine(geometry);
  const n = line.length;
  const from = BELTS.forward.from * n;
  const to = BELTS.forward.to * n;
  const blend = 6;
  const lane = -W / 4;
  return line.map((offset, i) => {
    const inside = Math.min(i - (from - blend), to + blend - i) / blend;
    const f = Math.max(0, Math.min(1, inside));
    return Math.round((offset + (lane - offset) * f) * 100) / 100;
  });
}

export const cogWorks: SplineTrackDef = {
  ...base,
  // Into and out of the catwalk, on the right of the detour's ends.
  wallGaps: [
    { from: tAt(CATWALK.x0 + 6, BACK_Z), to: tAt(CATWALK.x0 - 12, BACK_Z + 8), side: 'right' },
    { from: tAt(CATWALK.x1 + 12, BACK_Z + 8), to: tAt(CATWALK.x1 - 6, BACK_Z), side: 'right' },
  ],
  surfaceZones: [BELTS.forward, BELTS.backward],
  // None on the detour: `routes` carries progress over the catwalk.
  checkpoints: [
    0,
    tAt(TURNTABLE.x, TURNTABLE.z - TURNTABLE.radius),
    tAt(CONVEYOR.x, 20),
    tAt(EAST.x + EAST.radius, EAST.z),
    tAt(HOME.x - HOME.radius, HOME.z),
  ],
  shortcuts: [{ y: FLOOR_Y, polygon: [...CATWALK_FLOOR], surface: 'road' }],
  routes: [CATWALK_ROUTE],
  // A fall off the catwalk puts you back where it leaves the road.
  respawnPoints: [{ ...DETOUR, t: DETOUR.from }],
  gridSlots: gridSlots(),
  aiLine: aiLine(),
  itemBoxRows: [
    { t: tAt(0, 50), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(CONVEYOR.x, -30), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(CONVEYOR.x, C1.z - 8), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(EAST.x - 10, BACK_Z), laterals: [-4.5, -1.5, 1.5, 4.5] },
  ],
  hazards: PISTONS,
};

/** Where features are, for tests, scenarios and the view (world space). */
export const COG_WORKS = {
  turntable: TURNTABLE,
  conveyor: CONVEYOR,
  gauntletZ: GAUNTLET_Z,
  pistonX: PISTON_X,
  backZ: BACK_Z,
  catwalk: CATWALK,
  catwalkFloor: CATWALK_FLOOR,
  catwalkPath: CATWALK_PATH,
  detour: DETOUR,
  east: EAST,
  home: HOME,
  c1: C1,
  floorY: FLOOR_Y,
  roadWidth: W,
  /** Lap length, m. */
  length: geometry.length,
  tAt,
};

/** Inside the factory: a smoky amber haze, warm lamps, brass and iron. */
const theme: TrackTheme = {
  sky: { top: 0x1c120c, middle: 0x4a2c16, horizon: 0x9a5a24 },
  fog: { colour: 0x6b4221, near: 60, far: 330 },
  light: { sky: 0xffd9a0, ground: 0x4a2a14, fillIntensity: 1.25, sun: 0xffc47a, sunIntensity: 1.3 },
  palette: {
    road: 0x5a5550,
    verge: 0x7a5a3a,
    terrain: 0x3a2a1e,
    infield: 0x4a3a2c,
    wallA: 0xc8962e,
    wallB: 0x5e5a56,
  },
  // Registered by `render.ts`, which also draws the factory's own scenery instead.
  scenery: 'factory',
};

export default {
  id: cogWorks.id,
  name: 'Cog Works',
  order: 60,
  def: cogWorks,
  theme,
} satisfies TrackContent;
