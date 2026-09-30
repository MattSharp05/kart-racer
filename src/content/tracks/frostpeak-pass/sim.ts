import { computeRacingLine } from '../../../sim/ai/racingLine';
import type { MoverHazard } from '../../../sim/hazards/types';
import type { Vec3 } from '../../../sim/math';
import { TrackGeometry, type SplinePoint, type SplineTrackDef } from '../../../sim/splineTrack';
import type { TrackContent } from '..';
import type { TrackTheme } from '../theme';

/** Default road width, m. */
const W = 16;
/** The frozen lake is wider. */
const LAKE_W = 24;
/** The snow kickers' lip height, m (MK-59 QA round 2: jumps). */
const KICKER_Y = 2.2;
/**
 * The two snow kickers (world z along a straight going north / south, the lip and where it starts):
 * one in the valley after the start, one on the run down to the lake.
 */
const VALLEY_JUMP = { x: 0, from: 66, lip: 52 };
const LAKE_JUMP = { x: 85, from: 76, lip: 90 };
/** The kicker drops away this far past its lip, m. */
const KICKER_DROP = 1.5;
/** Height of the summit (the hairpin and the tunnel floor), m. */
const SUMMIT_Y = 13;
/** Summit hairpin (right, east → west through the east) at the top of the climb. */
const HAIRPIN = { x: 285, z: -72, radius: 38 };
/** The frozen lake: the final right U-turn (south → north through the south), wide and icy. */
const LAKE = { x: 42.5, z: 140, radius: 42.5 };
type Corner = { x: number; z: number };
/**
 * The tunnel through the summit snowbank, straight across the hairpin from its entry leg to its
 * exit leg. Its floor (world x, z): the mouths flare west, towards where a kart turns in (heading
 * east up the entry leg) and out (heading west down the exit leg); between them it is 16 m wide.
 */
const TUNNEL = { x0: 276, x1: 292, z0: -84, z1: -60, mouth: 262 };
const TUNNEL_FLOOR: readonly Corner[] = [
  { x: TUNNEL.mouth, z: -97 },
  { x: TUNNEL.x1, z: -97 },
  { x: TUNNEL.x1, z: -47 },
  { x: TUNNEL.mouth, z: -47 },
  { x: TUNNEL.x0, z: TUNNEL.z1 },
  { x: TUNNEL.x0, z: TUNNEL.z0 },
];

const p = (x: number, z: number, y = 0, width = W): SplinePoint => ({ x, y, z, width });

/** Points round a circle, angles in radians (0 = +X, π/2 = +Z), both ends excluded. */
function arc(
  centre: { x: number; z: number; radius: number },
  from: number,
  to: number,
  n: number,
  y: number,
  width: number,
) {
  return Array.from({ length: n - 1 }, (_, i) => {
    const a = from + ((to - from) * (i + 1)) / n;
    return p(
      centre.x + centre.radius * Math.cos(a),
      centre.z + centre.radius * Math.sin(a),
      y,
      width,
    );
  });
}

/**
 * Frostpeak Pass (MK-59): a snowy mountain pass. Driving order, starting in the pine valley heading
 * north (−Z): a snow kicker → a left-right S through the pines → right sweeper → the climb east
 * along the mountain's north flank, with a chicane → the summit hairpin (its inside is the snowbank
 * with the tunnel shortcut) → the descent west along the south flank, where snowballs roll down
 * across the road in 5 lanes → left turn south → an S-bend and a second kicker → the wide
 * frozen-lake U-turn home, on ice. (QA round 2 added the S-bends, the chicane, the kickers and two
 * snowball lanes.)
 */
