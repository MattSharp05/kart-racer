import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clearOfTrack, random, scenerySets } from '../../../render/scenery';
import type { TrackGeometry } from '../../../sim/splineTrack';
import { DT, tuning } from '../../../sim/tuning';
import type { TrackView } from '../render';
import { BELTS, COG_WORKS } from './sim';

const COLOURS = {
  hall: 0x3b2a20,
  brick: [0x5a3526, 0x6b3f2c, 0x4d2e22],
  brass: 0xc8962e,
  copper: 0xb0643a,
  iron: [0x4a4642, 0x5e5a56, 0x3a3734],
  girder: 0x2e2a26,
  lamp: 0xffd08a,
  furnace: 0xff6a1a,
  furnaceHot: 0xffd24a,
  grate: 0x3c3a38,
  hazardYellow: 0xf2c230,
  forward: 0x5dff7a,
  backward: 0xff4a36,
  steam: 0xf0ebe4,
};

scenerySets.register({
  id: 'factory',
  trunk: 0x4a4038,
  canopy: 0xc8962e,
  rock: 0x5e5a56,
  hill: 0x3b2a20,
  seats: 0x8a5a2e,
  roof: 0xb0643a,
});

/** The hall's walls stand this far outside the track's bounds, and this tall, m. */
const HALL = { margin: 70, height: 60 };
const WALL_GEARS = 16;
const MACHINES = 70;
const VENTS = 14;
const PUFFS_PER_VENT = 5;
const LAMP_SPACING = 30;
const GIRDER_SPACING = 48;
/** Steam rises this high over a puff's life, s. */
const STEAM = { rise: 11, life: 2.6, size: 1.2, grow: 2.4 };
/** Chevrons painted on the belts every this many m, moving with the belt. */
const CHEVRON_STEP = 3.2;
/** The turntable gear turns this fast, rad/s; the wall gears this fast (alternating ways). */
const TURNTABLE_SPIN = 0.18;
const GEAR_SPIN = 0.35;

const flat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const glowing = (color: number) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

/** A cog: a disc with square teeth round its rim and a hole-less hub, axis along Y, centred. */
function gearGeometry(radius: number, thickness: number, teeth: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(radius, radius, thickness, Math.max(12, teeth)),
    new THREE.CylinderGeometry(radius * 0.25, radius * 0.25, thickness * 1.6, 10),
  ];
  const tooth = radius * 0.16;
  for (let i = 0; i < teeth; i += 1) {
    const a = (i / teeth) * Math.PI * 2;
    parts.push(
      new THREE.BoxGeometry(tooth, thickness, tooth * 1.1)
        .translate(radius + tooth * 0.4, 0, 0)
        .rotateY(a),
    );
  }
  const geometry = mergeGeometries(parts.map((g) => g.toNonIndexed().deleteAttribute('uv')));
  if (!geometry) throw new Error('Cog Works: gear geometries do not merge');
  return geometry;
}

/** The track's XZ bounds. */
function trackBounds(geometry: TrackGeometry): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const s of geometry.samples) bounds.expandByPoint(new THREE.Vector3(s.x, 0, s.z));
  return bounds;
}

/** Whether (x, z) is kept clear of machinery: the furnace, the turntable, the catwalk. */
function reserved(x: number, z: number): boolean {
  const { turntable, backZ, catwalk } = COG_WORKS;
  if (Math.hypot(x - turntable.x, z - turntable.z) < turntable.radius) return true;
  return x > catwalk.x1 - 20 && x < catwalk.x0 + 20 && z > backZ - 20 && z < backZ + 75;
}

