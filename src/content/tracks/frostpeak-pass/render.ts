import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  clearOfTrack,
  createGrandstand,
  distanceToTrack,
  random,
  scenerySets,
} from '../../../render/scenery';
import type { TrackGeometry } from '../../../sim/splineTrack';
import { DT } from '../../../sim/tuning';
import type { TrackView } from '../render';
import { FROSTPEAK_PASS } from './sim';

const PINE_COUNT = 160;
const DRIFT_COUNT = 70;
const MOUNTAIN_COUNT = 14;

const COLOURS = {
  trunk: 0x6b4a2e,
  pine: 0x2f5d45,
  snow: 0xf4f8ff,
  cliff: 0xc3cfdc,
  rock: 0x7d8794,
  ice: 0xbfe3f5,
};

scenerySets.register({
  id: 'snow',
  trunk: COLOURS.trunk,
  canopy: COLOURS.pine,
  rock: COLOURS.rock,
  hill: COLOURS.snow,
  seats: 0x3a6ea5,
  roof: 0xd64545,
});

const flat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Paints every vertex of `geometry` one colour (for merged, vertex-coloured models). */
function painted(geometry: THREE.BufferGeometry, colour: number): THREE.BufferGeometry {
  const c = new THREE.Color(colour);
  const count = geometry.getAttribute('position').count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) colours.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}

/** One snowy pine: a trunk, three stacked cones and a snow cap, in one vertex-coloured geometry. */
function pineGeometry(): THREE.BufferGeometry {
  const parts = [
    painted(new THREE.CylinderGeometry(0.35, 0.45, 2, 5).translate(0, 1, 0), COLOURS.trunk),
  ];
  for (const [radius, height, y] of [
    [2.6, 3.4, 3],
    [2, 3, 4.8],
    [1.4, 2.6, 6.4],
  ] as const) {
    parts.push(painted(new THREE.ConeGeometry(radius, height, 7).translate(0, y, 0), COLOURS.pine));
  }
  parts.push(painted(new THREE.ConeGeometry(0.8, 1.3, 7).translate(0, 7.4, 0), COLOURS.snow));
  // Merge needs matching attributes: drop the uvs the primitives came with.
  for (const part of parts) part.deleteAttribute('uv');
  const merged = mergeGeometries(parts.map((part) => part.toNonIndexed()));
  if (!merged) throw new Error('Frostpeak pine: geometries do not merge');
  return merged;
}

/** Whether (x, z) is on a feature with its own ground: the ridge, the summit or the lake's ice. */
function reserved(x: number, z: number): boolean {
  const { hairpin, lake } = FROSTPEAK_PASS;
  if (x > RIDGE_X.min && x < hairpin.x + hairpin.radius && z > -118 && z < -30) return true;
  return Math.hypot(x - LAKE_ICE.x, z - LAKE_ICE.z) < lake.radius + LAKE_ICE.beyond;
}

/**
 * Frostpeak Pass's scenery (MK-59): snowy pines and drifts, white-capped peaks on the horizon, the
 * snow embankments under the raised road, the ridge the snowballs roll down, the summit snowbank
 * with its tunnel, the frozen lake, and falling snow. About a dozen draws.
 */
