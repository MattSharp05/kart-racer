import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clearOfTrack, distanceToTrack, random, scenerySets } from '../../../render/scenery';
import { swayDeckFrame } from '../../../sim/hazards/sway';
import type { SwayHazard } from '../../../sim/hazards/types';
import { insidePolygon, type TrackGeometry } from '../../../sim/splineTrack';
import { DT } from '../../../sim/tuning';
import type { TrackView } from '../render';
import { CANOPY_RUSH } from './sim';

const COLOURS = {
  bark: 0x5b3d24,
  barkDark: 0x46301c,
  root: 0x6e4c2c,
  leaf: [0x2f7a34, 0x3d8c3a, 0x246b2e, 0x4f9a3f],
  canopy: 0x2c6e2f,
  bush: 0x3a8a3c,
  stone: 0x9a978a,
  stoneDark: 0x7b786c,
  moss: 0x6b8f4a,
  water: 0x4fa3c7,
  foam: 0xe8f6ff,
  cliff: 0x6f6a5e,
  hill: 0x2a5a2c,
  shaft: 0xfff3c4,
};

scenerySets.register({
  id: 'jungle',
  trunk: COLOURS.bark,
  canopy: COLOURS.canopy,
  rock: COLOURS.stone,
  hill: COLOURS.hill,
  seats: 0x8c5f38,
  roof: 0x3d8c3a,
});

const TREE_COUNT = 230;
const BUSH_COUNT = 320;
const HILL_COUNT = 16;
const FAR_TREE_COUNT = 26;
const SHAFT_COUNT = 16;

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

/** Merges vertex-coloured parts (dropping the uvs the primitives came with). */
function merge(parts: THREE.BufferGeometry[], what: string): THREE.BufferGeometry {
  for (const part of parts) part.deleteAttribute('uv');
  const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)));
  if (!merged) throw new Error(`Canopy Rush ${what}: geometries do not merge`);
  return merged;
}

/** One jungle tree: a tall trunk and three leafy blobs, in one vertex-coloured geometry. */
function jungleTreeGeometry(): THREE.BufferGeometry {
  const parts = [
    painted(new THREE.CylinderGeometry(0.45, 0.75, 10, 6).translate(0, 5, 0), COLOURS.bark),
  ];
  for (const [x, y, z, r, c] of [
    [0, 10.5, 0, 3.6, COLOURS.leaf[0]],
    [1.8, 9, 1, 2.6, COLOURS.leaf[1]],
    [-1.6, 8.8, -1.2, 2.5, COLOURS.leaf[2]],
  ] as const) {
    parts.push(
      painted(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1).translate(x, y, z), c ?? 0),
    );
  }
  return merge(parts, 'tree');
}

/** Whether (x, z) is kept clear for a feature with its own model (the cliff, the ruins, water). */
function reserved(x: number, z: number): boolean {
  const { trunk } = CANOPY_RUSH;
  if (x > CLIFF.x0 - 4 && x < CLIFF.x1 + 2 && z > CLIFF.z0 - 4 && z < CLIFF.z1 + 4) return true;
  if (Math.hypot(x - trunk.x, z - trunk.z) < GIANT_TRUNK.radius + 4) return true;
  if (Math.abs(z - STREAM.z) < STREAM.half + 3 && x < STREAM.x1 + 4) return true;
  if (riverDistance(x, z) < RIVER.half + 3) return true;
  return insidePolygon(x, z, [...CANOPY_RUSH.ruinsFloor]);
}

/**
 * Canopy Rush's scenery (MK-61): giant trees holding up the platforms, the spiral's giant trunk,
 * dense instanced jungle, root embankments under the raised road, the stone ruins, the waterfall
 * and its stream, the river in the gorge under bridge 2, and billboard sun shafts. 11 draws.
 */
