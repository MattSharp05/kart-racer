import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ITEM_BOX_TILT, itemBoxModel } from './itemBox';

describe("MK8's item box (MK-105 revisit: it was a flat square)", () => {
  it('is a 3D box: about as deep as it is wide and tall, in one mesh', () => {
    const box = itemBoxModel();
    const meshes: THREE.Mesh[] = [];
    box.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0]!;
    mesh.rotation.set(0, 0, 0);
    box.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(box).getSize(new THREE.Vector3());
    for (const side of [size.x, size.y, size.z]) expect(side).toBeCloseTo(1.07, 2);
  });

  it('is tilted on two axes, so three faces show from a kart, and its faces are shaded', () => {
    const box = itemBoxModel();
    const mesh = box.children[0] as THREE.Mesh;
    expect(mesh.rotation.x).toBe(ITEM_BOX_TILT.x);
    expect(mesh.rotation.z).toBe(ITEM_BOX_TILT.z);
    expect(ITEM_BOX_TILT.x).not.toBe(0);
    expect(ITEM_BOX_TILT.z).not.toBe(0);
    // RGBA per vertex: see-through faces in different shades, solid white edges.
    const colour = mesh.geometry.getAttribute('color');
    expect(colour.itemSize).toBe(4);
    const alphas = new Set<number>();
    const brightness = new Set<number>();
    for (let v = 0; v < colour.count; v += 1) {
      alphas.add(Number(colour.getW(v).toFixed(2)));
      brightness.add(Number((colour.getX(v) + colour.getY(v) + colour.getZ(v)).toFixed(1)));
    }
    expect([...alphas].sort()).toEqual([0.42, 0.95]);
    expect(brightness.size).toBeGreaterThan(3);
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(material).toMatchObject({ vertexColors: true, transparent: true, depthWrite: false });
  });
});
