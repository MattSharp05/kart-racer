import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clearOfTrack, random, scenerySets } from '../../../render/scenery';
import type { TrackGeometry } from '../../../sim/splineTrack';
import type { TrackView } from '../render';
import { NEON_HARBOUR } from './sim';

const COLOURS = {
  water: 0x0c1838,
  concrete: 0x4b5163,
  building: [0x2a2f45, 0x33304a, 0x252a3d, 0x3a3550],
  window: [0xffd68a, 0xfff2c4, 0x8fe8ff],
  neon: [0xff2e88, 0x2ee6f0, 0xffe14d, 0x7cff6b, 0xb66bff, 0xff7a2e],
  container: [0xc0392b, 0x2471a3, 0x1e8449, 0xd4ac0d, 0x7d3c98, 0xca6f1e],
  crane: 0xe0782f,
  warning: 0xff3030,
  warehouse: 0x55506b,
  roof: 0x3b3750,
  strip: 0xb8ac80,
  depotInside: 0x06070d,
};

scenerySets.register({
  id: 'harbour',
  trunk: 0x3a3550,
  canopy: 0x2d4a5a,
  rock: 0x4b5163,
  hill: 0x1e2236,
  seats: 0x2a9df4,
  roof: 0xff2e88,
});

const BUILDING_COUNT = 90;
const CONTAINER_COUNT = 110;
const CRANE_Z = [-110, -35, 40, 115, 190];
/** The quay's edge (world x): harbour water beyond it. */
const QUAY_X = -16;
/** The container yard, north of the city (world x, z). */
const YARD = { x0: 30, x1: 250, z0: -190, z1: -45 };

const flat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const glowing = () => new THREE.MeshBasicMaterial({ toneMapped: false });

function pick<T>(list: readonly T[], rand: () => number): T {
  const value = list[Math.floor(rand() * list.length)] ?? list[0];
  if (value === undefined) throw new Error('pick from an empty list');
  return value;
}

/** Whether (x, z) is on the water, in the container yard, or under the warehouse or a depot. */
function reserved(x: number, z: number): boolean {
  const { warehouse, canal } = NEON_HARBOUR;
  if (depotSpots().some((d) => Math.abs(x - d.x) < DEPOT_H.width / 2 + 14 && d.near(z)))
    return true;
  if (x < QUAY_X + 4) return true;
  if (x > 225 && z > canal.z0 - 8 && z < canal.z1 + 8) return true;
  if (
    x > warehouse.x0 - 12 &&
    x < warehouse.x1 + 12 &&
    z > warehouse.z0 - 12 &&
    z < warehouse.z1 + 20
  )
    return true;
  return x > YARD.x0 && x < YARD.x1 && z > YARD.z0 && z < YARD.z1;
}

/** A soft round glow texture, for light on wet ground and water. */
let glowTexture: THREE.Texture | undefined;
function glow(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/** Instanced flat glows lying on the ground (reflections), each with its own colour. One draw. */
function glows(
  spots: { x: number; y: number; z: number; w: number; l: number; angle: number; colour: number }[],
) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: glow(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    Math.max(1, spots.length),
  );
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  spots.forEach((spot, i) => {
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(0, spot.angle, 0);
    dummy.scale.set(spot.w, 1, spot.l);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, colour.set(spot.colour));
  });
  mesh.count = spots.length;
  mesh.renderOrder = 1;
  return mesh;
}

/**
 * Neon Harbour's scenery (MK-60): harbour water and the canal, cranes on the quay, the container
 * yard, city blocks with lit windows and neon signs (instanced, unlit), gateways over the city
 * street, the bridge's piers, the warehouse, light pooling on the wet streets and the water, the
 * moon and stars. Under 20 draws.
 */