function scenery(geometry: TrackGeometry): THREE.Object3D {
  const group = new THREE.Group();
  const rand = random(geometry.samples.length * 104729);
  const dummy = new THREE.Object3D();
  const bounds = new THREE.Box3();
  for (const s of geometry.samples) bounds.expandByPoint(new THREE.Vector3(s.x, 0, s.z));

  // Jungle trees over the floor, thickest round the track.
  const trees = new THREE.InstancedMesh(
    jungleTreeGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    TREE_COUNT,
  );
  let treeCount = 0;
  for (let attempt = 0; attempt < TREE_COUNT * 10 && treeCount < TREE_COUNT; attempt += 1) {
    const x = THREE.MathUtils.lerp(bounds.min.x - 80, bounds.max.x + 80, rand());
    const z = THREE.MathUtils.lerp(bounds.min.z - 80, bounds.max.z + 80, rand());
    if (reserved(x, z) || !clearOfTrack(geometry, x, z)) continue;
    const scale = 0.8 + rand() * 0.9;
    dummy.position.set(x, 0, z);
    dummy.scale.set(scale, scale * (0.9 + rand() * 0.5), scale);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.updateMatrix();
    trees.setMatrixAt(treeCount, dummy.matrix);
    treeCount += 1;
  }
  trees.count = treeCount;
  group.add(trees);

  // Bushes and ferns: low leafy mounds just outside the walls, and under the bridges.
  const bushes = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    flat(COLOURS.bush),
    BUSH_COUNT,
  );
  let bushCount = 0;
  for (let attempt = 0; attempt < BUSH_COUNT * 10 && bushCount < BUSH_COUNT; attempt += 1) {
    const s = geometry.sample(Math.floor(rand() * geometry.samples.length));
    const side = rand() < 0.5 ? -1 : 1;
    const out = geometry.wallOffset(s.width) + 2 + rand() * 16;
    const x = s.x + s.nx * side * out;
    const z = s.z + s.nz * side * out;
    if (reserved(x, z)) continue;
    // On the floor: clear of the road there, or well below a raised road.
    const road = geometry.project({ x, y: 0, z });
    const under = road.groundY > 6 || Math.abs(road.lateral) > geometry.wallOffset(road.width) + 1;
    if (!under) continue;
    dummy.position.set(x, 0, z);
    dummy.scale.set(1.5 + rand() * 2.5, 0.8 + rand() * 1.6, 1.5 + rand() * 2.5);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    bushes.setMatrixAt(bushCount, dummy.matrix);
    bushCount += 1;
  }
  bushes.count = bushCount;
  group.add(bushes);

  group.add(giantTrees(geometry, bounds, rand, dummy));
  group.add(hills(geometry, bounds, rand, dummy));
  group.add(embankments(geometry));
  group.add(ruins(rand, dummy));
  group.add(waterfall(geometry));
  group.add(sunShafts(geometry, rand));
  return group;
}

/** The spiral's giant trunk: radius and height, m (the road winds round it). */
const GIANT_TRUNK = { radius: 24, height: 78 };

/**
 * The giant trees: the spiral's trunk, the trees the platforms and bridges hang from, and a ring
 * of them in the distance. Trunks, buttress flares and canopies: merged: one draw.
 */
