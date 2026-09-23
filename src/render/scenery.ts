import * as THREE from 'three';
import { insidePolygon, type TrackGeometry } from '../sim/splineTrack';

/** Deterministic pseudo-random numbers so the scenery is the same every load (and in screenshots). */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TREE_COUNT = 140;
const ROCK_COUNT = 40;
const HILL_COUNT = 14;
/** Keep scenery at least this far outside the walls, m. */
const CLEARANCE = 6;

/** Whether a point is clear of the track, its walls and any drivable infield. */
function clearOfTrack(geometry: TrackGeometry, x: number, z: number): boolean {
  const p = geometry.project({ x, y: 0, z });
  if (Math.abs(p.lateral) < geometry.wallOffset(p.width) + CLEARANCE) return false;
  return !(geometry.def.shortcuts ?? []).some((c) => insidePolygon(x, z, c.polygon));
}

function sampleClear(
  geometry: TrackGeometry,
  rand: () => number,
  bounds: THREE.Box3,
  margin: number,
): THREE.Vector2 | undefined {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const x = THREE.MathUtils.lerp(bounds.min.x - margin, bounds.max.x + margin, rand());
    const z = THREE.MathUtils.lerp(bounds.min.z - margin, bounds.max.z + margin, rand());
    if (clearOfTrack(geometry, x, z)) return new THREE.Vector2(x, z);
  }
  return undefined;
}

/** Vertical sky gradient as the scene background (no draw call). */
export function skyGradient(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#4aa3e8');
    gradient.addColorStop(0.6, '#a8dcf7');
    gradient.addColorStop(1, '#e8f7ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Low-poly scenery around a track: trees, rocks, distant hills and a grandstand by the start line.
 * Instanced so the whole lot is a handful of draw calls (MK-10 budget: ≤ 40).
 */
export function createScenery(geometry: TrackGeometry): THREE.Group {
  const group = new THREE.Group();
  const rand = random(geometry.samples.length * 7919);
  const bounds = new THREE.Box3();
  for (const s of geometry.samples) bounds.expandByPoint(new THREE.Vector3(s.x, s.y, s.z));
  const dummy = new THREE.Object3D();

  // Trees: trunk + canopy instanced meshes.
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.35, 0.5, 2.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
    TREE_COUNT,
  );
  const canopies = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.4, 5.5, 7),
    new THREE.MeshLambertMaterial({ color: 0x2d6a4f }),
    TREE_COUNT,
  );
  let trees = 0;
  for (let i = 0; i < TREE_COUNT; i += 1) {
    const at = sampleClear(geometry, rand, bounds, 60);
    if (!at) continue;
    const scale = 0.8 + rand() * 0.7;
    dummy.position.set(at.x, 1.25 * scale, at.y);
    dummy.scale.setScalar(scale);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(trees, dummy.matrix);
    dummy.position.y = (2.5 + 2.75) * scale;
    dummy.updateMatrix();
    canopies.setMatrixAt(trees, dummy.matrix);
    trees += 1;
  }
  trunks.count = trees;
  canopies.count = trees;
  group.add(trunks, canopies);

  // Rocks.
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: 0x9a9a9a, flatShading: true }),
    ROCK_COUNT,
  );
  let rockCount = 0;
  for (let i = 0; i < ROCK_COUNT; i += 1) {
    const at = sampleClear(geometry, rand, bounds, 40);
    if (!at) continue;
    dummy.position.set(at.x, 0.3, at.y);
    dummy.scale.set(0.8 + rand() * 1.6, 0.6 + rand(), 0.8 + rand() * 1.6);
    dummy.rotation.set(rand(), rand() * Math.PI, rand());
    dummy.updateMatrix();
    rocks.setMatrixAt(rockCount, dummy.matrix);
    rockCount += 1;
  }
  rocks.count = rockCount;
  group.add(rocks);

  // Distant hills in a ring well outside the track.
  const hills = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x74b566, flatShading: true }),
    HILL_COUNT,
  );
  const centre = bounds.getCenter(new THREE.Vector3());
  const ring = bounds.getSize(new THREE.Vector3()).length() * 0.75;
  for (let i = 0; i < HILL_COUNT; i += 1) {
    const angle = (i / HILL_COUNT) * Math.PI * 2 + rand() * 0.3;
    const distance = ring * (0.9 + rand() * 0.4);
    dummy.position.set(
      centre.x + Math.cos(angle) * distance,
      -2,
      centre.z + Math.sin(angle) * distance,
    );
    dummy.scale.set(60 + rand() * 60, 25 + rand() * 30, 60 + rand() * 60);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    hills.setMatrixAt(i, dummy.matrix);
  }
  group.add(hills);

  group.add(createGrandstand(geometry));
  return group;
}

/** Three tiers of seating plus a roof, beside the start line, facing the track. */
function createGrandstand(geometry: TrackGeometry): THREE.Group {
  const stand = new THREE.Group();
  const start = geometry.sample(Math.round(geometry.samples.length * 0.02));
  const side = -1; // left of the driving direction
  const distance = geometry.wallOffset(start.width) + 6;
  stand.position.set(start.x + start.nx * side * distance, 0, start.z + start.nz * side * distance);
  stand.rotation.y = Math.atan2(-start.tx, -start.tz);

  const seatMaterial = new THREE.MeshLambertMaterial({ color: 0x457b9d });
  const tierGeometry = new THREE.BoxGeometry(4, 1.2, 40);
  const tiers = new THREE.InstancedMesh(tierGeometry, seatMaterial, 3);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 3; i += 1) {
    // Each tier sits further back and stands taller than the one in front.
    dummy.position.set(side * (2 + i * 4), (1.2 * (1 + i)) / 2, 0);
    dummy.scale.set(1, 1 + i, 1);
    dummy.updateMatrix();
    tiers.setMatrixAt(i, dummy.matrix);
  }
  stand.add(tiers);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.4, 42),
    new THREE.MeshLambertMaterial({ color: 0xe63946 }),
  );
  roof.position.set(side * 7, 6.5, 0);
  stand.add(roof);
  return stand;
}