function scenery(geometry: TrackGeometry): THREE.Object3D {
  const group = new THREE.Group();
  const rand = random(geometry.samples.length * 7919);
  const bounds = new THREE.Box3();
  for (const s of geometry.samples) bounds.expandByPoint(new THREE.Vector3(s.x, s.y, s.z));

  group.add(water());
  const signs: Sign[] = [];
  group.add(buildings(geometry, bounds, rand, signs));
  gateways(signs);
  warehouseSigns(signs);
  depotSigns(signs);
  group.add(neonSigns(signs));
  group.add(containers(geometry, rand));
  group.add(cranes());
  group.add(bridgePiers(geometry));
  group.add(warehouse(), depots());
  group.add(wetStreets(geometry, rand), waterReflections(rand));
  group.add(sky());
  return group;
}

/** The harbour west of the quay and the canal under the bridge: one flat, dark, glossy sheet. */
function water(): THREE.Object3D {
  const { canal } = NEON_HARBOUR;
  const merged = mergeGeometries([
    new THREE.PlaneGeometry(700, 900).rotateX(-Math.PI / 2).translate(QUAY_X - 350, 0, 50),
    new THREE.PlaneGeometry(320, canal.z1 - canal.z0)
      .rotateX(-Math.PI / 2)
      .translate(380, 0, (canal.z0 + canal.z1) / 2),
  ]);
  if (!merged) throw new Error('Neon Harbour water: geometries do not merge');
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshLambertMaterial({
      color: COLOURS.water,
      emissive: 0x050a1c,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  mesh.position.y = -0.02;
  return mesh;
}

interface Sign {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  angle: number;
  colour: number;
}

/**
 * City blocks: boxes of every height on both sides of the city street and round the infield, with
 * a skyline further out. Lit windows on the faces that look at the track; neon signs on some.
 */
function buildings(
  geometry: TrackGeometry,
  bounds: THREE.Box3,
  rand: () => number,
  signs: Sign[],
): THREE.Object3D {
  const group = new THREE.Group();
  const boxes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    flat(0xffffff),
    BUILDING_COUNT,
  );
  const windowSpots: { x: number; y: number; z: number; angle: number; colour: number }[] = [];
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  let count = 0;
  for (let attempt = 0; attempt < BUILDING_COUNT * 12 && count < BUILDING_COUNT; attempt += 1) {
    const x = THREE.MathUtils.lerp(bounds.min.x - 80, bounds.max.x + 120, rand());
    const z = THREE.MathUtils.lerp(bounds.min.z - 60, bounds.max.z + 120, rand());
    const w = 12 + rand() * 14;
    const d = 12 + rand() * 12;
    if (reserved(x, z)) continue;
    // Every corner (and the middle) clear of the road, walls and shortcut.
    const corners = [
      [0, 0],
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ] as const;
    if (!corners.every(([cx, cz]) => clearOfTrack(geometry, x + cx, z + cz))) continue;
    const p = geometry.project({ x, y: 0, z });
    const near = Math.abs(p.lateral) < 45;
    const h = near ? 10 + rand() * 22 : 25 + rand() * 45;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    boxes.setMatrixAt(count, dummy.matrix);
    boxes.setColorAt(count, colour.set(pick(COLOURS.building, rand)));
    count += 1;
    // Windows on the face towards the track, in a grid, about half of them lit.
    const nearest = geometry.pointAt(p.t);
    const faceX = Math.abs(nearest.x - x) > Math.abs(nearest.z - z);
    const toward = Math.sign(faceX ? nearest.x - x : nearest.z - z) || 1;
    const faceSpan = faceX ? d : w;
    const faceOut = (faceX ? w : d) / 2 + 0.05;
    for (let row = 3; row < h - 2; row += 3.2) {
      for (let col = -faceSpan / 2 + 2; col < faceSpan / 2 - 1.5; col += 2.6) {
        if (rand() < 0.45) continue;
        windowSpots.push(
          faceX
            ? {
                x: x + toward * faceOut,
                y: row,
                z: z + col,
                angle: Math.PI / 2,
                colour: pick(COLOURS.window, rand),
              }
            : {
                x: x + col,
                y: row,
                z: z + toward * faceOut,
                angle: 0,
                colour: pick(COLOURS.window, rand),
              },
        );
      }
    }
    // A neon sign on some of the near ones, on the same face.
    if (near && rand() < 0.7) {
      const vertical = rand() < 0.5;
      const sw = vertical ? 1.4 : 5 + rand() * 4;
      const sh = vertical ? 5 + rand() * 5 : 1.4;
      const along = (rand() - 0.5) * (faceSpan - sw - 2);
      const y = Math.min(h - sh / 2 - 1, 6 + rand() * 8);
      signs.push(
        faceX
          ? {
              x: x + toward * (faceOut + 0.2),
              y,
              z: z + along,
              w: sw,
              h: sh,
              angle: Math.PI / 2,
              colour: pick(COLOURS.neon, rand),
            }
          : {
              x: x + along,
              y,
              z: z + toward * (faceOut + 0.2),
              w: sw,
              h: sh,
              angle: 0,
              colour: pick(COLOURS.neon, rand),
            },
      );
    }
  }
  boxes.count = count;
  group.add(boxes);

  const windows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.2, 1.6),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }),
    Math.max(1, windowSpots.length),
  );
  windowSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(0, spot.angle, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    windows.setMatrixAt(i, dummy.matrix);
    windows.setColorAt(i, colour.set(spot.colour));
  });
  windows.count = windowSpots.length;
  group.add(windows);
  return group;
}