const points: SplinePoint[] = [
  // Valley straight (start/finish at the first point).
  p(0, 100),
  p(0, 80),
  // The valley kicker: up to its lip, then the snow drops away.
  p(VALLEY_JUMP.x, VALLEY_JUMP.from),
  p(VALLEY_JUMP.x, VALLEY_JUMP.lip, KICKER_Y),
  p(VALLEY_JUMP.x, VALLEY_JUMP.lip - KICKER_DROP),
  p(0, 34),
  // The S through the pines: left, then right.
  p(-14, 8),
  p(-26, -18),
  p(-20, -44),
  // Turn 1: right sweeper, starting the climb.
  p(-2, -72, 0.5),
  p(26, -100, 1.5),
  p(62, -114, 3),
  // The climb, with a chicane (left, then right).
  p(100, -118, 5),
  p(128, -132, 6.5),
  p(158, -126, 8.5),
  p(185, -113, 10.5),
  p(205, -111, 11.8),
  p(235, -110, SUMMIT_Y),
  p(HAIRPIN.x, HAIRPIN.z - HAIRPIN.radius, SUMMIT_Y),
  // Summit hairpin.
  ...arc(HAIRPIN, -Math.PI / 2, Math.PI / 2, 8, SUMMIT_Y, W),
  p(HAIRPIN.x, HAIRPIN.z + HAIRPIN.radius, SUMMIT_Y),
  // The descent, with the snowball lanes.
  p(235, -34, SUMMIT_Y),
  p(205, -34, 11.5),
  p(175, -34, 9.5),
  p(145, -34, 7),
  p(115, -36, 4.5),
  // Left turn south, down to the lake, and an S (left, then right).
  p(92, -28, 2.5),
  p(84, -6, 1),
  p(94, 18, 0.3),
  p(106, 40),
  p(98, 60),
  // The lake kicker, then the lake opens out.
  p(LAKE_JUMP.x, LAKE_JUMP.from),
  p(LAKE_JUMP.x, LAKE_JUMP.lip, KICKER_Y),
  p(LAKE_JUMP.x, LAKE_JUMP.lip + KICKER_DROP),
  p(LAKE.x + LAKE.radius, 100, 0, 20),
  p(LAKE.x + LAKE.radius, 110, 0, LAKE_W),
  // The frozen lake U-turn.
  p(LAKE.x + LAKE.radius, LAKE.z, 0, LAKE_W),
  ...arc(LAKE, 0, Math.PI, 10, 0, LAKE_W),
  p(LAKE.x - LAKE.radius, LAKE.z, 0, LAKE_W),
  p(LAKE.x - LAKE.radius, 120, 0, 18),
];

