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
 * (−Z): the dockside straight (harbour water on the left) with an S round the bollards → right onto
 * the zig-zag through the container stacks → right onto the bridge over the canal → right into the
 * city block, a 2-lane street with oncoming traffic → the old town (QA round 2): right, north up
 * Market Lane → left, west → left, south → an S → the U-turn round the warehouse (the shortcut
 * goes straight through it) → home up the quay.
 */
const points: SplinePoint[] = [
  // Dockside straight (start/finish at the first point), with an S round the bollards.
  p(0, 60),
  p(0, 22),
  p(12, -6),
  p(6, -36),
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
  // The old town: right, north up Market Lane…
  p(94, 104),
  p(86, 82),
  p(88, 56),
  // …left, west along the canal-side row…
  p(78, 38),
  p(58, 32),
  p(40, 42),
  // …left, south, and an S (left, right) down to the warehouse.
  p(32, 64),
  p(35, 90),
  p(46, 110),
  p(64, 122),
  p(78, 140),
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

/**
 * Traffic: speed (m/s) and how many vehicles per lane. Each pulls out of a depot on a side street
 * off the block's west end, drives its lane, and turns off into a depot on a side street at the
 * east end (MK-60 QA round 2: it used to rise out of the road). `turn` is how far along the lane
 * a vehicle takes to turn onto or off it, m.
 */
export const TRAFFIC = { speed: 9, perLane: 2, turn: 6 };
/** The two lanes (lateral offset from the street's centreline: its z is `CITY.z − lateral`). */
export const TRAFFIC_LANES = [-4, 4] as const;
/** Where traffic joins the street (west, from the north side) and leaves it (east, to the south), world x. */
const TRAFFIC_X = { rise: 132, sink: 200 };
/**
 * The depots at the ends of the side streets: how far from the street's centreline their doors
 * are (just past the walls), how deep inside a vehicle is out of sight, and the doors' width, m.
 */
const DEPOT = { door: W / 2 + 5 + 1, inside: 14, doorWidth: 9 };

/** Vehicles: collider radius, m. */
const CAR = { radius: 1.5 };
const TRUCK = { radius: 1.9 };

/**
 * One lane's path: out of the west depot (north of the street) down its side street, a left turn
 * east onto the lane (towards the racers: oncoming), along the lane, and a right turn off it down
 * the east side street into the east depot (south of the street). It starts and ends inside the
 * depots, out of sight. An open path: in between, the vehicle is gone for as long as driving back
 * round the block would take.
 */
function lanePath(lateral: number): Vec3[] {
  // Heading west, a kart's right is north (−Z): lateral +4 is z − 4.
  const z = CITY.z - lateral;
  const { turn } = TRAFFIC;
  const north = CITY.z - DEPOT.door;
  const south = CITY.z + DEPOT.door;
  return [
    { x: TRAFFIC_X.rise, y: 0, z: north - DEPOT.inside },
    { x: TRAFFIC_X.rise, y: 0, z: north },
    { x: TRAFFIC_X.rise, y: 0, z: z - turn },
    { x: TRAFFIC_X.rise + turn, y: 0, z },
    { x: TRAFFIC_X.sink - turn, y: 0, z },
    { x: TRAFFIC_X.sink, y: 0, z: z + turn },
    { x: TRAFFIC_X.sink, y: 0, z: south },
    { x: TRAFFIC_X.sink, y: 0, z: south + DEPOT.inside },
  ];
}

function pathLength(path: Vec3[]): number {
  return path.slice(1).reduce((sum, b, i) => {
    const a = path[i] ?? b;
    return sum + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }, 0);
}

/**
 * The traffic: 2 vehicles per lane, evenly spaced in time, all at the same speed. The second lane
 * runs half a spacing behind the first, so beside every vehicle the other lane is clear for half a
 * spacing either way: there is always a gap.
 */
function traffic(): MoverHazard[] {
  const vehicles: { lane: number; slot: number; body: number; truck?: boolean }[] = [
    { lane: 0, slot: 0, body: 0xe63946 },
    { lane: 0, slot: 1, body: 0xf1c40f, truck: true },
    { lane: 1, slot: 0, body: 0x2a9df4, truck: true },
    { lane: 1, slot: 1, body: 0x9b5de5 },
  ];
  // Out of sight for as long as driving back round the block would take.
  const hidden = TRAFFIC_X.sink - TRAFFIC_X.rise + 2 * (DEPOT.door + DEPOT.inside);
  return vehicles.map(({ lane, slot, body, truck }) => {
    const path = lanePath(TRAFFIC_LANES[lane] ?? 0);
    const street = pathLength(path);
    return {
      kind: 'mover',
      path,
      period: (street + hidden) / TRAFFIC.speed,
      activeFraction: street / (street + hidden),
      radius: truck ? TRUCK.radius : CAR.radius,
      phase: (slot + lane / 2) / TRAFFIC.perLane,
      vehicle: truck ? { body, truck } : { body },
    };
  });
}

/** Night traffic in the city block (4 vehicles, 2 per lane). */
export const TRAFFIC_MOVERS: MoverHazard[] = traffic();

/** The side streets' openings in the city street's walls: north at the west end, south at the east. */
const depotGap = (x: number, side: 'left' | 'right') => {
  const a = tAt(x - DEPOT.doorWidth / 2, CITY.z);
  const b = tAt(x + DEPOT.doorWidth / 2, CITY.z);
  return { from: Math.min(a, b), to: Math.max(a, b), side };
};

/** A depot's apron and garage floor (world XZ), from the wall line to the back of the garage. */
const depotFloor = (x: number, sign: 1 | -1) => {
  const near = CITY.z + sign * (W / 2 + 5);
  const far = CITY.z + sign * (DEPOT.door + DEPOT.inside + 2);
  const half = DEPOT.doorWidth / 2;
  return [
    { x: x - half, z: near },
    { x: x + half, z: near },
    { x: x + half, z: far },
    { x: x - half, z: far },
  ];
};

export const neonHarbour: SplineTrackDef = {
  ...base,
  wallGaps: [
    // The side streets to the depots (heading west, the right is north).
    depotGap(TRAFFIC_X.rise, 'right'),
    depotGap(TRAFFIC_X.sink, 'left'),
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
  // The warehouse floor (crates and pallets: it only pays with a boost), and the depots' floors.
  shortcuts: [
    { y: 0, polygon: [...CUT_FLOOR] },
    { y: 0, polygon: depotFloor(TRAFFIC_X.rise, -1), surface: 'road' },
    { y: 0, polygon: depotFloor(TRAFFIC_X.sink, 1), surface: 'road' },
  ],
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
  depot: DEPOT,
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
  hazard: 'Night traffic on the docks',
  order: 40,
  def: neonHarbour,
  theme,
} satisfies TrackContent;