/** Neon gateways over the city street at both ends, where the traffic comes and goes. */
function gateways(signs: Sign[]): void {
  const { city, trafficX } = NEON_HARBOUR;
  for (const [x, colour] of [
    [trafficX.sink + 3, COLOURS.neon[0] ?? 0xff2e88],
    [trafficX.rise - 3, COLOURS.neon[1] ?? 0x2ee6f0],
  ] as const) {
    // Two posts outside the walls and a glowing beam across the street.
    for (const side of [-1, 1]) {
      signs.push({
        x,
        y: 4.5,
        z: city.z + side * 14.5,
        w: 0.8,
        h: 9,
        angle: Math.PI / 2,
        colour: 0x1c1f2e,
      });
    }
    signs.push({ x, y: 8.5, z: city.z, w: 30, h: 1.2, angle: Math.PI / 2, colour });
    signs.push({
      x,
      y: 7.3,
      z: city.z,
      w: 18,
      h: 0.4,
      angle: Math.PI / 2,
      colour: COLOURS.neon[2] ?? 0xffe14d,
    });
  }
}

/** The warehouse's name in lights over each door. */
function warehouseSigns(signs: Sign[]): void {
  const { warehouse } = NEON_HARBOUR;
  const z = (warehouse.cutZ0 + warehouse.cutZ1) / 2;
  for (const x of [warehouse.x0 - 0.3, warehouse.x1 + 0.3]) {
    signs.push({
      x,
      y: 7.2,
      z,
      w: 12,
      h: 1.3,
      angle: Math.PI / 2,
      colour: COLOURS.neon[2] ?? 0xffe14d,
    });
  }
}

/** Every neon sign in one instanced draw: thin glowing panels, unlit (no real lights). */
function neonSigns(signs: Sign[]): THREE.Object3D {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 0.25),
    glowing(),
    Math.max(1, signs.length),
  );
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  signs.forEach((sign, i) => {
    dummy.position.set(sign.x, sign.y, sign.z);
    dummy.rotation.set(0, sign.angle, 0);
    dummy.scale.set(sign.w, sign.h, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, colour.set(sign.colour));
  });
  mesh.count = signs.length;
  return mesh;
}