function scenery(geometry: TrackGeometry): THREE.Object3D {
  const group = new THREE.Group();
  const rand = random(geometry.samples.length * 7919);
  const dummy = new THREE.Object3D();
  const bounds = new THREE.Box3();
  for (const s of geometry.samples) bounds.expandByPoint(new THREE.Vector3(s.x, s.y, s.z));

  // Pines scattered over the valley floor, thickest round the track.
  const pines = new THREE.InstancedMesh(
    pineGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    PINE_COUNT,
  );
  let pineCount = 0;
  for (let attempt = 0; attempt < PINE_COUNT * 8 && pineCount < PINE_COUNT; attempt += 1) {
    const x = THREE.MathUtils.lerp(bounds.min.x - 70, bounds.max.x + 70, rand());
    const z = THREE.MathUtils.lerp(bounds.min.z - 70, bounds.max.z + 70, rand());
    if (reserved(x, z) || !clearOfTrack(geometry, x, z)) continue;
    const scale = 0.8 + rand() * 0.7;
    dummy.position.set(x, 0, z);
    dummy.scale.setScalar(scale);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.updateMatrix();
    pines.setMatrixAt(pineCount, dummy.matrix);
    pineCount += 1;
  }
  pines.count = pineCount;
  group.add(pines);

  // Snow drifts: low white mounds just outside the walls on the valley floor.
  const drifts = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    flat(COLOURS.snow),
    DRIFT_COUNT,
  );
  let driftCount = 0;
  for (let attempt = 0; attempt < DRIFT_COUNT * 8 && driftCount < DRIFT_COUNT; attempt += 1) {
    const s = geometry.sample(Math.floor(rand() * geometry.samples.length));
    if (s.y > 0.5) continue;
    const side = rand() < 0.5 ? -1 : 1;
    const out = geometry.wallOffset(s.width) + 3 + rand() * 12;
    const x = s.x + s.nx * side * out;
    const z = s.z + s.nz * side * out;
    if (reserved(x, z) || !clearOfTrack(geometry, x, z)) continue;
    dummy.position.set(x, 0, z);
    dummy.scale.set(3 + rand() * 4, 0.8 + rand() * 1.2, 2 + rand() * 3);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    drifts.setMatrixAt(driftCount, dummy.matrix);
    driftCount += 1;
  }
  drifts.count = driftCount;
  group.add(drifts);

  group.add(mountains(geometry, bounds, rand, dummy));
  group.add(embankments(geometry), ridge(geometry), summit(), lakeIce());
  group.add(createGrandstand(geometry, scenerySets.get('snow')));
  group.add(snowfall());
  return group;
}

/** Peaks in a ring on the horizon: grey rock with white caps (two instanced draws). */
function mountains(
  geometry: TrackGeometry,
  bounds: THREE.Box3,
  rand: () => number,
  dummy: THREE.Object3D,
): THREE.Object3D {
  const group = new THREE.Group();
  const rock = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6),
    flat(COLOURS.rock),
    MOUNTAIN_COUNT,
  );
  // The cap is the top 40 % of the same cone, a hair bigger so it sits on the rock.
  const cap = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.42, 0.4, 6).translate(0, 0.3, 0),
    flat(COLOURS.snow),
    MOUNTAIN_COUNT,
  );
  const centre = bounds.getCenter(new THREE.Vector3());
  const ring = bounds.getSize(new THREE.Vector3()).length() * 0.85;
  for (let i = 0; i < MOUNTAIN_COUNT; i += 1) {
    const angle = (i / MOUNTAIN_COUNT) * Math.PI * 2 + rand() * 0.3;
    const radius = 70 + rand() * 60;
    const height = 90 + rand() * 90;
    let distance = ring * (0.9 + rand() * 0.4);
    const at = () => ({
      x: centre.x + Math.cos(angle) * distance,
      z: centre.z + Math.sin(angle) * distance,
    });
    while (distanceToTrack(geometry, at()) < radius + 40) distance += 10;
    dummy.position.set(at().x, height / 2 - 1, at().z);
    dummy.scale.set(radius, height, radius);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    rock.setMatrixAt(i, dummy.matrix);
    cap.setMatrixAt(i, dummy.matrix);
  }
  group.add(rock, cap);
  return group;
}

/**
 * Snowy banks under the raised road: from the top of each wall line straight down to the valley
 * floor, both sides, wherever the road is off the ground. One draw.
 */