/** The hall: brick walls all round, and girders across the roof space. Two draws. */
function hall(geometry: TrackGeometry, bounds: THREE.Box3, dummy: THREE.Object3D): THREE.Group {
  const group = new THREE.Group();
  const x0 = bounds.min.x - HALL.margin;
  const x1 = bounds.max.x + HALL.margin;
  const z0 = bounds.min.z - HALL.margin;
  const z1 = bounds.max.z + HALL.margin;
  const h = HALL.height;
  const walls = mergeGeometries(
    [
      new THREE.BoxGeometry(x1 - x0, h, 4).translate((x0 + x1) / 2, h / 2, z0),
      new THREE.BoxGeometry(x1 - x0, h, 4).translate((x0 + x1) / 2, h / 2, z1),
      new THREE.BoxGeometry(4, h, z1 - z0).translate(x0, h / 2, (z0 + z1) / 2),
      new THREE.BoxGeometry(4, h, z1 - z0).translate(x1, h / 2, (z0 + z1) / 2),
    ].map((g) => g.toNonIndexed().deleteAttribute('uv')),
  );
  if (!walls) throw new Error('Cog Works: walls do not merge');
  group.add(new THREE.Mesh(walls, flat(COLOURS.hall)));

  // Girders across the track high overhead, every so often along it.
  const count = Math.floor(geometry.length / GIRDER_SPACING);
  const girders = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1.4, 1.2),
    flat(COLOURS.girder),
    count,
  );
  for (let i = 0; i < count; i += 1) {
    const s = geometry.sample(Math.floor((i * geometry.samples.length) / count));
    dummy.position.set(s.x, 24, s.z);
    dummy.rotation.set(0, Math.atan2(s.nx, s.nz), 0);
    dummy.scale.set(1, 1, geometry.wallOffset(s.width) * 2 + 30);
    dummy.updateMatrix();
    girders.setMatrixAt(i, dummy.matrix);
  }
  dummy.scale.set(1, 1, 1);
  group.add(girders);
  return group;
}

/** Big brass gears standing against the hall walls, turning (moved by `update`). One draw. */
function wallGears(bounds: THREE.Box3, rand: () => number): THREE.InstancedMesh {
  const gears = new THREE.InstancedMesh(gearGeometry(1, 0.25, 14), flat(COLOURS.brass), WALL_GEARS);
  const spots: { x: number; y: number; z: number; face: number; radius: number }[] = [];
  const x0 = bounds.min.x - HALL.margin + 3;
  const x1 = bounds.max.x + HALL.margin - 3;
  const z0 = bounds.min.z - HALL.margin + 3;
  const z1 = bounds.max.z + HALL.margin - 3;
  for (let i = 0; i < WALL_GEARS; i += 1) {
    const wall = i % 4;
    const f = (Math.floor(i / 4) + 0.3 + rand() * 0.4) / (WALL_GEARS / 4);
    const radius = 7 + rand() * 9;
    const y = radius + 2 + rand() * 18;
    if (wall === 0) spots.push({ x: x0 + (x1 - x0) * f, y, z: z0, face: 0, radius });
    else if (wall === 1) spots.push({ x: x0 + (x1 - x0) * f, y, z: z1, face: Math.PI, radius });
    else if (wall === 2) spots.push({ x: x0, y, z: z0 + (z1 - z0) * f, face: Math.PI / 2, radius });
    else spots.push({ x: x1, y, z: z0 + (z1 - z0) * f, face: -Math.PI / 2, radius });
  }
  gears.userData.spots = spots;
  gears.frustumCulled = false;
  return gears;
}

/** The turntable: a giant gear turning flat in the hairpin's infield, with its hub. Two draws. */
function turntable(): THREE.Group {
  const { turntable: centre } = COG_WORKS;
  const group = new THREE.Group();
  const radius = centre.radius - COG_WORKS.roadWidth / 2 - 8;
  const gear = new THREE.Mesh(gearGeometry(radius, 0.6, 36), flat(COLOURS.brass));
  gear.position.set(centre.x, 0.1, centre.z);
  gear.name = 'turntable';
  const hub = new THREE.Mesh(
    mergeGeometries(
      [
        new THREE.CylinderGeometry(4, 5, 6, 12).translate(0, 3, 0),
        new THREE.CylinderGeometry(1.4, 1.4, 14, 10).translate(0, 10, 0),
        new THREE.BoxGeometry(radius * 1.6, 1, 1.6).translate(0, 16, 0),
      ].map((g) => g.toNonIndexed().deleteAttribute('uv')),
    ) ?? new THREE.BoxGeometry(1, 1, 1),
    flat(COLOURS.iron[1] ?? 0x5e5a56),
  );
  hub.position.set(centre.x, 0, centre.z);
  hub.name = 'turntable-hub';
  group.add(gear, hub);
  return group;
}