function giantTrees(
  geometry: TrackGeometry,
  bounds: THREE.Box3,
  rand: () => number,
  dummy: THREE.Object3D,
): THREE.Object3D {
  const { trunk, bridges } = CANOPY_RUSH;
  // [x, z, radius, height]: the spiral's trunk, then the trees by the platforms and bridges.
  const near: [number, number, number, number][] = [
    [trunk.x, trunk.z, GIANT_TRUNK.radius, GIANT_TRUNK.height],
    [122, -122, 8, 58],
    [158, 14, 8, 55],
    [bridges.b1.from.x + 22, bridges.b1.from.z + 4, 6, 50],
    [bridges.b3.from.x - 22, bridges.b3.from.z + 6, 7, 60],
    [bridges.b2.from.x - 6, bridges.b2.from.z + 26, 6, 48],
    [212, -40, 7, 52],
  ];
  const far: [number, number, number, number][] = [];
  const centre = bounds.getCenter(new THREE.Vector3());
  const ring = bounds.getSize(new THREE.Vector3()).length() * 0.55;
  for (let i = 0; i < FAR_TREE_COUNT; i += 1) {
    const angle = (i / FAR_TREE_COUNT) * Math.PI * 2 + rand() * 0.2;
    let distance = ring * (0.85 + rand() * 0.3);
    const at = () => ({
      x: centre.x + Math.cos(angle) * distance,
      z: centre.z + Math.sin(angle) * distance,
    });
    while (distanceToTrack(geometry, at()) < 40) distance += 10;
    far.push([at().x, at().z, 5 + rand() * 5, 55 + rand() * 30]);
  }
  // Merged into one vertex-coloured mesh: each tree's trunk, buttress flare and two crowns.
  const trunkShape = new THREE.CylinderGeometry(0.85, 1, 1, 10).translate(0, 0.5, 0);
  const flare = new THREE.ConeGeometry(1.7, 1, 8).translate(0, 0.5, 0);
  const crown = new THREE.IcosahedronGeometry(1, 1);
  const parts: THREE.BufferGeometry[] = [];
  const add = (base: THREE.BufferGeometry, colour: number) => {
    dummy.updateMatrix();
    parts.push(painted(base.clone().applyMatrix4(dummy.matrix), colour));
  };
  for (const [x, z, radius, height] of [...near, ...far]) {
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.position.set(x, 0, z);
    dummy.scale.set(radius, height, radius);
    add(trunkShape, COLOURS.bark);
    dummy.scale.set(radius, height * 0.18, radius);
    add(flare, COLOURS.barkDark);
    for (const k of [0, 1]) {
      const spread = radius * (2.4 + rand());
      dummy.position.set(
        x + (k ? spread * 0.4 : -spread * 0.3),
        height + (k ? -4 : 4),
        z + (k ? spread * 0.3 : -spread * 0.2),
      );
      dummy.scale.set(spread, spread * 0.45, spread);
      add(crown, COLOURS.canopy);
    }
  }
  return new THREE.Mesh(
    merge(parts, 'giant trees'),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
}

/** Low green hills in a ring well outside the track, under the distant trees. One draw. */
function hills(
  geometry: TrackGeometry,
  bounds: THREE.Box3,
  rand: () => number,
  dummy: THREE.Object3D,
): THREE.Object3D {
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    flat(COLOURS.hill),
    HILL_COUNT,
  );
  const centre = bounds.getCenter(new THREE.Vector3());
  const ring = bounds.getSize(new THREE.Vector3()).length() * 0.8;
  for (let i = 0; i < HILL_COUNT; i += 1) {
    const angle = (i / HILL_COUNT) * Math.PI * 2 + rand() * 0.3;
    let distance = ring * (0.9 + rand() * 0.3);
    dummy.scale.set(70 + rand() * 60, 30 + rand() * 30, 70 + rand() * 60);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    const reach = Math.max(dummy.scale.x, dummy.scale.z) + 20;
    const at = () => ({
      x: centre.x + Math.cos(angle) * distance,
      z: centre.z + Math.sin(angle) * distance,
    });
    while (distanceToTrack(geometry, at()) < reach) distance += 10;
    dummy.position.set(at().x, -2, at().z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  return mesh;
}

/**
 * Root and bark banks under the raised road (the buttress root, the platforms, the spiral and the
 * root ramp): from each wall line down to the jungle floor, splayed like roots. Not under the rope
 * bridges, which hang over the drop. One draw.
 */
function embankments(geometry: TrackGeometry): THREE.Object3D {
  const decks = (geometry.def.hazards ?? []).filter(
    (hazard): hazard is SwayHazard => hazard.kind === 'sway',
  );
  const onDeck = (x: number, z: number) =>
    decks.some((deck) => {
      const frame = swayDeckFrame(deck, { x, y: 0, z });
      return frame.u > -0.01 && frame.u < 1.01 && Math.abs(frame.across) < deck.halfWidth + 1;
    });
  const positions: number[] = [];
  const n = geometry.samples.length;
  for (let i = 0; i < n; i += 1) {
    const a = geometry.sample(i);
    const b = geometry.sample(i + 1);
    if ((a.y < 0.2 && b.y < 0.2) || onDeck(a.x, a.z) || onDeck(b.x, b.z)) continue;
    for (const side of [-1, 1]) {
      const la = side * geometry.wallOffset(a.width);
      const lb = side * geometry.wallOffset(b.width);
      const ax = a.x + a.nx * la;
      const az = a.z + a.nz * la;
      const bx = b.x + b.nx * lb;
      const bz = b.z + b.nz * lb;
      const fa = Math.max(1, a.y * 0.35);
      const fb = Math.max(1, b.y * 0.35);
      positions.push(ax, a.y, az, bx, b.y, bz, bx + b.nx * side * fb, 0, bz + b.nz * side * fb);
      positions.push(
        ax,
        a.y,
        az,
        bx + b.nx * side * fb,
        0,
        bz + b.nz * side * fb,
        ax + a.nx * side * fa,
        0,
        az + a.nz * side * fa,
      );
    }
  }
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mesh.computeVertexNormals();
  return new THREE.Mesh(
    mesh,
    new THREE.MeshLambertMaterial({
      color: COLOURS.root,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
}

/** Spacing of the ruins' pillars along their outline, and how far outside it they stand, m. */
const PILLARS = { step: 11, out: 1.6 };

/**
 * The ruins: a mossy stone floor over the shortcut, broken pillars along both sides, a stone arch
 * over the way in, and a stepped temple to the west. Three draws.
 */
function ruins(rand: () => number, dummy: THREE.Object3D): THREE.Object3D {
  const outline = CANOPY_RUSH.ruinsFloor;
  const { floorY } = CANOPY_RUSH;
  const group = new THREE.Group();

  // The stone floor, a little above the plain shortcut floor the track mesh lays.
  const shape = outline.map((v) => new THREE.Vector2(v.x, v.z));
  const positions: number[] = [];
  const colours: number[] = [];
  const stone = new THREE.Color(COLOURS.stone);
  const moss = new THREE.Color(COLOURS.moss);
  for (const [i = 0, j = 0, k = 0] of THREE.ShapeUtils.triangulateShape(shape, [])) {
    for (const index of [i, j, k]) {
      const v = shape[index];
      if (!v) continue;
      positions.push(v.x, floorY + 0.05, v.y);
      const c = (Math.floor(v.x / 7) + Math.floor(v.y / 7)) % 3 === 0 ? moss : stone;
      colours.push(c.r, c.g, c.b);
    }
  }
  const floor = new THREE.BufferGeometry();
  floor.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  floor.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  floor.computeVertexNormals();
  group.add(
    new THREE.Mesh(
      floor,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    ),
  );

  // Pillars just outside the outline (some broken off), the arch and the temple: stone blocks.
  const blocks: [number, number, number, number, number, number, number][] = [];
  const polygon = [...outline];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length] ?? a;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    // Skip the edges that open onto the road (the way back up at the far end).
    if (a.z > 150 && b.z > 150) return;
    const nx = (b.z - a.z) / length;
    const nz = -(b.x - a.x) / length;
    for (let d = PILLARS.step / 2; d < length; d += PILLARS.step) {
      const mx = a.x + ((b.x - a.x) * d) / length;
      const mz = a.z + ((b.z - a.z) * d) / length;
      // Outward: whichever side of the edge is outside the floor.
      const side = insidePolygon(mx + nx, mz + nz, polygon) ? -1 : 1;
      const height = rand() < 0.35 ? 1.5 + rand() * 1.5 : 4 + rand() * 3;
      blocks.push([
        mx + nx * side * PILLARS.out,
        height / 2,
        mz + nz * side * PILLARS.out,
        1.6,
        height,
        1.6,
        Math.atan2(nx, nz),
      ]);
    }
  });
  // The arch over the ruins just past the landing: two pillars and a lintel.
  const arch = { z: -40, x0: 58, x1: 86, height: 9 };
  blocks.push(
    [arch.x0, arch.height / 2, arch.z, 2.4, arch.height, 2.4, 0],
    [arch.x1, arch.height / 2, arch.z, 2.4, arch.height, 2.4, 0],
    [(arch.x0 + arch.x1) / 2, arch.height + 1, arch.z, arch.x1 - arch.x0 + 4, 2, 3, 0],
  );
  // The stepped temple, west of the ruins.
  for (let step = 0; step < 5; step += 1) {
    const size = 30 - step * 5.5;
    blocks.push([28, 1.6 + step * 3.2, 45, size, 3.2, size, 0]);
  }
  const stones = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
    blocks.length,
  );
  const colour = new THREE.Color();
  blocks.forEach(([x, y, z, sx, sy, sz, yaw], i) => {
    dummy.position.set(x, floorY + y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
    stones.setColorAt(i, colour.setHex(i % 4 === 0 ? COLOURS.stoneDark : COLOURS.stone));
  });
  group.add(stones);
  return group;
}

/** The cliff the waterfall drops off (world x, z), and its height, m. */
const CLIFF = { x0: -66, x1: -21, z0: -30, z1: 26, height: 24 };
/** The stream from the waterfall's pool, east across the road under the jump. */
const STREAM = { z: 15, half: 4, x1: 42 };
/** Falling-water streaks on the waterfall, and how fast they fall, m/s. */
const STREAKS = { count: 40, speed: 14 };

/**
 * The waterfall by the jump: a rocky cliff west of the start straight, water pouring down its
 * face into a pool, and the stream from the pool across the road under the jump (the ramp's lip
 * throws you over it); and the river in the gorge under bridge 2. The streaks fall with the tick
 * (`update`). Three draws.
 */
function waterfall(geometry: TrackGeometry): THREE.Object3D {
  const group = new THREE.Group();
  const cliff = new THREE.Mesh(
    new THREE.BoxGeometry(CLIFF.x1 - CLIFF.x0, CLIFF.height, CLIFF.z1 - CLIFF.z0),
    flat(COLOURS.cliff),
  );
  cliff.position.set((CLIFF.x0 + CLIFF.x1) / 2, CLIFF.height / 2, (CLIFF.z0 + CLIFF.z1) / 2);
  const water = new THREE.MeshLambertMaterial({
    color: COLOURS.water,
    transparent: true,
    opacity: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  // The falling sheet, just off the cliff face.
  const sheet = new THREE.PlaneGeometry(STREAM.half * 2, CLIFF.height)
    .rotateY(Math.PI / 2)
    .translate(CLIFF.x1 + 0.15, CLIFF.height / 2, STREAM.z);
  // The pool and the stream: a strip east across the road, following the road's height on it.
  const strip: number[] = [];
  const x0 = CLIFF.x1 - 1;
  const cells = Math.ceil((STREAM.x1 - x0) / 2);
  const y = (x: number, z: number) => {
    const p = geometry.project({ x, y: 0, z });
    const onRoad = Math.abs(p.lateral) <= geometry.wallOffset(p.width);
    return (onRoad ? Math.max(0, p.groundY) : 0) + 0.08;
  };
  for (let i = 0; i < cells; i += 1) {
    const xa = x0 + i * 2;
    const xb = xa + 2;
    const za = STREAM.z - STREAM.half;
    const zb = STREAM.z + STREAM.half;
    strip.push(xa, y(xa, za), za, xa, y(xa, zb), zb, xb, y(xb, zb), zb);
    strip.push(xa, y(xa, za), za, xb, y(xb, zb), zb, xb, y(xb, za), za);
  }
  const stream = new THREE.BufferGeometry();
  stream.setAttribute('position', new THREE.Float32BufferAttribute(strip, 3));
  // The river far below bridge 2, running across it.
  const river = new THREE.PlaneGeometry(RIVER.half * 2, RIVER.reach * 2)
    .rotateX(-Math.PI / 2)
    .rotateY(Math.PI / 4)
    .translate(RIVER.x, 0.05, RIVER.z);
  // All the water is one mesh (one draw).
  for (const part of [sheet, river]) part.deleteAttribute('normal');
  const waters = mergeGeometries(
    [sheet, stream, river].map((part) => {
      if (part.hasAttribute('uv')) part.deleteAttribute('uv');
      return part.index ? part.toNonIndexed() : part;
    }),
  );
  if (!waters) throw new Error('Canopy Rush water: geometries do not merge');
  waters.computeVertexNormals();
  const pool = new THREE.Mesh(waters, water);
  // White streaks falling down the sheet (moved by `update`).
  const streaks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 3, 0.35),
    new THREE.MeshBasicMaterial({ color: COLOURS.foam, transparent: true, opacity: 0.8 }),
    STREAKS.count,
  );
  streaks.name = 'waterfall-streaks';
  streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // The streaks move every frame: bound the whole waterfall once, so it's culled off screen.
  streaks.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(CLIFF.x1, CLIFF.height / 2, STREAM.z),
    CLIFF.height,
  );
  group.add(cliff, pool, streaks);
  return group;
}

/** The river in the gorge under bridge 2: a straight strip across the bridge's middle. */
const RIVER = { x: 147, z: -41, half: 9, reach: 80 };

/** Distance (XZ) from the river's centreline, m. */
function riverDistance(x: number, z: number): number {
  // It runs north-east ↔ south-west, across bridge 2 (which runs south-east).
  const along = (x - RIVER.x - (z - RIVER.z)) / Math.SQRT2;
  const across = (x - RIVER.x + (z - RIVER.z)) / Math.SQRT2;
  return Math.abs(along) > RIVER.reach ? Infinity : Math.abs(across);
}

/** Sun shafts: tall soft planes of light through the canopy, turned to face the camera. One draw. */
function sunShafts(geometry: TrackGeometry, rand: () => number): THREE.Object3D {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const across = ctx.createLinearGradient(0, 0, 32, 0);
    across.addColorStop(0, 'rgba(255,255,255,0)');
    across.addColorStop(0.5, 'rgba(255,255,255,1)');
    across.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, 32, 128);
    // Fade out towards the ground.
    ctx.globalCompositeOperation = 'destination-in';
    const down = ctx.createLinearGradient(0, 0, 0, 128);
    down.addColorStop(0, 'rgba(0,0,0,1)');
    down.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = down;
    ctx.fillRect(0, 0, 32, 128);
  }
  const shafts = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({
      color: COLOURS.shaft,
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
    SHAFT_COUNT,
  );
  const spots: { x: number; z: number; width: number; height: number }[] = [];
  for (let i = 0; i < SHAFT_COUNT; i += 1) {
    const s = geometry.sample(
      Math.floor((i / SHAFT_COUNT + rand() * 0.03) * geometry.samples.length),
    );
    const side = i % 2 ? 1 : -1;
    const out = geometry.wallOffset(s.width) + 4 + rand() * 14;
    spots.push({
      x: s.x + s.nx * side * out,
      z: s.z + s.nz * side * out,
      width: 5 + rand() * 5,
      height: 45 + rand() * 25,
    });
  }
  shafts.userData.spots = spots;
  shafts.name = 'sun-shafts';
  shafts.frustumCulled = false;
  return shafts;
}

