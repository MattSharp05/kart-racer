// MK-92 synthetic anti-gravity test course. The real Mario Kart Stadium mesh isn't available to
// this spike, so this generates a stand-in course in code and writes it as OBJ text — the same
// format the real course arrives in — so it goes through the same OBJ → collision path:
//
//   A  straight (+X) whose middle is an anti-gravity barrel roll: the road twists a full turn
//      around the straight's axis (up the wall, along the ceiling, down the other wall)
//   B  flat 180° turn                 C  straight back (−X) with two dash panels
//   D  180° anti-gravity turn banked up to 80° (a wall ride), back onto A
//
// Every section has 5 m verges and guard rails; around it are decoration meshes (trees, a crowd
// stand, a sky dome) whose material names say they're scenery, as a real course's would.
import { add, addScaled, cross, normalize, scale, type V3 } from './vec';

export const SYNTHETIC_COURSE_ID = 'antigrav-test';

export const COURSE = {
  /** Straight A's length and its barrel roll: starts at `twistStart`, `twistLength` long. */
  straight: 260,
  twistStart: 30,
  twistLength: 200,
  /** Barrel-roll radius (road centre to the roll's axis). */
  twistRadius: 12,
  /** Anti-gravity panels on straight A run over [agStart, agEnd]. */
  agStart: 15,
  agEnd: 245,
  turnRadius: 45,
  /** Peak bank of turn D, radians (80°). */
  bankMax: (80 * Math.PI) / 180,
  roadHalfWidth: 7,
  verge: 5,
  wallHeight: 1.2,
  /** Dash panels on straight C: distance from its start, length, half width. */
  dashes: [60, 160] as readonly number[],
  dashLength: 4,
  dashHalfWidth: 2,
  /** Dash panels sit this far above the road so the ray finds them first. */
  dashLift: 0.02,
  /** Road strips across (×detail) and samples per metre along (×detail). */
  roadStrips: 6,
  vergeStrips: 1,
  samplesPerMetre: 1,
} as const;

export interface CourseSample {
  /** Road centre. */
  c: V3;
  /** Unit tangent (driving direction), road up and right (`t × u`). */
  t: V3;
  u: V3;
  r: V3;
  antigrav: boolean;
  /** Section letter, for debugging and tests. */
  section: 'A' | 'B' | 'C' | 'D';
}

export interface SyntheticCourse {
  obj: string;
  samples: CourseSample[];
  /** Start position (road centre) and heading vector. */
  start: { position: V3; forward: V3; up: V3 };
  /** Raw triangles per material, as written. */
  triangles: Record<string, number>;
}

const Y: V3 = [0, 1, 0];
const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Centreline samples, one every `1 / (samplesPerMetre × detail)` metres, the loop not closed. */
export function courseSamples(detail = 1): CourseSample[] {
  const k = COURSE;
  const step = 1 / (k.samplesPerMetre * detail);
  const out: CourseSample[] = [];
  const push = (c: V3, t: V3, u: V3, antigrav: boolean, section: CourseSample['section']) => {
    const tn = normalize(t);
    out.push({ c, t: tn, u, r: normalize(cross(tn, u)), antigrav, section });
  };

  // A: barrel roll around the axis (x, r, 0).
  for (let x = 0; x < k.straight; x += step) {
    const s = (x - k.twistStart) / k.twistLength;
    const theta = 2 * Math.PI * smoothstep(s);
    const dTheta = s > 0 && s < 1 ? (2 * Math.PI * 6 * s * (1 - s)) / k.twistLength : 0;
    const r = k.twistRadius;
    const c: V3 = [x, r - r * Math.cos(theta), -r * Math.sin(theta)];
    const t: V3 = [1, r * Math.sin(theta) * dTheta, -r * Math.cos(theta) * dTheta];
    const u: V3 = [0, Math.cos(theta), Math.sin(theta)];
    push(c, t, u, x >= k.agStart && x <= k.agEnd, 'A');
  }
  // B: flat half circle around (straight, 0, R).
  const R = k.turnRadius;
  const arc = Math.PI * R;
  for (let d = 0; d < arc; d += step) {
    const phi = d / R;
    const c: V3 = [k.straight + R * Math.sin(phi), 0, R - R * Math.cos(phi)];
    push(c, [Math.cos(phi), 0, Math.sin(phi)], Y, false, 'B');
  }
  // C: straight back along −X.
  for (let d = 0; d < k.straight; d += step)
    push([k.straight - d, 0, 2 * R], [-1, 0, 0], Y, false, 'C');
  // D: half circle around (0, 0, R), banked towards its centre; the inner verge edge stays on y = 0.
  const halfWidth = k.roadHalfWidth + k.verge;
  for (let d = 0; d < arc; d += step) {
    const phi = d / R;
    const bank = k.bankMax * Math.sin(phi) ** 2;
    const inward: V3 = [Math.sin(phi), 0, -Math.cos(phi)];
    const u = normalize(addScaled(scale(Y, Math.cos(bank)), inward, Math.sin(bank)));
    const c: V3 = [-R * Math.sin(phi), halfWidth * Math.sin(bank), R + R * Math.cos(phi)];
    push(c, [-Math.cos(phi), 0, -Math.sin(phi)], u, true, 'D');
  }
  return out;
}