function embankments(geometry: TrackGeometry): THREE.Object3D {
  const positions: number[] = [];
  const n = geometry.samples.length;
  for (let i = 0; i < n; i += 1) {
    const a = geometry.sample(i);
    const b = geometry.sample(i + 1);
    if (a.y < 0.2 && b.y < 0.2) continue;
    for (const side of [-1, 1]) {
      const la = side * geometry.wallOffset(a.width);
      const lb = side * geometry.wallOffset(b.width);
      const ax = a.x + a.nx * la;
      const az = a.z + a.nz * la;
      const bx = b.x + b.nx * lb;
      const bz = b.z + b.nz * lb;
      // Splayed out at the foot a little, like a bank of snow.
      const fa = Math.max(1, a.y * 0.6);
      const fb = Math.max(1, b.y * 0.6);
      const fax = ax + a.nx * side * fa;
      const faz = az + a.nz * side * fa;
      const fbx = bx + b.nx * side * fb;
      const fbz = bz + b.nz * side * fb;
      positions.push(ax, a.y, az, bx, b.y, bz, fbx, 0, fbz);
      positions.push(ax, a.y, az, fbx, 0, fbz, fax, 0, faz);
    }
  }
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mesh.computeVertexNormals();
  return new THREE.Mesh(
    mesh,
    new THREE.MeshLambertMaterial({
      color: COLOURS.cliff,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
}

/** The ridge between the climb and the descent spans these x, m (up to the summit snowbank). */
const RIDGE_X = { min: 95, max: FROSTPEAK_PASS.tunnelFloor[0]?.x ?? 262 };
const RIDGE_CELLS = { x: 29, z: 12 };

/**
 * The snowy ridge between the climb (north) and the descent (south): from each road's wall up to
 * a crest `ridge.height` above the descent, so the snowballs visibly roll down its south face.
 */
function ridge(geometry: TrackGeometry): THREE.Object3D {
  const { ridge: crest, descent } = FROSTPEAK_PASS;
  const north = -95;
  const south = descent.z - 15;
  const plane = new THREE.PlaneGeometry(
    RIDGE_X.max - RIDGE_X.min,
    south - north,
    RIDGE_CELLS.x,
    RIDGE_CELLS.z,
  );
  plane.rotateX(-Math.PI / 2);
  plane.translate((RIDGE_X.min + RIDGE_X.max) / 2, 0, (north + south) / 2);
  const position = plane.getAttribute('position') as THREE.BufferAttribute;
  const roadY = (x: number, z: number) => geometry.project({ x, y: 0, z }).groundY;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const climb = roadY(x, -114);
    const down = roadY(x, descent.z);
    const top = Math.max(climb, down) + crest.height;
    // Linear from each wall line up to the crest, as the snowballs' paths are.
    const y =
      z < crest.z
        ? climb + ((top - climb) * (z - north)) / (crest.z - north)
        : down + ((top - down) * (south - z)) / (south - crest.z);
    position.setY(i, y);
  }
  plane.computeVertexNormals();
  return new THREE.Mesh(plane, flat(COLOURS.snow));
}

/** The summit snowbank stands this high above the tunnel floor; the tunnel roof is this thick, m. */
const SNOWBANK = { height: 9, roof: 3 };

/** A vertical prism over the (x, z) outline `points`, from `bottom` to `top`. */
function prism(points: { x: number; z: number }[], bottom: number, top: number) {
  // Shapes are drawn in XY; y = −z so that rotating −90° about X stands it up over (x, z).
  const shape = new THREE.Shape(points.map((q) => new THREE.Vector2(q.x, -q.z)));
  const solid = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false });
  solid.rotateX(-Math.PI / 2);
  solid.translate(0, bottom, 0);
  solid.deleteAttribute('uv');
  return solid.toNonIndexed();
}

/**
 * The summit: the hairpin's inside filled with snow up to the road, and above it the snowbank
 * with the tunnel through it (between the two mouths, and a roof over the narrow part). One draw.
 */