/** Per frame: sun shafts turn to face the camera; the waterfall's streaks fall with the tick. */
function update(scenery: THREE.Object3D, ticks: number, camera: THREE.Vector3): void {
  const dummy = new THREE.Object3D();
  const shafts = scenery.getObjectByName('sun-shafts');
  if (shafts instanceof THREE.InstancedMesh) {
    const spots = shafts.userData.spots as {
      x: number;
      z: number;
      width: number;
      height: number;
    }[];
    spots.forEach((spot, i) => {
      dummy.position.set(spot.x, 0, spot.z);
      // Upright, turned about the vertical to face the camera, leaning a little with the sun.
      dummy.rotation.set(0, Math.atan2(camera.x - spot.x, camera.z - spot.z), 0.18);
      dummy.scale.set(spot.width, spot.height, 1);
      dummy.updateMatrix();
      shafts.setMatrixAt(i, dummy.matrix);
    });
    shafts.instanceMatrix.needsUpdate = true;
  }
  const streaks = scenery.getObjectByName('waterfall-streaks');
  if (streaks instanceof THREE.InstancedMesh) {
    const seconds = ticks * DT;
    for (let i = 0; i < STREAKS.count; i += 1) {
      // A fixed scatter (a hash, not Math.random), so screenshots are stable.
      const h = (n: number) => {
        const v = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
        return v - Math.floor(v);
      };
      const fallen = (h(1) * CLIFF.height + seconds * STREAKS.speed) % CLIFF.height;
      dummy.position.set(
        CLIFF.x1 + 0.3,
        CLIFF.height - fallen,
        STREAM.z + (h(2) * 2 - 1) * (STREAM.half - 0.4),
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      streaks.setMatrixAt(i, dummy.matrix);
    }
    streaks.instanceMatrix.needsUpdate = true;
  }
}

export default {
  id: 'canopy-rush',
  scenery,
  update,
} satisfies TrackView;