/** Writes OBJ text: `v` lines, `usemtl` switches and triangle `f` lines (1-based indices). */
class ObjWriter {
  private readonly lines: string[] = ['# MK-92 synthetic anti-gravity test course', 'o course'];
  private vertexCount = 0;
  private material = '';
  readonly triangles: Record<string, number> = {};

  vertex(p: V3): number {
    // Millimetre precision keeps the text small and the floats identical on every parse.
    this.lines.push(`v ${p.map((n) => +n.toFixed(3)).join(' ')}`);
    return ++this.vertexCount;
  }

  tri(material: string, a: number, b: number, c: number): void {
    if (material !== this.material) {
      this.lines.push(`usemtl ${material}`);
      this.material = material;
    }
    this.lines.push(`f ${a} ${b} ${c}`);
    this.triangles[material] = (this.triangles[material] ?? 0) + 1;
  }

  quad(material: string, a: number, b: number, c: number, d: number): void {
    this.tri(material, a, b, c);
    this.tri(material, a, c, d);
  }

  text(): string {
    return `${this.lines.join('\n')}\n`;
  }
}

interface Column {
  /** Offset along the sample's right vector, and lift along its up. */
  across: number;
  lift: number;
}

/** Material of the strip between two columns, for a sample. */
type StripKind = 'wall' | 'verge' | 'road';

function stripMaterial(kind: StripKind, antigrav: boolean): string {
  if (kind === 'wall') return antigrav ? 'Wall_AntiGrav_Rail' : 'Wall_Guardrail';
  if (kind === 'verge') return antigrav ? 'Grass_Verge_AG' : 'Grass_Offroad';
  return antigrav ? 'Road_AntiGrav_Panel' : 'Road_Asphalt';
}

function crossSection(detail: number): { columns: Column[]; strips: StripKind[] } {
  const k = COURSE;
  const columns: Column[] = [];
  const strips: StripKind[] = [];
  const outer = k.roadHalfWidth + k.verge;
  const add = (across: number, lift: number, kind?: StripKind) => {
    if (kind) strips.push(kind);
    columns.push({ across, lift });
  };
  add(-outer, k.wallHeight);
  add(-outer, 0, 'wall');
  const vergeStrips = k.vergeStrips * detail;
  for (let i = 1; i <= vergeStrips; i++) add(-outer + (k.verge * i) / vergeStrips, 0, 'verge');
  const roadStrips = k.roadStrips * detail;
  for (let i = 1; i <= roadStrips; i++)
    add(-k.roadHalfWidth + (2 * k.roadHalfWidth * i) / roadStrips, 0, 'road');
  for (let i = 1; i <= vergeStrips; i++)
    add(k.roadHalfWidth + (k.verge * i) / vergeStrips, 0, 'verge');
  add(outer, k.wallHeight, 'wall');
  return { columns, strips };
}

const at = (s: CourseSample, col: Column): V3 =>
  add(addScaled(s.c, s.r, col.across), scale(s.u, col.lift));

function writeTrack(w: ObjWriter, samples: CourseSample[], detail: number): void {
  const { columns, strips } = crossSection(detail);
  const rows = samples.map((s) => columns.map((col) => w.vertex(at(s, col))));
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const a = rows[i];
    const b = rows[(i + 1) % rows.length];
    if (!s || !a || !b) continue;
    strips.forEach((kind, j) => {
      const [a0, a1, b0, b1] = [a[j], a[j + 1], b[j], b[j + 1]];
      if (a0 && a1 && b0 && b1) w.quad(stripMaterial(kind, s.antigrav), a0, a1, b1, b0);
    });
  }
}

