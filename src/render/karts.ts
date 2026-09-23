import * as THREE from 'three';
import type { SimState } from '../sim/types';

/** Placeholder kart meshes driven by sim state, interpolated between ticks. Real models arrive in MK-5/MK-7. */
export class KartRenderer {
  private readonly meshes: THREE.Mesh[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  sync(previous: SimState, current: SimState, alpha: number): void {
    current.karts.forEach((kart, i) => {
      const mesh = this.meshes[i] ?? this.createMesh();
      const before = previous.karts[i] ?? kart;
      mesh.position.set(
        before.position.x + (kart.position.x - before.position.x) * alpha,
        before.position.y + (kart.position.y - before.position.y) * alpha + 0.5,
        before.position.z + (kart.position.z - before.position.z) * alpha,
      );
      mesh.rotation.y = before.heading + (kart.heading - before.heading) * alpha;
    });
  }

  /** Position of the first kart's mesh, for the temporary follow camera. */
  get focus(): THREE.Vector3 | undefined {
    return this.meshes[0]?.position;
  }

  private createMesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 2),
      new THREE.MeshLambertMaterial({ color: 0xe63946 }),
    );
    this.scene.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }
}