/** Shipping containers stacked 1–3 high round the zig-zag and along the quay. One draw. */
function containers(geometry: TrackGeometry, rand: () => number): THREE.Object3D {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(12, 2.6, 2.5).translate(0, 1.3, 0),
    flat(0xffffff),
    CONTAINER_COUNT,
  );
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  let count = 0;
  for (let attempt = 0; attempt < CONTAINER_COUNT * 10 && count < CONTAINER_COUNT; attempt += 1) {
    const x = THREE.MathUtils.lerp(YARD.x0 - 20, YARD.x1 + 10, rand());
    const z = THREE.MathUtils.lerp(YARD.z0, YARD.z1 + 10, rand());
    const angle = rand() < 0.8 ? 0 : Math.PI / 2;
    const ends =
      angle === 0
        ? [
            [-6.5, 0],
            [6.5, 0],
            [-6.5, 1.4],
            [6.5, -1.4],
          ]
        : [
            [0, -6.5],
            [0, 6.5],
          ];
    if (!ends.every(([dx, dz]) => clearOfTrack(geometry, x + (dx ?? 0), z + (dz ?? 0)))) continue;
    const high = 1 + Math.floor(rand() * 3);
    for (let level = 0; level < high && count < CONTAINER_COUNT; level += 1) {
      dummy.position.set(x, level * 2.6, z);
      dummy.rotation.set(0, angle + (rand() - 0.5) * 0.04, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(count, dummy.matrix);
      mesh.setColorAt(count, colour.set(pick(COLOURS.container, rand)));
      count += 1;
    }
  }
  mesh.count = count;
  return mesh;
}

/** A dockside crane: 4 legs astride the quay's edge, a boom out over the water. Built facing +X. */
function craneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const lx of [-5, 5]) {
    for (const lz of [-4, 4]) parts.push(new THREE.BoxGeometry(1, 22, 1).translate(lx, 11, lz));
  }
  parts.push(new THREE.BoxGeometry(11, 1.2, 1).translate(0, 16, -4));
  parts.push(new THREE.BoxGeometry(11, 1.2, 1).translate(0, 16, 4));
  parts.push(new THREE.BoxGeometry(12, 3, 10).translate(0, 23.5, 0));
  // The boom: long over the water (−X), a short counterweight arm inland.
  parts.push(new THREE.BoxGeometry(56, 1.6, 2.4).translate(-16, 25.8, 0));
  parts.push(new THREE.BoxGeometry(5, 3, 4).translate(10, 24, 0));
  // The cable and hook block hanging from the boom's tip.
  parts.push(new THREE.BoxGeometry(0.2, 12, 0.2).translate(-38, 19, 0));
  parts.push(new THREE.BoxGeometry(1.5, 1, 1.5).translate(-38, 12.5, 0));
  for (const part of parts) part.deleteAttribute('uv');
  const merged = mergeGeometries(parts.map((part) => part.toNonIndexed()));
  if (!merged) throw new Error('Neon Harbour crane: geometries do not merge');
  return merged;
}

/** Cranes along the quay (one draw) with red warning lights on top (one more). */
function cranes(): THREE.Object3D {
  const group = new THREE.Group();
  const body = new THREE.InstancedMesh(craneGeometry(), flat(COLOURS.crane), CRANE_Z.length);
  const lights = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.6, 8, 6),
    new THREE.MeshBasicMaterial({ color: COLOURS.warning, toneMapped: false }),
    CRANE_Z.length * 2,
  );
  const dummy = new THREE.Object3D();
  CRANE_Z.forEach((z, i) => {
    dummy.position.set(QUAY_X - 6, 0, z);
    dummy.updateMatrix();
    body.setMatrixAt(i, dummy.matrix);
    for (const [j, lx, ly] of [
      [0, -44, 27],
      [1, 0, 25.5],
    ] as const) {
      dummy.position.set(QUAY_X - 6 + lx, ly, z);
      dummy.updateMatrix();
      lights.setMatrixAt(i * 2 + j, dummy.matrix);
    }
  });
  group.add(body, lights);
  return group;
}

