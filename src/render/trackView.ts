import * as THREE from 'three';
import { trackViews } from '../content/tracks/render';
import { trackGeometry, type TrackDef } from '../sim/track';
import { CAMERA_FAR, CAMERA_NEAR } from './scene';
import { createBumperViews } from './bumpers';
import { createCollisionMeshView } from './meshTrackView';
import { createScenery } from './scenery';
import { applyTheme, createNightLamps, trackTheme } from './theme';
import { createSplineTrackMesh } from './trackMesh';

const WALL_HEIGHT = 1.2;
const WALL_THICKNESS = 1;

/** Per-frame update of a track's moving scenery: the tick (fractional) and the camera position. */
export type TrackViewUpdate = (ticks: number, camera: THREE.Vector3) => void;

/**
 * Builds the visuals for a track: generated from spline data in the track's theme (MK-49), or the
 * flat walled test pad. Returns the per-frame update for tracks with moving scenery (MK-59).
 */
export function createTrackView(scene: THREE.Scene, track: TrackDef): TrackViewUpdate | undefined {
  // Mesh tracks (ADR 0010): the course's model when its view has one (MK-105: an MK8 course's
  // GLB), else the collision mesh by surface (MK-99).
  if (track.kind === 'mesh') {
    const view = trackViews.has(track.id) ? trackViews.get(track.id) : undefined;
    const model = view?.model?.();
    scene.add(model ?? createCollisionMeshView(track.collision));
    // Boost bumpers (MK-108) on courses drawn from their collision mesh.
    if (!model) scene.add(createBumperViews(track.route.zones));
    return undefined;
  }
  if (track.kind === 'spline') {
    const geometry = trackGeometry(track);
    const theme = trackTheme(track);
    scene.add(createSplineTrackMesh(geometry, theme.palette));
    // A track's own `render.ts` (MK-58) may draw its scenery instead of the theme's set.
    const view = trackViews.has(track.id) ? trackViews.get(track.id) : undefined;
    const scenery = view?.scenery?.(geometry, theme) ?? createScenery(geometry, theme.scenery);
    scene.add(scenery);
    if (theme.night) scene.add(createNightLamps(geometry));
    applyTheme(scene, theme);
    const update = view?.update;
    return update ? (ticks, camera) => update(scenery, ticks, camera) : undefined;
  }
  const size = track.halfSize * 2;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ color: 0x5dab4a }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // 5 m grid so speed and turning are easy to judge.
  const grid = new THREE.GridHelper(size, size / 5, 0x2f6b26, 0x2f6b26);
  grid.position.y = 0.01;
  scene.add(grid);

  const centreLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, size),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  centreLine.rotation.x = -Math.PI / 2;
  centreLine.position.y = 0.02;
  scene.add(centreLine);

  const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xf4a261 });
  const wallGeometry = new THREE.BoxGeometry(
    size + WALL_THICKNESS * 2,
    WALL_HEIGHT,
    WALL_THICKNESS,
  );
  // Inner face of each wall sits exactly on the collision boundary (±halfSize).
  const wallCentre = track.halfSize + WALL_THICKNESS / 2;
  for (const [x, z, rotate] of [
    [0, -wallCentre, false],
    [0, wallCentre, false],
    [-wallCentre, 0, true],
    [wallCentre, 0, true],
  ] as const) {
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(x, WALL_HEIGHT / 2, z);
    if (rotate) wall.rotation.y = Math.PI / 2;
    scene.add(wall);
  }
  return undefined;
}

interface OverviewBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Highest point of the road, m (the camera frames the track at this height). */
  top: number;
}

/** The overview sees this far below the ground, m. */
const OVERVIEW_FAR_MARGIN = 100;
/** The overview cuts away everything higher than this above the highest road, m. */
const OVERVIEW_HEADROOM = 6;

const overviewBoundsCache = new WeakMap<TrackDef, OverviewBounds>();

function overviewBounds(track: TrackDef): OverviewBounds {
  const cached = overviewBoundsCache.get(track);
  if (cached) return cached;
  let bounds: OverviewBounds;
  if (track.kind === 'spline') {
    const samples = trackGeometry(track).samples;
    const margin = track.offroadWidth + 20;
    bounds = {
      minX: Math.min(...samples.map((s) => s.x)) - margin,
      maxX: Math.max(...samples.map((s) => s.x)) + margin,
      minZ: Math.min(...samples.map((s) => s.z)) - margin,
      maxZ: Math.max(...samples.map((s) => s.z)) + margin,
      top: Math.max(0, ...samples.map((s) => s.y)),
    };
  } else if (track.kind === 'mesh') {
    const { gridMin, gridDims, cellSize } = track.collision;
    bounds = {
      minX: gridMin[0],
      maxX: gridMin[0] + gridDims[0] * cellSize,
      minZ: gridMin[2],
      maxZ: gridMin[2] + gridDims[2] * cellSize,
      top: Math.max(0, gridMin[1] + gridDims[1] * cellSize),
    };
  } else {
    const h = track.halfSize;
    bounds = { minX: -h, maxX: h, minZ: -h, maxZ: h, top: 0 };
  }
  overviewBoundsCache.set(track, bounds);
  return bounds;
}

/** A mesh track's chase camera sees this many times the width of its collision's bounds. */
const MESH_FAR_SPAN = 1.25;
/** Its near plane is this share of its far one: the depth buffer keeps the same precision. */
const MESH_NEAR_PER_FAR = 1 / 20000;

/**
 * The chase camera's near and far planes on `track`: the scene's defaults, but a mesh track bigger
 * than they reach (an MK8 course at 3×, MK-105 revisit: ~2–3 km across) is seen end to end, its
 * near plane moved out with the far one so the road doesn't flicker in the distance.
 */
export function chaseCameraRange(track: TrackDef): { near: number; far: number } {
  if (track.kind !== 'mesh') return { near: CAMERA_NEAR, far: CAMERA_FAR };
  const { minX, maxX, minZ, maxZ } = overviewBounds(track);
  const far = Math.max(CAMERA_FAR, Math.hypot(maxX - minX, maxZ - minZ) * MESH_FAR_SPAN);
  return { near: Math.max(CAMERA_NEAR, far * MESH_NEAR_PER_FAR), far };
}

/**
 * Points the camera straight down at the whole track (overview/debug scenarios), north (−Z) up.
 * Call it every frame in the overview: it follows the window's aspect ratio. Returns true.
 */
export function overviewCamera(camera: THREE.PerspectiveCamera, track: TrackDef): true {
  const { minX, maxX, minZ, maxZ, top } = overviewBounds(track);
  const span = Math.max(maxX - minX, (maxZ - minZ) * camera.aspect);
  const height = span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.aspect;
  camera.position.set((minX + maxX) / 2, top + height, (minZ + maxZ) / 2);
  camera.up.set(0, 0, -1);
  camera.lookAt((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  // See down to the ground under the highest road, and through tree crowns and roofs above it.
  const far = Math.max(chaseCameraRange(track).far, top + height + OVERVIEW_FAR_MARGIN);
  const near = Math.max(CAMERA_NEAR, height - OVERVIEW_HEADROOM);
  if (camera.far !== far || camera.near !== near) {
    camera.far = far;
    camera.near = near;
    camera.updateProjectionMatrix();
  }
  return true;
}
