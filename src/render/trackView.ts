import * as THREE from 'three';
import type { TrackDef } from '../sim/track';

const WALL_HEIGHT = 1.2;
const WALL_THICKNESS = 1;

/** Builds the visuals for a track. For now only the flat walled test pad (MK-9 adds spline tracks). */
export function createTrackView(scene: THREE.Scene, track: TrackDef): void {
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
  const wallGeometry = new THREE.BoxGeometry(size + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
  for (const [x, z, rotate] of [
    [0, -track.halfSize, false],
    [0, track.halfSize, false],
    [-track.halfSize, 0, true],
    [track.halfSize, 0, true],
  ] as const) {
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(x, WALL_HEIGHT / 2, z);
    if (rotate) wall.rotation.y = Math.PI / 2;
    scene.add(wall);
  }
}