/** Concrete piers under the bridge (and its approaches), both sides, every few metres. One draw. */
function bridgePiers(geometry: TrackGeometry): THREE.Object3D {
  const spots: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const every = 10;
  for (let i = 0; i < geometry.samples.length; i += every) {
    const s = geometry.sample(i);
    if (s.y < 0.8) continue;
    for (const side of [-1, 1]) {
      const lateral = side * (geometry.wallOffset(s.width) - 0.5);
      dummy.position.set(s.x + s.nx * lateral, 0, s.z + s.nz * lateral);
      dummy.scale.set(1.4, s.y - 0.3, 1.4);
      dummy.rotation.set(0, Math.atan2(-s.tx, -s.tz), 0);
      dummy.updateMatrix();
      spots.push(dummy.matrix.clone());
    }
    // A deck under the road between the two piers, low enough not to poke through where it slopes.
    dummy.position.set(s.x, s.y - 1.6, s.z);
    dummy.scale.set(geometry.wallOffset(s.width) * 2, 0.8, every * 1.05);
    dummy.updateMatrix();
    spots.push(dummy.matrix.clone());
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    flat(COLOURS.concrete),
    Math.max(1, spots.length),
  );
  spots.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = spots.length;
  return mesh;
}

/** The warehouse's walls and roof are this high, m; its doors this high. */
const WAREHOUSE_H = { walls: 10, doors: 7 };

/**
 * The warehouse inside the U-turn: walls, a roof, and a corridor straight through it (the
 * shortcut), with open doors both ends and strip lights along its ceiling.
 */
function warehouse(): THREE.Object3D {
  const { warehouse: w } = NEON_HARBOUR;
  const H = WAREHOUSE_H.walls;
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate(
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      (z0 + z1) / 2,
    );
  const t = 0.6;
  const parts = [
    // North and south walls.
    box(w.x0, w.x1, 0, H, w.z0 - t, w.z0),
    box(w.x0, w.x1, 0, H, w.z1, w.z1 + t),
    // East and west walls either side of the doors, and above them.
    ...[w.x0 - t, w.x1].flatMap((x) => [
      box(x, x + t, 0, H, w.z0, w.cutZ0),
      box(x, x + t, 0, H, w.cutZ1, w.z1),
      box(x, x + t, WAREHOUSE_H.doors, H, w.cutZ0, w.cutZ1),
    ]),
    // The corridor's walls inside.
    box(w.x0, w.x1, 0, WAREHOUSE_H.doors, w.cutZ0 - t, w.cutZ0),
    box(w.x0, w.x1, 0, WAREHOUSE_H.doors, w.cutZ1, w.cutZ1 + t),
    // The corridor's ceiling, and the pitched-ish roof over it all.
    box(w.x0, w.x1, WAREHOUSE_H.doors, WAREHOUSE_H.doors + 0.3, w.cutZ0, w.cutZ1),
    box(w.x0 - 1, w.x1 + 1, H, H + 0.5, w.z0 - 1, w.z1 + 1),
  ];
  const shell = mergeGeometries(parts.map((part) => part.toNonIndexed()));
  if (!shell) throw new Error('Neon Harbour warehouse: geometries do not merge');
  const group = new THREE.Group();
  group.add(new THREE.Mesh(shell, flat(COLOURS.warehouse)));
  // Strip lights down the corridor's ceiling.
  const strips = mergeGeometries(
    [-3, 3].map((dz) =>
      box(
        w.x0 + 1,
        w.x1 - 1,
        WAREHOUSE_H.doors - 0.15,
        WAREHOUSE_H.doors,
        (w.cutZ0 + w.cutZ1) / 2 + dz - 0.2,
        (w.cutZ0 + w.cutZ1) / 2 + dz + 0.2,
      ).toNonIndexed(),
    ),
  );
  if (strips)
    group.add(
      new THREE.Mesh(
        strips,
        new THREE.MeshBasicMaterial({ color: COLOURS.strip, toneMapped: false }),
      ),
    );
  return group;
}

