// `mk8-test-ramp` collision mesh, generated in code (MK-98): what `collision.bin` would hold for a
// course, built with the same grid as the pipeline. See `layout.ts` for the course.
import type { Vec3 } from '../../../../sim/math';
import {
  collisionFromTriangles,
  MESH_SURFACES,
  type CollisionMesh,
  type MeshSurface,
} from '../../../../sim/meshTrack';
import { centreAt, heightOnA, heightOnC, LAP_LENGTH, LAYOUT } from './layout';

/** The pipeline's grid cell (`COLLISION_DEFAULTS.cellSize`), m. */
export const TEST_RAMP_CELL_SIZE = 4;

class TriangleList {
  readonly positions: number[] = [];
  readonly surfaces: number[] = [];

  triangle(a: Vec3, b: Vec3, c: Vec3, surface: MeshSurface): void {
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.surfaces.push(MESH_SURFACES.indexOf(surface));
  }

  /** Quad a → b → c → d (two triangles sharing the a–c diagonal). */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, surface: MeshSurface): void {
    this.triangle(a, b, c, surface);
    this.triangle(a, c, d, surface);
  }
}

interface Section {
  centre: Vec3;
  right: Vec3;
  /** Road height here. */
  y: number;
  /** Where along the course (straight A's x, or −1 elsewhere). */
  xA: number;
}

const at = (s: Section, lateral: number, lift = 0): Vec3 => ({
  x: s.centre.x + s.right.x * lateral,
  y: s.y + lift,
  z: s.centre.z + s.right.z * lateral,
});

function sectionAt(s: number): Section {
  const frame = centreAt(s);
  const { x } = frame.position;
  const y = frame.section === 'A' ? heightOnA(x) : frame.section === 'C' ? heightOnC(x) : 0;
  return { centre: frame.position, right: frame.right, y, xA: frame.section === 'A' ? x : -1 };
}

/** One 1 m (or one turn step) slice of road between two sections. */
function slice(out: TriangleList, a: Section, b: Section): void {
  const { laterals, roadHalfWidth, boost, tunnel, glide, gap, wallHeight } = LAYOUT;
  const mid = a.xA >= 0 && b.xA >= 0 ? (a.xA + b.xA) / 2 : -1;
  if (mid > gap.from && mid < gap.to) return;
  const inTunnel = mid > tunnel.from && mid < tunnel.to;
  const outer = laterals.at(-1) ?? 0;
  for (let i = 0; i + 1 < laterals.length; i += 1) {
    const l0 = laterals[i] ?? 0;
    const l1 = laterals[i + 1] ?? 0;
    // In the tunnel the right verge is replaced by the anti-gravity wall at the road edge.
    if (inTunnel && l0 >= roadHalfWidth) continue;
    const centreLat = (l0 + l1) / 2;
    let surface: MeshSurface = Math.abs(centreLat) > roadHalfWidth ? 'offroad' : 'road';
    if (surface === 'road' && mid > glide.from && mid < glide.to) surface = 'glide';
    if (
      surface === 'road' &&
      mid > boost.from &&
      mid < boost.to &&
      Math.abs(centreLat) < boost.halfWidth
    )
      surface = 'boost';
    out.quad(at(a, l0), at(b, l0), at(b, l1), at(a, l1), surface);
  }
  // Walls along both outer edges (the right one is the tunnel's anti-gravity wall in there).
  out.quad(
    at(a, -outer),
    at(b, -outer),
    at(b, -outer, wallHeight),
    at(a, -outer, wallHeight),
    'wall',
  );
  if (inTunnel) {
    out.quad(
      at(a, roadHalfWidth),
      at(b, roadHalfWidth),
      at(b, roadHalfWidth, tunnel.height),
      at(a, roadHalfWidth, tunnel.height),
      'antigrav',
    );
    // The ceiling, from the left wall's line to the anti-gravity wall, in road-width strips.
    for (let i = 0; i + 1 < laterals.length; i += 1) {
      const l0 = laterals[i] ?? 0;
      const l1 = laterals[i + 1] ?? 0;
      if (l0 >= roadHalfWidth) continue;
      out.quad(
        at(a, l0, tunnel.height),
        at(b, l0, tunnel.height),
        at(b, l1, tunnel.height),
        at(a, l1, tunnel.height),
        'antigrav',
      );
    }
  } else {
    // Basin walls reach the water line at least, so nobody drives out sideways underwater.
    const top = (s: Section) => Math.max(wallHeight, -s.y + wallHeight / 2);
    out.quad(at(a, outer), at(b, outer), at(b, outer, top(b)), at(a, outer, top(a)), 'wall');
  }
}

/** Builds the course's triangles and grid. */
export function buildTestRampCollision(): CollisionMesh {
  const out = new TriangleList();
  // Slices: every metre on the straights (whole-metre x), 1 m arcs on the turns.
  const { straightTo, straightFrom, turnRadius } = LAYOUT;
  const turnSteps = Math.round(Math.PI * turnRadius);
  const turn = Math.PI * turnRadius;
  const stops: number[] = [];
  const cLength = straightTo - straightFrom;
  for (let x = 0; x < straightTo; x += 1) stops.push(x);
  for (let k = 0; k < turnSteps; k += 1) stops.push(straightTo + (turn * k) / turnSteps);
  for (let x = 0; x < cLength; x += 1) stops.push(straightTo + turn + x);
  for (let k = 0; k < turnSteps; k += 1)
    stops.push(straightTo + turn + cLength + (turn * k) / turnSteps);
  for (let x = straightFrom; x < 0; x += 1) stops.push(LAP_LENGTH + x);
  stops.push(LAP_LENGTH);
  for (let i = 0; i + 1 < stops.length; i += 1)
    slice(out, sectionAt(stops[i] ?? 0), sectionAt(stops[i + 1] ?? 0));

  // The water's surface over the basin (the road dips below it).
  const { water, gap } = LAYOUT;
  const outer = LAYOUT.laterals.at(-1) ?? 0;
  const zC = 2 * turnRadius;
  out.quad(
    { x: water.to, y: 0, z: zC - outer },
    { x: water.from, y: 0, z: zC - outer },
    { x: water.from, y: 0, z: zC + outer },
    { x: water.to, y: 0, z: zC + outer },
    'water',
  );
  // The void floor under the gap.
  const reach = outer + gap.margin;
  out.quad(
    { x: gap.from - gap.margin, y: gap.voidY, z: -reach },
    { x: gap.to + gap.margin, y: gap.voidY, z: -reach },
    { x: gap.to + gap.margin, y: gap.voidY, z: reach },
    { x: gap.from - gap.margin, y: gap.voidY, z: reach },
    'void',
  );
  return collisionFromTriangles(
    new Float32Array(out.positions),
    new Uint8Array(out.surfaces),
    TEST_RAMP_CELL_SIZE,
  );
}