/** Machinery blocks, pipes and boilers scattered round the hall, clear of the track. One draw. */
function machinery(
  geometry: TrackGeometry,
  bounds: THREE.Box3,
  rand: () => number,
  dummy: THREE.Object3D,
): THREE.InstancedMesh {
  const blocks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    flat(0xffffff),
    MACHINES,
  );
  const colour = new THREE.Color();
  const palette = [...COLOURS.iron, ...COLOURS.brick, COLOURS.copper];
  let count = 0;
  for (let attempt = 0; attempt < MACHINES * 12 && count < MACHINES; attempt += 1) {
    const x = THREE.MathUtils.lerp(
      bounds.min.x - HALL.margin + 8,
      bounds.max.x + HALL.margin - 8,
      rand(),
    );
    const z = THREE.MathUtils.lerp(
      bounds.min.z - HALL.margin + 8,
      bounds.max.z + HALL.margin - 8,
      rand(),
    );
    const w = 5 + rand() * 10;
    const d = 5 + rand() * 10;
    if (reserved(x, z) || !clearOfTrack(geometry, x, z)) continue;
    if (
      !clearOfTrack(geometry, x + w / 2, z + d / 2) ||
      !clearOfTrack(geometry, x - w / 2, z - d / 2)
    )
      continue;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(w, 3 + rand() * 12, d);
    dummy.updateMatrix();
    blocks.setMatrixAt(count, dummy.matrix);
    blocks.setColorAt(
      count,
      colour.setHex(palette[Math.floor(rand() * palette.length)] ?? 0x4a4642),
    );
    count += 1;
  }
  blocks.count = count;
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
  return blocks;
}

/** Copper pipes running along the hall's walls and up into the roof. One draw. */
function pipes(bounds: THREE.Box3): THREE.Mesh {
  const x0 = bounds.min.x - HALL.margin + 2;
  const x1 = bounds.max.x + HALL.margin - 2;
  const z0 = bounds.min.z - HALL.margin + 2;
  const z1 = bounds.max.z + HALL.margin - 2;
  const parts: THREE.BufferGeometry[] = [];
  for (const [y, r] of [
    [6, 1.2],
    [11, 0.8],
    [34, 1.6],
  ] as const) {
    parts.push(
      new THREE.CylinderGeometry(r, r, x1 - x0, 8)
        .rotateZ(Math.PI / 2)
        .translate((x0 + x1) / 2, y, z0),
      new THREE.CylinderGeometry(r, r, x1 - x0, 8)
        .rotateZ(Math.PI / 2)
        .translate((x0 + x1) / 2, y, z1),
      new THREE.CylinderGeometry(r, r, z1 - z0, 8)
        .rotateX(Math.PI / 2)
        .translate(x0, y, (z0 + z1) / 2),
      new THREE.CylinderGeometry(r, r, z1 - z0, 8)
        .rotateX(Math.PI / 2)
        .translate(x1, y, (z0 + z1) / 2),
    );
  }
  for (let i = 0; i < 10; i += 1) {
    const f = (i + 0.5) / 10;
    parts.push(
      new THREE.CylinderGeometry(1, 1, HALL.height, 8).translate(
        x0 + (x1 - x0) * f,
        HALL.height / 2,
        z0,
      ),
      new THREE.CylinderGeometry(1, 1, HALL.height, 8).translate(
        x0 + (x1 - x0) * f,
        HALL.height / 2,
        z1,
      ),
    );
  }
  const geometry = mergeGeometries(parts.map((g) => g.toNonIndexed().deleteAttribute('uv')));
  if (!geometry) throw new Error('Cog Works: pipes do not merge');
  return new THREE.Mesh(geometry, flat(COLOURS.copper));
}

/**
 * The furnace: a glowing pit inside the detour loop (under the catwalk and either side of it), a
 * brick furnace with a glowing mouth beyond the detour, and the catwalk's iron grating with yellow
 * edges. Three draws.
 */
