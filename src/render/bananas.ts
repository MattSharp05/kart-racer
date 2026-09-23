import * as THREE from 'three';
import { bananaDrawPosition } from '../sim/items/banana';
import type { BananaEntity, SimState } from '../sim/types';

const MAX = 24;

/** A curved yellow banana: a partial torus, instanced (MK-17). */
export class BananaRenderer {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.TorusGeometry(0.45, 0.16, 6, 10, Math.PI * 0.9);
    this.mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.6, flatShading: true }),
      MAX,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  sync(state: SimState): void {
    const bananas = state.entities.filter((e): e is BananaEntity => e.kind === 'banana');
    this.mesh.count = Math.min(bananas.length, MAX);
    bananas.slice(0, MAX).forEach((banana, i) => {
      const p = bananaDrawPosition(banana);
      this.dummy.position.set(p.x, p.y + 0.35, p.z);
      this.dummy.rotation.set(0, banana.id * 1.3, Math.PI);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