/** The traffic depots (MK-60 QA round 2): garage size, m (the door is `NEON_HARBOUR.depot`). */
const DEPOT_H = { walls: 8, door: 5, width: 20, back: 4 };

/**
 * The two depots the traffic comes out of and goes into: at the end of a side street off the city
 * street, north of it at the west end and south of it at the east end. `sign` is which way from
 * the street the depot lies (−1 north, +1 south); `door` is the door's world z, `back` its back
 * wall's.
 */
function depotSpots() {
  const { city, trafficX, depot } = NEON_HARBOUR;
  return (
    [
      [trafficX.rise, -1],
      [trafficX.sink, 1],
    ] as const
  ).map(([x, sign]) => {
    const door = city.z + sign * depot.door;
    const back = city.z + sign * (depot.door + depot.inside + DEPOT_H.back);
    return {
      x,
      sign,
      door,
      back,
      near: (z: number) => (z - door) * sign > -4 && (z - back) * sign < 10,
    };
  });
}

/**
 * The depots: a garage each, with a wide door facing the side street and a dark inside, so the
 * vehicles pull out of (and into) the dark with their headlights on. One draw for the shells, one
 * for the insides.
 */
function depots(): THREE.Object3D {
  const { depot } = NEON_HARBOUR;
  const H = DEPOT_H.walls;
  const t = 0.6;
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    new THREE.BoxGeometry(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0))
      .translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      .toNonIndexed();
  const shells: THREE.BufferGeometry[] = [];
  const insides: THREE.BufferGeometry[] = [];
  for (const { x, door, back } of depotSpots()) {
    const half = DEPOT_H.width / 2;
    const gap = depot.doorWidth / 2 + 0.5;
    shells.push(
      // The front either side of the door, and above it.
      box(x - half, x - gap, 0, H, door, door + Math.sign(back - door) * t),
      box(x + gap, x + half, 0, H, door, door + Math.sign(back - door) * t),
      box(x - gap, x + gap, DEPOT_H.door, H, door, door + Math.sign(back - door) * t),
      // The side walls, the back wall and the roof.
      box(x - half, x - half + t, 0, H, door, back),
      box(x + half - t, x + half, 0, H, door, back),
      box(x - half, x + half, 0, H, back, back - Math.sign(back - door) * t),
      box(x - half - 0.5, x + half + 0.5, H, H + 0.5, door, back),
    );
    // The dark inside: a lining just inside the walls and under the roof.
    const s = Math.sign(back - door);
    insides.push(
      box(x - half + t, x + half - t, 0.02, 0.06, door + s * t, back - s * t),
      box(x - half + t, x + half - t, H - 0.3, H - 0.25, door + s * t, back - s * t),
      box(x - half + t, x + half - t, 0, H, back - s * (t + 0.05), back - s * t),
      box(x - half + t, x - half + t + 0.05, 0, H, door + s * t, back - s * t),
      box(x + half - t - 0.05, x + half - t, 0, H, door + s * t, back - s * t),
    );
  }
  const group = new THREE.Group();
  const shell = mergeGeometries(shells);
  const inside = mergeGeometries(insides);
  if (!shell || !inside) throw new Error('Neon Harbour depots: geometries do not merge');
  group.add(new THREE.Mesh(shell, flat(COLOURS.warehouse)));
  group.add(new THREE.Mesh(inside, new THREE.MeshBasicMaterial({ color: COLOURS.depotInside })));
  return group;
}

/** A neon strip over each depot door, and a sign above it. */
function depotSigns(signs: Sign[]): void {
  const { depot } = NEON_HARBOUR;
  depotSpots().forEach(({ x, door, sign }, i) => {
    const front = door - sign * 0.35;
    signs.push(
      {
        x,
        y: DEPOT_H.door + 0.3,
        z: front,
        w: depot.doorWidth + 1,
        h: 0.35,
        angle: 0,
        colour: COLOURS.neon[i % 2 ? 0 : 1] ?? 0x2ee6f0,
      },
      {
        x,
        y: DEPOT_H.walls - 1.2,
        z: front,
        w: 8,
        h: 1.4,
        angle: 0,
        colour: COLOURS.neon[2] ?? 0xffe14d,
      },
    );
  });
}