function furnace(geometry: TrackGeometry): THREE.Group {
  const group = new THREE.Group();
  const { detour, backZ, catwalk, catwalkFloor } = COG_WORKS;
  // The pit's outline: along the detour just inside its walls, then back across north of the catwalk.
  const outline: THREE.Vector2[] = [];
  const n = geometry.samples.length;
  const i0 = Math.round(detour.from * n);
  const i1 = Math.round(detour.to * n);
  for (let i = i0; i <= i1; i += 3) {
    const s = geometry.sample(i);
    const inset = geometry.wallOffset(s.width) + 1.5;
    // The furnace is on the loop's right, between it and the catwalk.
    const x = s.x + s.nx * inset;
    const z = s.z + s.nz * inset;
    if (z > backZ + 6) outline.push(new THREE.Vector2(x, z));
  }
  outline.push(
    new THREE.Vector2(catwalk.x1 + 16, backZ + 6),
    new THREE.Vector2(catwalk.x1 + 22, backZ - 12),
    new THREE.Vector2(catwalk.x0 - 22, backZ - 12),
    new THREE.Vector2(catwalk.x0 - 16, backZ + 6),
  );
  const shape = THREE.ShapeUtils.triangulateShape(outline, []);
  const positions: number[] = [];
  const colours: number[] = [];
  const hot = new THREE.Color(COLOURS.furnaceHot);
  const warm = new THREE.Color(COLOURS.furnace);
  const middle = new THREE.Vector2((catwalk.x0 + catwalk.x1) / 2, backZ + 24);
  const colour = new THREE.Color();
  for (const tri of shape) {
    for (const index of tri) {
      const v = outline[index];
      if (!v) continue;
      positions.push(v.x, -0.02, v.y);
      const f = Math.min(1, v.distanceTo(middle) / 60);
      colour.copy(hot).lerp(warm, f);
      colours.push(colour.r, colour.g, colour.b);
    }
  }
  const pit = new THREE.BufferGeometry();
  pit.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  pit.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  group.add(
    new THREE.Mesh(
      pit,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    ),
  );

  // The catwalk's grating, with yellow edges, just above the floor the track mesh draws.
  const grate = new THREE.Shape(catwalkFloor.map((v) => new THREE.Vector2(v.x, -v.z)));
  const deck = new THREE.ShapeGeometry(grate).rotateX(-Math.PI / 2).translate(0, 0.07, 0);
  const edges: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    edges.push(
      new THREE.BoxGeometry(catwalk.x0 - catwalk.x1 - 20, 0.35, 0.5).translate(
        (catwalk.x0 + catwalk.x1) / 2,
        0.1,
        backZ + side * (catwalk.halfWidth - 0.25),
      ),
    );
  }
  group.add(
    new THREE.Mesh(
      deck,
      new THREE.MeshLambertMaterial({ color: COLOURS.grate, side: THREE.DoubleSide }),
    ),
  );
  const edgeGeometry = mergeGeometries(edges.map((g) => g.toNonIndexed().deleteAttribute('uv')));
  if (edgeGeometry) group.add(new THREE.Mesh(edgeGeometry, glowing(COLOURS.hazardYellow)));

  // The furnace itself, south of the detour: brick, with a glowing mouth facing the track.
  const bottomZ = backZ + 60 + geometry.wallOffset(16) + 18;
  const body = mergeGeometries(
    [
      new THREE.BoxGeometry(46, 22, 20).translate((catwalk.x0 + catwalk.x1) / 2, 11, bottomZ + 10),
      new THREE.CylinderGeometry(4, 5, 40, 10).translate(
        (catwalk.x0 + catwalk.x1) / 2 - 14,
        30,
        bottomZ + 14,
      ),
      new THREE.CylinderGeometry(4, 5, 40, 10).translate(
        (catwalk.x0 + catwalk.x1) / 2 + 14,
        30,
        bottomZ + 14,
      ),
    ].map((g) => g.toNonIndexed().deleteAttribute('uv')),
  );
  if (body) group.add(new THREE.Mesh(body, flat(COLOURS.brick[1] ?? 0x6b3f2c)));
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(26, 10), glowing(COLOURS.furnace));
  mouth.position.set((catwalk.x0 + catwalk.x1) / 2, 7, bottomZ - 0.1);
  mouth.rotation.y = Math.PI;
  group.add(mouth);
  return group;
}

