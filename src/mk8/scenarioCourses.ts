// Courses for MK8 driving scenarios (MK-99). `main.ts` awaits `prepareMk8Scenario` before an `mk8-*`
// scenario is set up, so the course it drives on is registered by then: the synthetic test ramp
// (built in code, no pack needed) always, and for `mk8-stadium-antigrav` Mario Kart Stadium's real
// `collision.bin` from the local pack (ADR 0009: only under `pnpm dev` with a built pack; anywhere
// else that scenario shows "MK8 pack not installed").
import { tracks } from '../content/tracks';
import {
  decodeCollision,
  MESH_SURFACES,
  type CollisionMesh,
  type MeshTrackDef,
  type MeshSurface,
} from '../sim/meshTrack';
import type { RouteDef } from '../sim/route';
import { MK8_STADIUM_DEV_ID, MK8_STADIUM_SCENARIO } from '../scenarios/mk8';
import { registerTestRamp } from './content/courses/test-ramp/register';
import { packLoader } from './index';
import { PackNotInstalledError } from './loader';

/** The pipeline's id for Mario Kart Stadium (`tools/mk8/sources.json`). */
const STADIUM_COURSE = 'mario-kart-stadium';
const collisionPath = (course: string) => `models/courses/${course}/collision.bin`;

/**
 * Gets the course `scenario` drives on ready. Returns the scenario to open: itself, or
 * `mk8-not-installed` when it needs the local pack and there is none.
 */
export async function prepareMk8Scenario(scenario: string, search: string): Promise<string> {
  registerTestRamp();
  if (scenario !== MK8_STADIUM_SCENARIO || tracks.has(MK8_STADIUM_DEV_ID)) return scenario;
  try {
    const loader = packLoader();
    await loader.loadCourse(STADIUM_COURSE);
    const bytes = loader.file(collisionPath(STADIUM_COURSE));
    if (!bytes) throw new PackNotInstalledError();
    const params = new URLSearchParams(search);
    tracks.register({
      id: MK8_STADIUM_DEV_ID,
      name: 'Mario Kart Stadium (collision)',
      order: 1001,
      def: stadiumDev(decodeCollision(bytes), params),
      testOnly: true,
    });
    return scenario;
  } catch (e) {
    if (!(e instanceof PackNotInstalledError)) console.error(e);
    return 'mk8-not-installed';
  }
}

/**
 * Stadium as a drivable dev course. It has no route yet (the track editor makes it), so the route is
 * a short stub at the start: lap progress means nothing, and a fall or R puts you back at the start.
 * The start is `&at=x,y,z` (and `&yaw=` degrees, 0 = −Z) or the road triangle nearest the mesh's
 * centre. Course surfaces are still guessed from material names (MK-93's stubs); if none is
 * anti-gravity, or with `&antigrav=road`, every road triangle counts as anti-gravity so the
 * section can be driven before the material map marks it.
 */
function stadiumDev(collision: CollisionMesh, params: URLSearchParams): MeshTrackDef {
  const antigrav = MESH_SURFACES.indexOf('antigrav');
  const road = MESH_SURFACES.indexOf('road');
  const hasAntigrav = collision.surfaces.includes(antigrav);
  const asRoad = params.get('antigrav') === 'road' || !hasAntigrav;
  const mesh = asRoad
    ? { ...collision, surfaces: collision.surfaces.map((s) => (s === road ? antigrav : s)) }
    : collision;
  const start = parseStart(params) ?? nearestToCentre(mesh, hasAntigrav ? 'antigrav' : 'road');
  return { id: MK8_STADIUM_DEV_ID, kind: 'mesh', collision: mesh, route: stubRoute(start) };
}

interface Start {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

function parseStart(params: URLSearchParams): Start | null {
  const at = params.get('at')?.split(',').map(Number);
  if (!at || at.length !== 3 || at.some((n) => !Number.isFinite(n))) return null;
  const yaw = (Number(params.get('yaw') ?? 0) * Math.PI) / 180;
  return { x: at[0] ?? 0, y: at[1] ?? 0, z: at[2] ?? 0, yaw: Number.isFinite(yaw) ? yaw : 0 };
}

/** The centre of the triangle of `surface` nearest the mesh's centre (seen from above). */
function nearestToCentre(mesh: CollisionMesh, surface: MeshSurface): Start {
  const code = MESH_SURFACES.indexOf(surface);
  const { gridMin, gridDims, cellSize, positions, surfaces } = mesh;
  const cx = gridMin[0] + (gridDims[0] * cellSize) / 2;
  const cz = gridMin[2] + (gridDims[2] * cellSize) / 2;
  let best = 0;
  let bestD = Infinity;
  for (let t = 0; t < surfaces.length; t += 1) {
    if (surfaces[t] !== code) continue;
    const dx = (positions[t * 9] ?? 0) - cx;
    const dz = (positions[t * 9 + 2] ?? 0) - cz;
    if (dx * dx + dz * dz < bestD) {
      bestD = dx * dx + dz * dz;
      best = t;
    }
  }
  const p = (k: number) =>
    ((positions[best * 9 + k] ?? 0) +
      (positions[best * 9 + 3 + k] ?? 0) +
      (positions[best * 9 + 6 + k] ?? 0)) /
    3;
  return { x: p(0), y: p(1), z: p(2), yaw: 0 };
}

/** A 40 m straight from the start along its yaw, closed: enough route for respawns. */
function stubRoute(start: Start): RouteDef {
  const fx = -Math.sin(start.yaw);
  const fz = -Math.cos(start.yaw);
  const point = (d: number, side: number) => ({
    x: start.x + fx * d - fz * side,
    y: start.y,
    z: start.z + fz * d + fx * side,
    width: 12,
  });
  return {
    points: [point(0, 0), point(20, 0), point(40, 0), point(20, 1)],
    checkpoints: [0],
    respawnPoints: [{ from: 0, to: 1, t: 0 }],
    gridSlots: [{ t: 0, lateral: 0 }],
    itemBoxRows: [],
    coinLines: [],
    zones: [],
  };
}