const base: SplineTrackDef = {
  id: 'frostpeak-pass',
  name: 'Frostpeak Pass',
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

/** A tunnel mouth on one leg of the hairpin, x0..x1 (the inner wall opens there). */
const tunnelGap = (z: number, x0: number, x1: number) => {
  const a = tAt(x0, z);
  const b = tAt(x1, z);
  return { from: Math.min(a, b), to: Math.max(a, b), side: 'right' as const };
};

/** Where the descent runs and its snowball lanes cross it (world x of each lane, 5 since QA round 2). */
const DESCENT = { z: -34, lanes: [220, 197, 174, 151, 128] };
/** Ridge between the climb and the descent that the snowballs roll down: its crest, m. */
const RIDGE = { z: -70, height: 9 };
/** How far past the road's far edge a snowball rolls before it drops off the hillside, m. */
const ROLL_ON = 9;

/** Road height at world (x, z). */
const roadY = (x: number, z: number) => geometry.project({ x, y: 0, z }).groundY;

/**
 * One lane's snowball: from the ridge crest, down the slope to the road, across it, off its far
 * edge and down the hillside. On the road it rolls at `SNOWBALL.speed`, and it is on the slope in
 * plain sight for over 2 s before it reaches the road.
 */
function snowball(x: number, phase: number): MoverHazard {
  const y = roadY(x, DESCENT.z);
  const half = W / 2;
  const path: Vec3[] = [
    { x, y: y + RIDGE.height, z: RIDGE.z },
    { x, y, z: DESCENT.z - half - 7 },
    { x, y, z: DESCENT.z + half + ROLL_ON },
    { x, y: 0, z: DESCENT.z + half + ROLL_ON + y * 1.5 + 4 },
  ];
  let length = 0;
  path.slice(1).forEach((b, i) => {
    const a = path[i] ?? b;
    length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  });
  const rolling = length / SNOWBALL.speed;
  return {
    kind: 'mover',
    path,
    period: SNOWBALL.period,
    activeFraction: rolling / SNOWBALL.period,
    radius: SNOWBALL.radius,
    phase,
    rolling: 0xf4f8ff,
  };
}

/** Snowballs: rolling speed (m/s), collider radius (m) and how often each lane gets one (s). */
export const SNOWBALL = { speed: 12, radius: 1.6, period: 10 };

/** The lanes' snowballs, spread evenly over a period (uphill lane first). */
export const SNOWBALLS: MoverHazard[] = DESCENT.lanes.map((x, i, lanes) =>
  snowball(x, -i / lanes.length),
);

/** The frozen lake's ice: the U-turn's middle, all but the outside edge (packed snow, grippy). */
const lakeIce = {
  from: tAt(LAKE.x + LAKE.radius, LAKE.z + 10),
  to: tAt(LAKE.x - LAKE.radius, LAKE.z + 10),
  // Right turn: the outside is the left. Its last 4 m keep their grip.
  lateralMin: -LAKE_W / 2 + 4,
  lateralMax: LAKE_W / 2,
  type: 'ice' as const,
};

export const frostpeakPass: SplineTrackDef = {
  ...base,
  wallGaps: [
    tunnelGap(HAIRPIN.z - HAIRPIN.radius, TUNNEL.mouth - 2, TUNNEL.x1 + 2),
    tunnelGap(HAIRPIN.z + HAIRPIN.radius, TUNNEL.mouth - 2, TUNNEL.x1 + 2),
  ],
  surfaceZones: [lakeIce],
  // No checkpoint in the hairpin: the tunnel skips it.
  checkpoints: [0, tAt(62, -114), tAt(205, -111), tAt(175, -34), tAt(106, 40)],
  // The snow kickers: each ramp ends at its lip, which throws karts into the air.
  ramps: [
    { from: tAt(VALLEY_JUMP.x, VALLEY_JUMP.from), to: tAt(VALLEY_JUMP.x, VALLEY_JUMP.lip) },
    { from: tAt(LAKE_JUMP.x, LAKE_JUMP.from), to: tAt(LAKE_JUMP.x, LAKE_JUMP.lip) },
  ],
  // The tunnel floor, on the summit (deep snow: it only pays with a boost).
  shortcuts: [{ y: SUMMIT_Y, polygon: [...TUNNEL_FLOOR] }],
  gridSlots: gridSlots(),
  aiLine: computeRacingLine(geometry),
  itemBoxRows: [
    { t: tAt(-26, -18), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(100, -118), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(245, -34), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tAt(94, 18), laterals: [-4.5, -1.5, 1.5, 4.5] },
  ],
  hazards: SNOWBALLS,
};

/** Where features are, for tests, scenarios and the view (world space). */
export const FROSTPEAK_PASS = {
  hairpin: HAIRPIN,
  lake: LAKE,
  lakeIce,
  /** The tunnel: its narrow part (x0..x1 wide, z0..z1 long) and the whole floor outline. */
  tunnel: TUNNEL,
  tunnelFloor: TUNNEL_FLOOR,
  summitY: SUMMIT_Y,
  descent: DESCENT,
  ridge: RIDGE,
  jumps: { valley: VALLEY_JUMP, lake: LAKE_JUMP },
  tAt,
};

/** A clear winter morning up a mountain pass: pale blue sky, white haze, snow everywhere. */
const theme: TrackTheme = {
  sky: { top: 0x6fa8dc, middle: 0xbcdcf2, horizon: 0xf2f8ff },
  fog: { colour: 0xe8f0f8, near: 110, far: 480 },
  light: { sky: 0xf4f8ff, ground: 0x9fb4c8, fillIntensity: 1.15, sun: 0xfff4e0, sunIntensity: 1.3 },
  palette: {
    road: 0x6d7580,
    verge: 0xeef3f8,
    terrain: 0xdfe8f0,
    infield: 0xcfdbe8,
    wallA: 0xd64545,
    wallB: 0xf2f2f2,
  },
  // Registered by `render.ts`, which also draws the pass's own scenery instead.
  scenery: 'snow',
};

export default {
  id: frostpeakPass.id,
  name: 'Frostpeak Pass',
  hazard: 'Snowballs and a frozen lake',
  order: 30,
  def: frostpeakPass,
  theme,
} satisfies TrackContent;
