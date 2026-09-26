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
import type { TrackView } from '../render';
import { DUNE_CANYON } from './sim';

const CACTUS_COUNT = 90;
const PILLAR_COUNT = 70;
const MESA_COUNT = 12;
const PEBBLE_COUNT = 40;
/** Rock pillars stand this far outside the walls, m (a band either side: the canyon sides). */
const PILLAR_BAND = { min: 4, max: 22 };
/** The plateau section has no canyon sides: open desert with cacti. */
const PLATEAU = { minX: 70, maxX: 320, maxZ: -80 };

const COLOURS = {
  cactus: 0x4f8a3c,
  rock: 0xb8653a,
  rockDark: 0x8e4a2a,
  mesa: 0xc9784a,
  riverbed: 0xa98a64,
  pebble: 0x9a8a78,
};

const flat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** One saguaro: trunk plus two arms, merged so all cacti are a single instanced draw. */
function cactusGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.45, 0.55, 4.5, 6);
  trunk.translate(0, 2.25, 0);
  parts.push(trunk);
  for (const [side, height, reach] of [
    [1, 2.2, 1.2],
    [-1, 2.8, 1],
  ] as const) {
    const elbow = new THREE.CylinderGeometry(0.3, 0.3, reach, 5);
    elbow.rotateZ(Math.PI / 2);
    elbow.translate((side * reach) / 2, height, 0);
    const arm = new THREE.CylinderGeometry(0.3, 0.32, 1.6, 5);
    arm.translate(side * reach, height + 0.8, 0);
    parts.push(elbow, arm);
  }
  return mergeGeometries(parts) ?? trunk;
}

function inPlateau(x: number, z: number): boolean {
  return x > PLATEAU.minX && x < PLATEAU.maxX && z < PLATEAU.maxZ;
}

/** Whether (x, z) is inside the final U, where the slot canyon's rock sits. */
function insideU(x: number, z: number): boolean {
  const { u } = DUNE_CANYON;
  return (
    Math.abs(x - u.x) < u.radius && z > u.z - 60 && Math.hypot(x - u.x, z - u.z) < u.radius + 5
  );
}

/**
 * Dune Canyon's scenery (MK-58): rock pillars lining the canyon sections, cacti out on the
 * plateau, flat-topped mesas on the horizon, the slot canyon's rock walls and the dry riverbed
 * under the jump. Seven instanced draws plus the grandstand.
 */
function scenery(geometry: TrackGeometry): THREE.Object3D {
  const group = new THREE.Group();
  const rand = random(geometry.samples.length * 104729);
  const dummy = new THREE.Object3D();
  const bounds = new THREE.Box3();
  for (const s of geometry.samples) bounds.expandByPoint(new THREE.Vector3(s.x, s.y, s.z));

  // Rock pillars (hoodoos) in a band just outside the walls, off the plateau.
  const pillars = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.7, 1, 1, 6),
    flat(COLOURS.rock),
    PILLAR_COUNT,
  );
  let pillarCount = 0;
  for (let attempt = 0; attempt < PILLAR_COUNT * 6 && pillarCount < PILLAR_COUNT; attempt += 1) {
    const s = geometry.sample(Math.floor(rand() * geometry.samples.length));
    const side = rand() < 0.5 ? -1 : 1;
    const out =
      geometry.wallOffset(s.width) + PILLAR_BAND.min + rand() * (PILLAR_BAND.max - PILLAR_BAND.min);
    const x = s.x + s.nx * side * out;
    const z = s.z + s.nz * side * out;
    if (inPlateau(x, z) || insideU(x, z) || !clearOfTrack(geometry, x, z)) continue;
    const radius = 2.5 + rand() * 3;
    const height = 8 + rand() * 14;
    dummy.position.set(x, height / 2 - 0.5, z);
    dummy.scale.set(radius, height, radius);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    pillars.setMatrixAt(pillarCount, dummy.matrix);
    pillarCount += 1;
  }
  pillars.count = pillarCount;
  group.add(pillars);

  // Cacti scattered over the open desert, mostly round the plateau.
  const cacti = new THREE.InstancedMesh(cactusGeometry(), flat(COLOURS.cactus), CACTUS_COUNT);
  let cactusCount = 0;
  for (let attempt = 0; attempt < CACTUS_COUNT * 6 && cactusCount < CACTUS_COUNT; attempt += 1) {
    const x = THREE.MathUtils.lerp(bounds.min.x - 50, bounds.max.x + 50, rand());
    const z = THREE.MathUtils.lerp(bounds.min.z - 50, bounds.max.z + 50, rand());
    if (insideU(x, z) || !clearOfTrack(geometry, x, z)) continue;
    const scale = 0.8 + rand() * 0.6;
    const ground = inPlateau(x, z) ? 3.5 : 0;
    dummy.position.set(x, ground, z);
    dummy.scale.setScalar(scale);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.updateMatrix();
    cacti.setMatrixAt(cactusCount, dummy.matrix);
    cactusCount += 1;
  }
  cacti.count = cactusCount;
  group.add(cacti);

  // Mesas: big flat-topped rocks in a ring on the horizon.
  const mesas = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.8, 1, 1, 7),
    flat(COLOURS.mesa),
    MESA_COUNT,
  );
  const centre = bounds.getCenter(new THREE.Vector3());
  const ring = bounds.getSize(new THREE.Vector3()).length() * 0.8;
  for (let i = 0; i < MESA_COUNT; i += 1) {
    const angle = (i / MESA_COUNT) * Math.PI * 2 + rand() * 0.3;
    const radius = 40 + rand() * 50;
    const height = 30 + rand() * 45;
    let distance = ring * (0.9 + rand() * 0.4);
    const at = () => ({
      x: centre.x + Math.cos(angle) * distance,
      z: centre.z + Math.sin(angle) * distance,
    });
    while (distanceToTrack(geometry, at()) < radius + 30) distance += 10;
    dummy.position.set(at().x, height / 2 - 1, at().z);
    dummy.scale.set(radius, height, radius * (0.6 + rand() * 0.6));
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    mesas.setMatrixAt(i, dummy.matrix);
  }
  group.add(mesas);

  group.add(slotCanyon(), riverbed(rand, dummy));
  group.add(createGrandstand(geometry, scenerySets.get('desert')));
  return group;
}