function writeDashes(w: ObjWriter, samples: CourseSample[], detail: number): void {
  const k = COURSE;
  const perMetre = k.samplesPerMetre * detail;
  const cStart = samples.findIndex((s) => s.section === 'C');
  for (const along of k.dashes) {
    const s0 = samples[cStart + Math.round(along * perMetre)];
    const s1 = samples[cStart + Math.round((along + k.dashLength) * perMetre)];
    if (!s0 || !s1) continue;
    const corner = (s: CourseSample, side: number) =>
      w.vertex(add(addScaled(s.c, s.r, side * k.dashHalfWidth), scale(s.u, k.dashLift)));
    w.quad('Dash_Panel', corner(s0, -1), corner(s0, 1), corner(s1, 1), corner(s1, -1));
  }
}

/** A low-poly tree: trunk prism and leaf cone. */
function writeTree(w: ObjWriter, base: V3, height: number): void {
  const sides = 8;
  const ring = (y: number, radius: number) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (2 * Math.PI * i) / sides;
      return w.vertex([
        base[0] + radius * Math.cos(a),
        base[1] + y,
        base[2] + radius * Math.sin(a),
      ]);
    });
  const trunkLow = ring(0, 0.4);
  const trunkHigh = ring(height * 0.35, 0.4);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    w.quad(
      'Deco_Tree_Trunk',
      trunkLow[i] ?? 0,
      trunkLow[j] ?? 0,
      trunkHigh[j] ?? 0,
      trunkHigh[i] ?? 0,
    );
  }
  const leaves = ring(height * 0.3, height * 0.3);
  const tip = w.vertex([base[0], base[1] + height, base[2]]);
  for (let i = 0; i < sides; i++)
    w.tri('Tree_Leaves', leaves[i] ?? 0, leaves[(i + 1) % sides] ?? 0, tip);
}

/** Stepped crowd stand along straight C, outside its wall. */
function writeStand(w: ObjWriter): void {
  const k = COURSE;
  const z0 = 2 * k.turnRadius + k.roadHalfWidth + k.verge + 4;
  const steps = 12;
  for (let x = 20; x < k.straight - 20; x += 2) {
    for (let i = 0; i < steps; i++) {
      const z = z0 + i * 1.2;
      const y = i * 0.8;
      const p = (dx: number, dy: number, dz: number) => w.vertex([x + dx, y + dy, z + dz]);
      w.quad('Deco_Crowd_Stand', p(0, 0, 0), p(2, 0, 0), p(2, 0.8, 0), p(0, 0.8, 0)); // riser
      w.quad('Deco_Crowd_Stand', p(0, 0.8, 0), p(2, 0.8, 0), p(2, 0.8, 1.2), p(0, 0.8, 1.2)); // tread
    }
  }
}

/** Sky dome (a hemisphere), the biggest single decoration mesh. */
function writeSky(w: ObjWriter): void {
  const centre: V3 = [COURSE.straight / 2, 0, COURSE.turnRadius];
  const radius = 600;
  const around = 32;
  const rings = 12;
  const v = (i: number, j: number) => {
    const lat = (Math.PI / 2) * (j / rings);
    const lon = (2 * Math.PI * i) / around;
    return w.vertex([
      centre[0] + radius * Math.cos(lat) * Math.cos(lon),
      centre[1] + radius * Math.sin(lat),
      centre[2] + radius * Math.cos(lat) * Math.sin(lon),
    ]);
  };
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < around; i++)
      w.quad('Sky_Dome', v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
}

function writeScenery(w: ObjWriter): void {
  const k = COURSE;
  // Trees in rings outside both turns and along straight A's far side (fixed layout).
  for (let i = 0; i < 24; i++) {
    const a = (Math.PI * (i + 0.5)) / 24 - Math.PI / 2;
    const r = k.turnRadius + 30 + (i % 3) * 6;
    writeTree(w, [k.straight + r * Math.cos(a), 0, k.turnRadius + r * Math.sin(a)], 8 + (i % 4));
    writeTree(w, [-r * Math.cos(a), 0, k.turnRadius + r * Math.sin(a)], 8 + ((i + 2) % 4));
  }
  for (let x = 10; x < k.straight; x += 20) writeTree(w, [x, 0, -40 - (x % 3) * 5], 10);
  writeStand(w);
  writeSky(w);
}

/** The whole synthetic course as OBJ text, plus its centreline. `detail` scales tessellation. */
export function syntheticCourse(detail = 1): SyntheticCourse {
  const samples = courseSamples(detail);
  const w = new ObjWriter();
  writeTrack(w, samples, detail);
  writeDashes(w, samples, detail);
  writeScenery(w);
  const first = samples[0];
  if (!first) throw new Error('synthetic course has no samples');
  return {
    obj: w.text(),
    samples,
    start: { position: addScaled(first.c, first.t, 5), forward: first.t, up: first.u },
    triangles: w.triangles,
  };
}
