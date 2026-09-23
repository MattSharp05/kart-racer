import * as THREE from 'three';
import type { TrackGeometry, TrackSample } from '../sim/splineTrack';

const ROAD_COLOUR = new THREE.Color(0x6b6f76);
const GRASS_COLOUR = new THREE.Color(0x6cbf52);
const KERB_RED = new THREE.Color(0xd62828);
const KERB_WHITE = new THREE.Color(0xf8f9fa);
const WALL_A = new THREE.Color(0xf4a261);
const WALL_B = new THREE.Color(0xe76f51);
const LINE_DARK = new THREE.Color(0x222222);
const LINE_LIGHT = new THREE.Color(0xffffff);
const TERRAIN_COLOUR = 0x4f9a3d;

const WALL_HEIGHT = 1.2;
const KERB_WIDTH = 0.9;
/** Kerbs only where the track bends at least this much per metre (rad/m). */
const KERB_CURVATURE = 0.01;
const KERB_STRIPE = 2;
const WALL_STRIPE = 6;
/** Small lifts so coplanar layers don't z-fight. */
const LIFT = { grass: 0.0, road: 0.03, kerb: 0.05, line: 0.06 };

/** Accumulates coloured triangles into one geometry (one draw call per material). */
class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly colours: number[] = [];

  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    colour: THREE.Color,
  ) {
    // a-b-c-d counter-clockwise when seen from above/outside.
    for (const v of [a, b, c, a, c, d]) {
      this.positions.push(v.x, v.y, v.z);
      this.colours.push(colour.r, colour.g, colour.b);
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colours, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

function offset(sample: TrackSample, lateral: number, lift: number): THREE.Vector3 {
  return new THREE.Vector3(
    sample.x + sample.nx * lateral,
    sample.y + lift,
    sample.z + sample.nz * lateral,
  );
}

/** Heading change per metre around sample i. */
function curvature(geometry: TrackGeometry, i: number): number {
  const a = geometry.sample(i - 2);
  const b = geometry.sample(i + 2);
  const cross = a.tx * b.tz - a.tz * b.tx;
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, cross)))) / 4;
}

/** Builds road, grass verges, kerbs, walls and the start line for a spline track (ADR 0003). */
export function createSplineTrackMesh(geometry: TrackGeometry): THREE.Group {
  const group = new THREE.Group();
  const ground = new MeshBuilder();
  const walls = new MeshBuilder();
  const n = geometry.samples.length;
  const grassOuter = geometry.def.offroadWidth;

  for (let i = 0; i < n; i += 1) {
    const a = geometry.sample(i);
    const b = geometry.sample(i + 1);
    const half = (s: TrackSample) => s.width / 2;
    const wallA = half(a) + grassOuter;
    const wallB = half(b) + grassOuter;

    // Grass verges (left and right), then road on top.
    ground.quad(
      offset(a, -wallA, LIFT.grass),
      offset(b, -wallB, LIFT.grass),
      offset(b, -half(b), LIFT.grass),
      offset(a, -half(a), LIFT.grass),
      GRASS_COLOUR,
    );
    ground.quad(
      offset(a, half(a), LIFT.grass),
      offset(b, half(b), LIFT.grass),
      offset(b, wallB, LIFT.grass),
      offset(a, wallA, LIFT.grass),
      GRASS_COLOUR,
    );
    ground.quad(
      offset(a, -half(a), LIFT.road),
      offset(b, -half(b), LIFT.road),
      offset(b, half(b), LIFT.road),
      offset(a, half(a), LIFT.road),
      ROAD_COLOUR,
    );

    // Red/white kerbs on bends.
    if (curvature(geometry, i) > KERB_CURVATURE) {
      const colour = Math.floor(a.s / KERB_STRIPE) % 2 === 0 ? KERB_RED : KERB_WHITE;
      for (const side of [-1, 1]) {
        const inner = (s: TrackSample) => side * (half(s) - KERB_WIDTH / 2);
        const outer = (s: TrackSample) => side * (half(s) + KERB_WIDTH / 2);
        const [l0, l1] = side < 0 ? [outer, inner] : [inner, outer];
        ground.quad(
          offset(a, l0(a), LIFT.kerb),
          offset(b, l0(b), LIFT.kerb),
          offset(b, l1(b), LIFT.kerb),
          offset(a, l1(a), LIFT.kerb),
          colour,
        );
      }
    }

    // Walls (skipped at gaps), striped so speed is readable.
    const wallColour = Math.floor(a.s / WALL_STRIPE) % 2 === 0 ? WALL_A : WALL_B;
    const t = a.s / geometry.length;
    for (const side of [-1, 1] as const) {
      if (!geometry.hasWall(t, side === 1 ? 'right' : 'left')) continue;
      const lat = side * wallA;
      const latB = side * wallB;
      const bottomA = offset(a, lat, 0);
      const bottomB = offset(b, latB, 0);
      const topA = offset(a, lat, WALL_HEIGHT);
      const topB = offset(b, latB, WALL_HEIGHT);
      walls.quad(bottomA, bottomB, topB, topA, wallColour);
    }
  }

  // Chequered start/finish line across the road at t = 0.
  const start = geometry.sample(0);
  const next = geometry.sample(2);
  const cells = Math.round(start.width);
  for (let row = 0; row < 2; row += 1) {
    for (let c = 0; c < cells; c += 1) {
      const l0 = -start.width / 2 + (c * start.width) / cells;
      const l1 = l0 + start.width / cells;
      const f0 = row / 2;
      const f1 = (row + 1) / 2;
      const at = (f: number, l: number) =>
        new THREE.Vector3(
          start.x + (next.x - start.x) * f + start.nx * l,
          start.y + LIFT.line,
          start.z + (next.z - start.z) * f + start.nz * l,
        );
      ground.quad(
        at(f0, l0),
        at(f1, l0),
        at(f1, l1),
        at(f0, l1),
        (c + row) % 2 ? LINE_DARK : LINE_LIGHT,
      );
    }
  }

  group.add(
    new THREE.Mesh(
      ground.build(),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    ),
  );
  group.add(
    new THREE.Mesh(
      walls.build(),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    ),
  );

  // Terrain under and around the track so there's no void at the edges.
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x + 400, size.z + 400),
    new THREE.MeshLambertMaterial({ color: TERRAIN_COLOUR }),
  );
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.set(centre.x, bounds.min.y - 0.05, centre.z);
  group.add(terrain);

  return group;
}