/** Rock height inside the U, m. */
const SLOT_ROCK_HEIGHT = 11;

/** A vertical prism of rock over the (x, z) outline `points`, `height` tall. */
function rockPrism(points: { x: number; z: number }[], height: number): THREE.BufferGeometry {
  // Shapes are drawn in XY; y = −z so that rotating −90° about X stands it up over (x, z).
  const shape = new THREE.Shape(points.map((q) => new THREE.Vector2(q.x, -q.z)));
  const prism = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  prism.rotateX(-Math.PI / 2);
  return prism;
}

/**
 * The rock inside the final U with the slot canyon cut through it (the sim's `slotFloor`): a
 * mass north of the corridor and one south of it, filling the U up to its inner walls. One draw.
 */
function slotCanyon(): THREE.Object3D {
  const { slotFloor: f, u } = DUNE_CANYON;
  // The rock stops at the legs' inner walls (road half-width + verge).
  const inner = u.radius - 16;
  const east = u.x + inner;
  const west = u.x - inner;
  const zAt = (a: { x: number; z: number }, b: { x: number; z: number }, x: number) =>
    a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x);
  // Floor corners: 0–3 the north side east → west, 4–7 the south side west → east.
  const [a, b, c, d, e, g, h, k] = f;
  const northEdge = u.z - 50;
  const north = [
    { x: east, z: northEdge },
    { x: east, z: zAt(a, b, east) },
    b,
    c,
    { x: west, z: zAt(c, d, west) },
    { x: west, z: northEdge },
  ];
  const arc = Array.from({ length: 13 }, (_, i) => {
    const angle = Math.PI - (i / 12) * Math.PI;
    return { x: u.x + inner * Math.cos(angle), z: u.z + inner * Math.sin(angle) };
  });
  const south = [{ x: east, z: zAt(h, k, east) }, h, g, { x: west, z: zAt(e, g, west) }, ...arc];
  const merged =
    mergeGeometries([rockPrism(north, SLOT_ROCK_HEIGHT), rockPrism(south, SLOT_ROCK_HEIGHT)]) ??
    new THREE.BufferGeometry();
  return new THREE.Mesh(merged, flat(COLOURS.rockDark));
}

/** The dry riverbed crossing under the jump: a darker strip each side of the road, and pebbles. */
function riverbed(rand: () => number, dummy: THREE.Object3D): THREE.Object3D {
  const group = new THREE.Group();
  const { riverbed: bed } = DUNE_CANYON;
  const clear = 16;
  const length = 40;
  const parts = [-1, 1].map((side) => {
    const strip = new THREE.PlaneGeometry(bed.width, length);
    strip.rotateX(-Math.PI / 2);
    strip.translate(bed.x, -0.02, bed.z + side * (clear + length / 2));
    return strip;
  });
  const strips = new THREE.Mesh(
    mergeGeometries(parts) ?? parts[0],
    new THREE.MeshLambertMaterial({
      color: COLOURS.riverbed,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  group.add(strips);
  const pebbles = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.5, 0),
    flat(COLOURS.pebble),
    PEBBLE_COUNT,
  );
  for (let i = 0; i < PEBBLE_COUNT; i += 1) {
    const side = i % 2 ? 1 : -1;
    dummy.position.set(
      bed.x + (rand() - 0.5) * bed.width,
      0,
      bed.z + side * (clear + rand() * length),
    );
    dummy.scale.setScalar(0.5 + rand() * 1.2);
    dummy.rotation.set(rand(), rand(), rand());
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);
  }
  group.add(pebbles);
  return group;
}

export default {
  id: 'dune-canyon',
  scenery,
} satisfies TrackView;