/** Hanging lamps along both sides of the track, glowing warm. One draw. */
function lamps(geometry: TrackGeometry, dummy: THREE.Object3D): THREE.InstancedMesh {
  const count = Math.floor(geometry.length / LAMP_SPACING) * 2;
  const paint = (g: THREE.BufferGeometry, colour: number) => {
    const flatG = g.toNonIndexed().deleteAttribute('uv');
    const c = new THREE.Color(colour);
    const n = flatG.getAttribute('position').count;
    flatG.setAttribute(
      'color',
      new THREE.BufferAttribute(
        new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3] ?? 0),
        3,
      ),
    );
    flatG.deleteAttribute('normal');
    return flatG;
  };
  // A warm bulb under a dark shade, on a cable up to the roof girders.
  const lamp = mergeGeometries([
    paint(new THREE.IcosahedronGeometry(0.7, 1), COLOURS.lamp),
    paint(new THREE.ConeGeometry(1.4, 1, 10).translate(0, 0.8, 0), COLOURS.girder),
    paint(new THREE.CylinderGeometry(0.06, 0.06, 10, 4).translate(0, 6, 0), COLOURS.girder),
  ]);
  if (!lamp) throw new Error('Cog Works: lamps do not merge');
  const mesh = new THREE.InstancedMesh(
    lamp,
    new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    count,
  );
  for (let i = 0; i < count; i += 1) {
    const s = geometry.sample(Math.floor(((i >> 1) * geometry.samples.length * 2) / count));
    const side = i % 2 ? 1 : -1;
    const out = geometry.wallOffset(s.width) + 1.5;
    dummy.position.set(s.x + s.nx * side * out, 13, s.z + s.nz * side * out);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  return mesh;
}

/** Where the steam vents stand: beside the track, clear of the walls. */
function ventSpots(geometry: TrackGeometry, rand: () => number) {
  const spots: { x: number; z: number; offset: number }[] = [];
  for (let i = 0; i < VENTS; i += 1) {
    const s = geometry.sample(Math.floor(((i + rand() * 0.5) * geometry.samples.length) / VENTS));
    const side = rand() < 0.5 ? -1 : 1;
    const out = geometry.wallOffset(s.width) + 5 + rand() * 6;
    spots.push({ x: s.x + s.nx * side * out, z: s.z + s.nz * side * out, offset: rand() });
  }
  return spots;
}

/** Chevrons on the belts, moving with them (placed by `update`). One draw. */
function beltChevrons(): THREE.InstancedMesh {
  const bar = (angle: number) =>
    new THREE.BoxGeometry(0.5, 0.04, 2.2)
      .translate(0, 0, 1.1)
      .rotateY(angle)
      .toNonIndexed()
      .deleteAttribute('uv');
  // A "V" pointing along −Z (a kart's forward): two bars meeting at the tip.
  const chevron = mergeGeometries([bar(0.8), bar(-0.8)]);
  if (!chevron) throw new Error('Cog Works: chevron does not merge');
  const length = beltLength();
  const perLane = Math.ceil(length / CHEVRON_STEP);
  const mesh = new THREE.InstancedMesh(
    chevron,
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    2 * perLane,
  );
  // Green on the forward belt, red on the backward one.
  const colour = new THREE.Color();
  for (let i = 0; i < 2 * perLane; i += 1) {
    mesh.setColorAt(i, colour.setHex(i < perLane ? COLOURS.forward : COLOURS.backward));
  }
  mesh.frustumCulled = false;
  return mesh;
}

const beltLength = () => (BELTS.forward.to - BELTS.forward.from) * COG_WORKS.length;

