import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { collisionFromTriangles } from '../sim/meshCollision';
import {
  buildDrawnGround,
  drawnSeatOffset,
  drawnWallPush,
  DrawnSeats,
  SEAT_RAISE,
} from './drawnGround';

/**
 * A road along Z, 20 m wide, drawn with a crown (0.8 m higher in the middle than at its edges, like
 * a curve the pack's simplifier flattened), with a wall 1.5 m high at x = 10.
 */
const crown = (x: number) => 0.8 * (1 - (x / 10) ** 2);

function drawnRoad(material: THREE.Material = new THREE.MeshBasicMaterial()): THREE.Group {
  const positions: number[] = [];
  for (let x = -10; x < 10; x += 1)
    for (let z = -20; z < 20; z += 2) {
      const p = (px: number, pz: number) => [px, crown(px), pz];
      positions.push(...p(x, z), ...p(x, z + 2), ...p(x + 1, z));
      positions.push(...p(x + 1, z), ...p(x, z + 2), ...p(x + 1, z + 2));
    }
  for (let z = -20; z < 20; z += 2)
    positions.push(10, 0, z, 10, 1.5, z, 10, 0, z + 2, 10, 0, z + 2, 10, 1.5, z, 10, 1.5, z + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  return group;
}

/** The simplified collision: one flat chord at y = 0 under the drawn crown. */
const collision = collisionFromTriangles(
  new Float32Array([-10, 0, -20, -10, 0, 20, 10, 0, -20, 10, 0, -20, -10, 0, 20, 10, 0, 20]),
  new Uint8Array(2),
  4,
);

const UP = new THREE.Vector3(0, 1, 0);

describe('karts on the drawn road (MK-105 / MK-122 QA)', () => {
  it('finds the drawn road above a kart standing on a flattened collision', () => {
    const ground = buildDrawnGround(drawnRoad(), collision);
    if (!ground) throw new Error('no drawn ground');
    expect(drawnSeatOffset(ground, new THREE.Vector3(0, 0, 0), UP)).toBeCloseTo(crown(0), 4);
    expect(drawnSeatOffset(ground, new THREE.Vector3(5, 0, 3), UP)).toBeCloseTo(crown(5), 2);
    // Nothing drawn within reach: no offset.
    expect(drawnSeatOffset(ground, new THREE.Vector3(0, -SEAT_RAISE - 1, 0), UP)).toBeNull();
  });

  it('seats a grounded kart model on the drawn road, and leaves one in the air alone', () => {
    const ground = buildDrawnGround(drawnRoad(), collision);
    if (!ground) throw new Error('no drawn ground');
    const seats = new DrawnSeats(ground);
    const kart = new THREE.Object3D();
    kart.position.set(0, 0, 0);
    seats.seat(0, kart, true, false, 1 / 60);
    expect(kart.position.y).toBeCloseTo(crown(0), 4);
    // The offset eases out when the kart leaves the ground (no pop).
    kart.position.set(0, 3, 0);
    seats.seat(0, kart, false, false, 1);
    expect(kart.position.y).toBeCloseTo(3, 2);
  });

  it('pushes a kart model out of a drawn wall, at most half a metre', () => {
    const ground = buildDrawnGround(drawnRoad(), collision);
    if (!ground) throw new Error('no drawn ground');
    const push = drawnWallPush(ground, new THREE.Vector3(9.5, crown(9.5), 0), UP);
    expect(push?.x).toBeLessThan(0);
    expect(push?.length()).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(push?.y ?? 1).toBeCloseTo(0, 6);
    expect(drawnWallPush(ground, new THREE.Vector3(0, crown(0), 0), UP)).toBeNull();
  });

  it('leaves out see-through and cut-out layers, hidden meshes and far backdrops', () => {
    expect(
      buildDrawnGround(drawnRoad(new THREE.MeshBasicMaterial({ transparent: true })), collision),
    ).toBeNull();
    expect(
      buildDrawnGround(drawnRoad(new THREE.MeshBasicMaterial({ alphaTest: 0.5 })), collision),
    ).toBeNull();
    const hidden = drawnRoad();
    hidden.visible = false;
    expect(buildDrawnGround(hidden, collision)).toBeNull();
    const far = drawnRoad();
    far.position.set(500, 0, 0);
    expect(buildDrawnGround(far, collision)).toBeNull();
  });

  it('builds the drawn road in world space (the course model is scaled ×3)', () => {
    const model = drawnRoad();
    model.scale.setScalar(3);
    const big = collisionFromTriangles(
      new Float32Array([-30, 0, -60, -30, 0, 60, 30, 0, -60, 30, 0, -60, -30, 0, 60, 30, 0, 60]),
      new Uint8Array(2),
      12,
    );
    const ground = buildDrawnGround(model, big);
    if (!ground) throw new Error('no drawn ground');
    expect(drawnSeatOffset(ground, new THREE.Vector3(0, 2, 0), UP)).toBeCloseTo(
      3 * crown(0) - 2,
      4,
    );
  });
});
