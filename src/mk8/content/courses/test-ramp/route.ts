// `mk8-test-ramp` route (MK-98): what the track editor will export for a real course, written by
// hand here. Points follow the centreline in `layout.ts`, with its heights.
import type { RouteDef, RoutePoint } from '../../../../sim/route';
import { LAP_LENGTH, LAYOUT, tOnA, tOnC, tOf } from './layout';

const R = LAYOUT.turnRadius;
const W = LAYOUT.roadHalfWidth * 2;
const p = (x: number, y: number, z: number): RoutePoint => ({ x, y, z, width: W });

/** 15° steps round a turn, ends excluded (the straights' points are the ends). */
function turn(cx: number, cz: number, startAngle: number): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (let k = 1; k < 12; k += 1) {
    const a = startAngle + (k * Math.PI) / 12;
    out.push(p(cx + R * Math.sin(a), 0, cz - R * Math.cos(a)));
  }
  return out;
}

const { glide, gap, water, straightFrom, straightTo, bumper } = LAYOUT;

export const testRampRoute: RouteDef = {
  points: [
    // A (the start line is the first point)
    ...[0, 20, 40, 60, 80].map((x) => p(x, 0, 0)),
    p(glide.from, 0, 0),
    p(glide.to, glide.rise, 0),
    p((gap.from + gap.to) / 2, glide.rise / 2, 0),
    ...[gap.to, 140, straightTo].map((x) => p(x, 0, 0)),
    // B
    ...turn(straightTo, R, 0),
    // C
    ...[straightTo, 140, 120, water.to].map((x) => p(x, 0, 2 * R)),
    ...[water.to - water.slope, (water.from + water.to) / 2, water.from + water.slope].map((x) =>
      p(x, -water.depth, 2 * R),
    ),
    ...[water.from, 40, 20, 0, -20, straightFrom].map((x) => p(x, 0, 2 * R)),
    // D
    ...turn(straightFrom, R, Math.PI),
    // E
    ...[straightFrom, -20].map((x) => p(x, 0, 0)),
  ],
  checkpoints: [0, 0.25, 0.5, 0.75],
  // Falling into the gap puts you back before the glide ramp's run-up.
  respawnPoints: [{ from: tOnA(glide.from - 10), to: tOnA(gap.to + 5), t: tOnA(70) }],
  // Two by two behind the start line, on E.
  gridSlots: [0, 1, 2, 3].flatMap((row) =>
    [-3, 3].map((lateral) => ({
      t: tOf(LAP_LENGTH - 4 - row * 6 - (lateral > 0 ? 3 : 0)),
      lateral,
    })),
  ),
  itemBoxRows: [
    { t: tOnA(75), laterals: [-4.5, -1.5, 1.5, 4.5] },
    { t: tOnC(30), laterals: [-4.5, -1.5, 1.5, 4.5] },
  ],
  coinLines: [
    { from: tOnA(18), to: tOnA(26), lateral: 0, count: 5 },
    { from: tOnC(140), to: tOnC(120), lateral: -3, count: 5 },
  ],
  zones: [
    { kind: 'glide', from: tOnA(glide.from), to: tOnA(glide.to) },
    {
      kind: 'water',
      min: { x: water.from, y: -water.depth - 1, z: 2 * R - 11 },
      max: { x: water.to, y: 0, z: 2 * R + 11 },
    },
    {
      kind: 'boostBumper',
      position: { x: bumper.x, y: 0.5, z: bumper.lateral },
      radius: bumper.radius,
    },
  ],
};
