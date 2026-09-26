import * as THREE from 'three';
import { trackGeometry, type TrackDef } from '../sim/track';
import { createScenery } from './scenery';
import { applyTheme, createNightLamps, trackTheme } from './theme';
import { createSplineTrackMesh } from './trackMesh';

const WALL_HEIGHT = 1.2;
const WALL_THICKNESS = 1;

/**
 * Builds the visuals for a track: generated from spline data in the track's theme (MK-49), or the
 * flat walled test pad.
 */
export function createTrackView(scene: THREE.Scene, track: TrackDef): void {
  if (track.kind === 'spline') {
    const geometry = trackGeometry(track);
    const theme = trackTheme(track);
    scene.add(createSplineTrackMesh(geometry, theme.palette));
    scene.add(createScenery(geometry, theme.scenery));
    if (theme.night) scene.add(createNightLamps(geometry));
    applyTheme(scene, theme);
    return;
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
}

/** Points the camera straight down at the whole track (overview/debug scenarios). Returns true. */
export function overviewCamera(camera: THREE.PerspectiveCamera, track: TrackDef): true {
  let minX: number;
  let maxX: number;
  let minZ: number;
  let maxZ: number;
  if (track.kind === 'spline') {
    const samples = trackGeometry(track).samples;
    const margin = track.offroadWidth + 20;
    minX = Math.min(...samples.map((s) => s.x)) - margin;
    maxX = Math.max(...samples.map((s) => s.x)) + margin;
    minZ = Math.min(...samples.map((s) => s.z)) - margin;
    maxZ = Math.max(...samples.map((s) => s.z)) + margin;
  } else {
    [minX, maxX, minZ, maxZ] = [-track.halfSize, track.halfSize, -track.halfSize, track.halfSize];
  }
  const span = Math.max(maxX - minX, (maxZ - minZ) * camera.aspect);
  const height = span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.aspect;
  camera.position.set((minX + maxX) / 2, height, (minZ + maxZ) / 2);
  camera.up.set(0, 0, -1);
  camera.lookAt((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  return true;
}
