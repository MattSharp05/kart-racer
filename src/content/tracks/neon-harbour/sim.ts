import { computeRacingLine } from '../../../sim/ai/racingLine';
import type { MoverHazard } from '../../../sim/hazards/types';
import type { Vec3 } from '../../../sim/math';
import { TrackGeometry, type SplinePoint, type SplineTrackDef } from '../../../sim/splineTrack';
import type { TrackContent } from '..';
import type { TrackTheme } from '../theme';

/** Default road width, m. */
const W = 16;
/** The zig-zag through the container stacks is a little narrower. */
const ZIG_W = 14;
/** Bridge deck height over the canal, m. */
const BRIDGE_Y = 4;
/** The final right U-turn (south → north through the south) round the warehouse. */
const UTURN = { x: 40, z: 190, radius: 40 };
/** The city block: a straight 2-lane street heading west at `z`, from `east` to `west` (world x). */
const CITY = { z: 112, east: 212, west: 110 };
type Corner = { x: number; z: number };
/**
 * The warehouse shortcut: a corridor straight through the warehouse across the U-turn, from its
 * south-going leg (x = 80) to its north-going leg (x = 0), `z0..z1` long. The mouths flare north,
 * towards where a kart turns in (heading south) and out (turning north).
 */
const WAREHOUSE = { x0: 18, x1: 62, z0: 140, z1: 204, cutZ0: 170, cutZ1: 192, flare: 18 };
const CUT_FLOOR: readonly Corner[] = [
  { x: 76, z: WAREHOUSE.cutZ0 - WAREHOUSE.flare },
  { x: 76, z: WAREHOUSE.cutZ1 },
  { x: 4, z: WAREHOUSE.cutZ1 },
  { x: 4, z: WAREHOUSE.cutZ0 - WAREHOUSE.flare },
  { x: WAREHOUSE.x0, z: WAREHOUSE.cutZ0 },
  { x: WAREHOUSE.x1, z: WAREHOUSE.cutZ0 },
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
 * Neon Harbour (MK-60): a harbour city at night. Driving order, starting on the quay heading north
 * (−Z): the dockside straight (harbour water on the left) → right onto the zig-zag through the
 * container stacks → right onto the bridge over the canal → right into the city block, a 2-lane
 * street with oncoming traffic → left, south → the U-turn round the warehouse (the shortcut goes
 * straight through it) → home up the quay.
 */
const points: SplinePoint[] = [
  // Dockside straight (start/finish at the first point).
  p(0, 60),
  p(0, 20),
  p(0, -20),
  p(0, -60),
  // Turn 1: right, into the container yard.
  p(6, -90),
  p(24, -110),
  p(52, -120),
  // The zig-zag through the container stacks.
  p(84, -117),
  p(112, -128, 0, ZIG_W),
  p(140, -110, 0, ZIG_W),
  p(168, -128, 0, ZIG_W),
  p(196, -112, 0, ZIG_W),
  p(222, -118),
  // Turn 2: right, onto the bridge.
  p(248, -108),
  p(262, -86),
  // The bridge over the canal.
  p(266, -58, 1.5),
  p(266, -30, BRIDGE_Y),
  p(266, 0, BRIDGE_Y),
  p(266, 28, 1.5),
  p(266, 55),
  // Turn 3: right, into town.
  p(260, 85),
  p(240, 104),
  p(CITY.east, CITY.z),
  // The city block: 2 lanes, oncoming traffic.
  p(185, CITY.z),
  p(160, CITY.z),
  p(135, CITY.z),
  p(CITY.west, CITY.z),
  // Turn 4: left, south towards the warehouse.
  p(90, 118),
  p(80, 138),
  p(80, 165),
  p(UTURN.x + UTURN.radius, UTURN.z),
  // The U-turn round the warehouse.
  ...arc(UTURN, 0, Math.PI, 10),
  p(UTURN.x - UTURN.radius, UTURN.z),
  // Up the quay to the line.
  p(0, 150),
  p(0, 105),
];

const base: SplineTrackDef = {
  id: 'neon-harbour',
  name: 'Neon Harbour',
  kind: 'spline',
  points,
  offroadWidth: 5,
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

/** The inner wall opens along a leg of the U-turn (world x `x`) between `z0` and `z1`. */
const warehouseGap = (x: number, z0: number, z1: number) => {
  const a = tAt(x, z0);
  const b = tAt(x, z1);
  return { from: Math.min(a, b), to: Math.max(a, b), side: 'right' as const };
};

/** Traffic: speed (m/s), how many vehicles per lane, and how deep they drive under the street, m. */
export const TRAFFIC = { speed: 9, perLane: 2, depth: 3.5, ramp: 6 };
/** The two lanes (lateral offset from the street's centreline: its z is `CITY.z − lateral`). */
export const TRAFFIC_LANES = [-4, 4] as const;
/** Where traffic comes up out of the street (west) and goes back under it (east), world x. */
const TRAFFIC_X = { rise: 118, sink: 205 };

/** Vehicle sizes: collider radius, m. */
const CAR = { radius: 1.5 };
const TRUCK = { radius: 1.9 };

/**
 * One lane's closed loop: out of the street at its west end, east along the lane (towards the
 * racers: oncoming), back under the street at its east end, and west again underground, out of
 * sight and out of reach (deeper than `tuning.hazards.clearance`).
 */
function laneLoop(lateral: number): Vec3[] {
  // Heading west, a kart's right is north (−Z): lateral +4 is z − 4.
  const z = CITY.z - lateral;
  const { depth, ramp } = TRAFFIC;
  return [
    { x: TRAFFIC_X.rise - ramp, y: -depth, z },
    { x: TRAFFIC_X.rise, y: 0, z },
    { x: TRAFFIC_X.sink, y: 0, z },
    { x: TRAFFIC_X.sink + ramp, y: -depth, z },
  ];
}

function loopLength(path: Vec3[]): number {
  return path.reduce((sum, a, i) => {
    const b = path[(i + 1) % path.length] ?? a;
    return sum + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }, 0);
}

/**
 * The traffic: 2 vehicles per lane, evenly spaced round the lane's loop, all at the same speed.
 * The second lane runs half a spacing behind the first, so beside every vehicle the other lane is
 * clear for half a spacing either way: there is always a gap.
 */
function traffic(): MoverHazard[] {
  const vehicles: { lane: number; slot: number; body: number; truck?: boolean }[] = [
    { lane: 0, slot: 0, body: 0xe63946 },
    { lane: 0, slot: 1, body: 0xf1c40f, truck: true },
    { lane: 1, slot: 0, body: 0x2a9df4, truck: true },
    { lane: 1, slot: 1, body: 0x9b5de5 },
  ];
  return vehicles.map(({ lane, slot, body, truck }) => {
    const path = laneLoop(TRAFFIC_LANES[lane] ?? 0);
    const period = loopLength(path) / TRAFFIC.speed;
    const phase = (slot + lane / 2) / TRAFFIC.perLane;
    return {
      kind: 'mover',
      path,
      period,
      radius: truck ? TRUCK.radius : CAR.radius,
      phase,
      vehicle: truck ? { body, truck } : { body },
    };
  });
}

/** Night traffic in the city block (4 vehicles, 2 per lane). */
export const TRAFFIC_MOVERS: MoverHazard[] = traffic();

export const neonHarbour: SplineTrackDef = {
  ...base,
  wallGaps: [
    warehouseGap(
      UTURN.x + UTURN.radius,
      WAREHOUSE.cutZ0 - WAREHOUSE.flare - 2,
      WAREHOUSE.cutZ1 + 2,
    ),
    warehouseGap(
      UTURN.x - UTURN.radius,
      WAREHOUSE.cutZ0 - WAREHOUSE.flare - 2,
      WAREHOUSE.cutZ1 + 2,
    ),
  ],
  // No checkpoint in the U-turn: the warehouse skips it.
  checkpoints: [0, tAt(84, -117), tAt(266, -30), tAt(160, CITY.z), tAt(82, 132)],
  // The warehouse floor (crates and pallets: it only pays with a boost).
  shortcuts: [{ y: 0, polygon: [...CUT_FLOOR] }],
  gridSlots: gridSlots(),
  aiLine: computeRacingLine(geometry),
  itemBoxRows: [
    { t: tAt(0, -20), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(222, -118), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(266, 40), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(80, 144), laterals: [-4.5, -1.5, 1.5, 4.5] },
  ],
  hazards: TRAFFIC_MOVERS,
};

/** Where features are, for tests, scenarios and the view (world space). */
export const NEON_HARBOUR = {
  uturn: UTURN,
  city: CITY,
  trafficX: TRAFFIC_X,
  warehouse: WAREHOUSE,
  cutFloor: CUT_FLOOR,
  bridgeY: BRIDGE_Y,
  /** The canal under the bridge runs east–west between these z. */
  canal: { z0: -26, z1: -4 },
  tAt,
};

/**
 * A harbour city at night: dark blue sky, neon, wet streets. Bright enough to read on a phone:
 * the fill light stays strong and the glowing bits carry the mood.
 */
const theme: TrackTheme = {
  sky: { top: 0x070b24, middle: 0x16204f, horizon: 0x3b2f6b },
  fog: { colour: 0x1b1f45, near: 90, far: 420 },
  light: { sky: 0x8fa2ff, ground: 0x2b2440, fillIntensity: 1.1, sun: 0xc8d4ff, sunIntensity: 0.7 },
  palette: {
    road: 0x33384a,
    verge: 0x4a4f63,
    terrain: 0x262a3a,
    infield: 0x3a3548,
    wallA: 0xff3d8b,
    wallB: 0x2ee6f0,
  },
  // Registered by `render.ts`, which also draws the harbour's own scenery instead.
  scenery: 'harbour',
  night: true,
};

export default {
  id: neonHarbour.id,
  name: 'Neon Harbour',
  order: 40,
  def: neonHarbour,
  theme,
} satisfies TrackContent;
