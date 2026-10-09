import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchCourseMeshes } from './courseBatch';

function box(material: THREE.Material, x: number, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(x, 0, z);
  return mesh;
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((o) => o instanceof THREE.Mesh && found.push(o));
  return found;
}

function triangles(root: THREE.Object3D): number {
  return meshes(root).reduce((sum, m) => sum + (m.geometry.index?.count ?? 0) / 3, 0);
}

function worldBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

describe('course mesh batching (MK-133)', () => {
  it('merges meshes of one material in one cell into one mesh, keeping every triangle in place', () => {
    const road = new THREE.MeshBasicMaterial({ name: 'road' });
    const grass = new THREE.MeshBasicMaterial({ name: 'grass' });
    const root = new THREE.Group();
    const nested = new THREE.Group();
    nested.position.set(5, 2, 10);
    nested.rotation.y = 0.5;
    nested.add(box(road, 3), box(grass, 4));
    root.add(box(road, 0), box(road, 10), box(grass, 20), nested);
    const before = { tris: triangles(root), bounds: worldBox(root) };

    const stats = batchCourseMeshes(root, 100);

    expect(stats).toEqual({ meshesBefore: 5, meshesAfter: 2 });
    const after = meshes(root);
    expect(after.map((m) => (m.material as THREE.Material).name).sort()).toEqual(['grass', 'road']);
    expect(triangles(root)).toBe(before.tris);
    const bounds = worldBox(root);
    expect(bounds.min.distanceTo(before.bounds.min)).toBeLessThan(1e-5);
    expect(bounds.max.distanceTo(before.bounds.max)).toBeLessThan(1e-5);
    for (const mesh of after) expect(mesh.matrixAutoUpdate).toBe(false);
  });

  it('keeps cells apart, so the frustum can still skip the far side of the course', () => {
    const road = new THREE.MeshBasicMaterial({ name: 'road' });
    const root = new THREE.Group();
    root.add(box(road, 0), box(road, 10), box(road, 0, 150), box(road, 10, 150));
    expect(batchCourseMeshes(root, 100)).toEqual({ meshesBefore: 4, meshesAfter: 2 });
  });

  it('leaves alone what it cannot merge: several materials, mirrored, skinned, mismatched attributes', () => {
    const road = new THREE.MeshBasicMaterial({ name: 'road' });
    const root = new THREE.Group();
    const multi = box(road, 1);
    multi.geometry.clearGroups();
    multi.geometry.addGroup(0, 18, 0);
    multi.geometry.addGroup(18, 18, 1);
    multi.material = [road, road];
    const mirrored = box(road, 2);
    mirrored.scale.x = -1;
    const noUv = box(road, 3);
    noUv.geometry.deleteAttribute('uv');
    const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), road);
    root.add(box(road, 0), multi, mirrored, noUv, skinned);
    expect(batchCourseMeshes(root, 100)).toEqual({ meshesBefore: 5, meshesAfter: 5 });
  });

  it('merges interleaved attributes (as glTF files often have them)', () => {
    const road = new THREE.MeshBasicMaterial({ name: 'road' });
    const root = new THREE.Group();
    for (const x of [0, 2]) {
      const source = new THREE.BoxGeometry().toNonIndexed();
      const positions = source.getAttribute('position');
      const buffer = new THREE.InterleavedBuffer(new Float32Array(positions.count * 3), 3);
      const interleaved = new THREE.InterleavedBufferAttribute(buffer, 3, 0);
      for (let i = 0; i < positions.count; i += 1)
        interleaved.setXYZ(i, positions.getX(i), positions.getY(i), positions.getZ(i));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', interleaved);
      const mesh = new THREE.Mesh(geometry, road);
      mesh.position.x = x;
      root.add(mesh);
    }
    expect(batchCourseMeshes(root, 100)).toEqual({ meshesBefore: 2, meshesAfter: 1 });
    const merged = meshes(root)[0]!;
    expect(merged.geometry.getAttribute('position').count).toBe(72);
  });

  it('merges under a scaled root without scaling twice (MK-105 revisit: courses drawn 3×)', () => {
    const road = new THREE.MeshBasicMaterial({ name: 'road' });
    const root = new THREE.Group();
    root.add(box(road, 0), box(road, 10));
    root.scale.setScalar(3);
    const before = worldBox(root);

    expect(batchCourseMeshes(root, 300)).toEqual({ meshesBefore: 2, meshesAfter: 1 });
    const after = worldBox(root);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-5);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-5);
    expect(after.max.x).toBeCloseTo(31.5, 5);
  });
});