/**
 * The wet streets: warm pools of light on the road under the lamp posts (every 24 m, both sides,
 * where the night theme puts them) and neon colour on the city street. One draw.
 */
function wetStreets(geometry: TrackGeometry, rand: () => number): THREE.Object3D {
  const spots: Parameters<typeof glows>[0] = [];
  const every = 24;
  for (let d = 0; d < geometry.length; d += every) {
    const t = d / geometry.length;
    const centre = geometry.pointAt(t);
    const width = geometry.project(centre).width;
    const angle = geometry.headingAt(t);
    for (const side of [-1, 1]) {
      const p = geometry.pointAt(t, side * (width / 2 - 1.5));
      spots.push({ x: p.x, y: p.y + 0.05, z: p.z, w: 5, l: 9, angle, colour: 0x6a5a3a });
    }
  }
  // Neon streaks on the city street, off the signs either side.
  const { city } = NEON_HARBOUR;
  for (let x = city.west + 6; x < city.east - 4; x += 9) {
    for (const side of [-1, 1]) {
      spots.push({
        x: x + rand() * 4,
        y: 0.06,
        z: city.z + side * (4 + rand() * 3),
        w: 7,
        l: 1.8,
        angle: 0,
        colour: new THREE.Color(pick(COLOURS.neon, rand)).multiplyScalar(0.25).getHex(),
      });
    }
  }
  return glows(spots);
}

/** Lights on the water: long streaks under the cranes' lights and the city's signs. One draw. */
function waterReflections(rand: () => number): THREE.Object3D {
  const spots: Parameters<typeof glows>[0] = [];
  for (const z of CRANE_Z) {
    spots.push({ x: QUAY_X - 50, y: 0.02, z, w: 2, l: 18, angle: Math.PI / 2, colour: 0x802020 });
  }
  for (let i = 0; i < 40; i += 1) {
    spots.push({
      x: QUAY_X - 8 - rand() * 60,
      y: 0.02,
      z: -150 + rand() * 360,
      w: 1.5 + rand() * 1.5,
      l: 10 + rand() * 14,
      angle: Math.PI / 2,
      colour: new THREE.Color(pick(COLOURS.neon, rand)).multiplyScalar(0.4).getHex(),
    });
  }
  // The bridge's lamps on the canal.
  const { canal } = NEON_HARBOUR;
  for (const x of [240, 292]) {
    spots.push({
      x,
      y: 0.02,
      z: (canal.z0 + canal.z1) / 2,
      w: 2,
      l: 16,
      angle: Math.PI / 2,
      colour: 0x5a4a30,
    });
  }
  return glows(spots);
}

/** Stars and a moon, beyond the fog. Two draws. */
function sky(): THREE.Object3D {
  const group = new THREE.Group();
  const count = 400;
  const positions = new Float32Array(count * 3);
  const rand = random(4242);
  for (let i = 0; i < count; i += 1) {
    const a = rand() * Math.PI * 2;
    const up = 0.12 + rand() * 0.85;
    const r = 800;
    positions.set(
      [Math.cos(a) * r * Math.cos(up), r * Math.sin(up), Math.sin(a) * r * Math.cos(up)],
      i * 3,
    );
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    stars,
    new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2, sizeAttenuation: false, fog: false }),
  );
  points.frustumCulled = false;
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(18, 24),
    new THREE.MeshBasicMaterial({ color: 0xf4f1dc, fog: false, toneMapped: false }),
  );
  moon.position.set(-600, 260, -420);
  moon.lookAt(0, 0, 0);
  group.add(points, moon);
  return group;
}

export default {
  id: 'neon-harbour',
  scenery,
} satisfies TrackView;