/** Steam puffs rising from the vents (placed by `update`). One draw. */
function steamPuffs(): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({
      color: COLOURS.steam,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
    VENTS * PUFFS_PER_VENT,
  );
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Cog Works' scenery (MK-62): the factory hall's brick walls, girders, copper pipes and big turning
 * wall gears; machinery round the hall; the turntable gear in the hairpin; the furnace pit under
 * the catwalk and the furnace beyond it; hanging lamps; chevrons moving on the belts and steam
 * rising from vents. 15 draws.
 */
function scenery(geometry: TrackGeometry): THREE.Object3D {
  const group = new THREE.Group();
  const rand = random(geometry.samples.length * 7727);
  const dummy = new THREE.Object3D();
  const bounds = trackBounds(geometry);
  group.add(hall(geometry, bounds, dummy));
  const gears = wallGears(bounds, rand);
  group.add(gears);
  group.add(turntable());
  group.add(machinery(geometry, bounds, rand, dummy));
  group.add(pipes(bounds));
  group.add(furnace(geometry));
  group.add(lamps(geometry, dummy));
  const chevrons = beltChevrons();
  const steam = steamPuffs();
  group.add(chevrons, steam);
  group.userData.moving = {
    gears,
    turntable: group.getObjectByName('turntable'),
    chevrons,
    steam,
    vents: ventSpots(geometry, rand),
    geometry,
  } satisfies Moving;
  update(group, 0);
  return group;
}

/** The moving parts of the scenery, found once in `scenery()`. */
interface Moving {
  gears: THREE.InstancedMesh;
  turntable: THREE.Object3D | undefined;
  chevrons: THREE.InstancedMesh;
  steam: THREE.InstancedMesh;
  vents: { x: number; z: number; offset: number }[];
  geometry: TrackGeometry;
}

/** Scratch object reused every frame (no garbage per frame). */
const scratch = new THREE.Object3D();

/** Per frame, from the tick: the gears turn, the belt chevrons move, the steam rises. */
function update(scenery: THREE.Object3D, ticks: number): void {
  const moving = scenery.userData.moving as Moving | undefined;
  if (!moving) return;
  const seconds = ticks * DT;
  const { gears, chevrons, steam, vents, geometry } = moving;
  if (moving.turntable) moving.turntable.rotation.y = -seconds * TURNTABLE_SPIN;

  const spots = gears.userData.spots as {
    x: number;
    y: number;
    z: number;
    face: number;
    radius: number;
  }[];
  spots.forEach((spot, i) => {
    scratch.position.set(spot.x, spot.y, spot.z);
    scratch.rotation.set(0, 0, 0);
    scratch.rotateY(spot.face);
    scratch.rotateX(Math.PI / 2);
    scratch.rotateY(((i % 2 ? 1 : -1) * seconds * GEAR_SPIN * 8) / spot.radius);
    scratch.scale.setScalar(spot.radius);
    scratch.updateMatrix();
    gears.setMatrixAt(i, scratch.matrix);
  });
  gears.instanceMatrix.needsUpdate = true;

  // Belt chevrons: forward lane moving with the track, backward lane against it.
  const length = beltLength();
  const perLane = Math.ceil(length / CHEVRON_STEP);
  const shift = (seconds * tuning.surfaces.conveyorSpeed) % CHEVRON_STEP;
  scratch.scale.setScalar(1);
  [BELTS.forward, BELTS.backward].forEach((belt, lane) => {
    const sign = lane === 0 ? 1 : -1;
    const lateral = (belt.lateralMin + belt.lateralMax) / 2;
    for (let k = 0; k < perLane; k += 1) {
      const along = (k * CHEVRON_STEP + sign * shift + length) % length;
      const t = belt.from + along / COG_WORKS.length;
      const at = geometry.pointAt(t, lateral);
      scratch.position.set(at.x, at.y + 0.09, at.z);
      scratch.rotation.set(0, geometry.headingAt(t) + (sign > 0 ? 0 : Math.PI), 0);
      scratch.updateMatrix();
      chevrons.setMatrixAt(lane * perLane + k, scratch.matrix);
    }
  });
  chevrons.instanceMatrix.needsUpdate = true;

  // Steam: each vent's puffs rise and swell, one after another.
  scratch.rotation.set(0, 0, 0);
  vents.forEach((vent, v) => {
    for (let k = 0; k < PUFFS_PER_VENT; k += 1) {
      const life = (seconds / STEAM.life + k / PUFFS_PER_VENT + vent.offset) % 1;
      scratch.position.set(vent.x + life * 1.5, 1 + life * STEAM.rise, vent.z);
      scratch.scale.setScalar(STEAM.size + life * STEAM.grow);
      scratch.updateMatrix();
      steam.setMatrixAt(v * PUFFS_PER_VENT + k, scratch.matrix);
    }
  });
  steam.instanceMatrix.needsUpdate = true;
}

export default {
  id: 'cog-works',
  scenery,
  update: (object, ticks) => update(object, ticks),
} satisfies TrackView;