function summit(): THREE.Object3D {
  const { hairpin: h, tunnel: t, tunnelFloor: f, summitY } = FROSTPEAK_PASS;
  const inner = h.radius - 15;
  const north = h.z - inner;
  const south = h.z + inner;
  const west = f[0]?.x ?? t.x0;
  const arc = (from: number, to: number) =>
    Array.from({ length: 13 }, (_, i) => {
      const a = from + ((to - from) * i) / 12;
      return { x: h.x + inner * Math.cos(a), z: h.z + inner * Math.sin(a) };
    });
  // Everything inside the inner walls, the valley floor up to the road.
  const base = [{ x: west, z: south }, { x: west, z: north }, ...arc(-Math.PI / 2, Math.PI / 2)];
  const top = summitY + SNOWBANK.height;
  // East of the tunnel, round to the hairpin's inner wall.
  const east = [{ x: t.x1, z: north }, ...arc(-Math.PI / 2, Math.PI / 2), { x: t.x1, z: south }];
  // Between the two mouths, west of the tunnel.
  const between = [
    { x: west, z: north + 2 },
    { x: t.x0, z: t.z0 },
    { x: t.x0, z: t.z1 },
    { x: west, z: south - 2 },
  ];
  const roof = [
    { x: t.x0, z: t.z0 },
    { x: t.x1, z: t.z0 },
    { x: t.x1, z: t.z1 },
    { x: t.x0, z: t.z1 },
  ];
  const solids = [
    prism(base, 0, summitY - 0.05),
    prism(east, summitY, top),
    prism(between, summitY, top),
    prism(roof, top - SNOWBANK.roof, top),
  ];
  const merged = mergeGeometries(solids);
  if (!merged) throw new Error('Frostpeak summit: geometries do not merge');
  const snow = new THREE.Mesh(merged, flat(COLOURS.snow));
  // The tunnel's inside is darker, so its mouth reads from a distance.
  const liningGeometry = prism(roof, top - SNOWBANK.roof - 0.1, top - SNOWBANK.roof - 0.05);
  const lining = new THREE.Mesh(liningGeometry, flat(COLOURS.rock));
  const group = new THREE.Group();
  group.add(snow, lining);
  return group;
}

/** The lake's ice sheet: centred here, reaching this far (m) past the U's centreline. */
const LAKE_ICE = {
  x: FROSTPEAK_PASS.lake.x,
  z: FROSTPEAK_PASS.lake.z + 15,
  beyond: 45,
};

/** The frozen lake: ice inside the final U and out past its far side. One draw. */
function lakeIce(): THREE.Object3D {
  const { lake } = FROSTPEAK_PASS;
  const ice = new THREE.Mesh(
    new THREE.CircleGeometry(lake.radius + LAKE_ICE.beyond, 40),
    new THREE.MeshLambertMaterial({
      color: COLOURS.ice,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  ice.rotation.x = -Math.PI / 2;
  ice.position.set(LAKE_ICE.x, -0.02, LAKE_ICE.z);
  return ice;
}

/** Falling snow: this many flakes in a box this big (m) round the camera, falling this fast (m/s). */
const SNOW = { count: 900, half: 35, height: 22, fall: 2.2, drift: 0.8 };

/** Wraps `value` into [−half, half). */
const wrap = (value: number, half: number) =>
  value - Math.floor((value + half) / (2 * half)) * 2 * half;

/** The snowflakes (one draw); `update` moves them from the tick, so they need no state. */
function snowfall(): THREE.Points {
  const base = new Float32Array(SNOW.count * 3);
  for (let i = 0; i < SNOW.count; i += 1) {
    // Fixed scatter (a hash, not Math.random) so screenshots are stable.
    const h = (n: number) => {
      const v = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    base[i * 3] = (h(1) * 2 - 1) * SNOW.half;
    base[i * 3 + 1] = h(2) * SNOW.height;
    base[i * 3 + 2] = (h(3) * 2 - 1) * SNOW.half;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
  geometry.userData.base = base;
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.14,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  points.name = 'snowfall';
  points.frustumCulled = false;
  return points;
}

/** Moves the snowflakes: each falls and drifts, wrapped into the box round the camera. */
function update(scenery: THREE.Object3D, ticks: number, camera: THREE.Vector3): void {
  const flakes = scenery.getObjectByName('snowfall');
  if (!(flakes instanceof THREE.Points)) return;
  const seconds = ticks * DT;
  const base = flakes.geometry.userData.base as Float32Array;
  const position = flakes.geometry.getAttribute('position') as THREE.BufferAttribute;
  const array = position.array as Float32Array;
  for (let i = 0; i < base.length; i += 3) {
    const sway = Math.sin(seconds * 0.9 + i) * SNOW.drift;
    array[i] = camera.x + wrap((base[i] ?? 0) + sway - camera.x, SNOW.half);
    const fallen = (base[i + 1] ?? 0) - seconds * SNOW.fall;
    array[i + 1] = camera.y + wrap(fallen - camera.y, SNOW.height / 2);
    array[i + 2] = camera.z + wrap((base[i + 2] ?? 0) - camera.z, SNOW.half);
  }
  position.needsUpdate = true;
}

export default {
  id: 'frostpeak-pass',
  scenery,
  update,
} satisfies TrackView;
