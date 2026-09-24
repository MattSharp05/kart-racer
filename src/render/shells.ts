import * as THREE from 'three';
import type { ShellEntity, SimState } from '../sim/types';

const MAX = 16;

function shellMesh(scene: THREE.Scene, colour: string): THREE.InstancedMesh {
  // A dome on a white rim, like a shell.
  const dome = new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const mesh = new THREE.InstancedMesh(
    dome,
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45, flatShading: true }),
    MAX,
  );
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

/** Spinning green and red shells (MK-18, MK-19): one instanced mesh per colour. */
export class ShellRenderer {
  private readonly meshes: Record<ShellEntity['colour'], THREE.InstancedMesh>;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.meshes = { green: shellMesh(scene, '#2a9d8f'), red: shellMesh(scene, '#e63946') };
  }

  sync(state: SimState, time: number): void {
    const shells = state.entities.filter((e): e is ShellEntity => e.kind === 'shell');
    for (const colour of ['green', 'red'] as const) {
      const mesh = this.meshes[colour];
      const mine = shells.filter((s) => s.colour === colour).slice(0, MAX);
      mesh.count = mine.length;
      mine.forEach((shell, i) => {
        this.dummy.position.set(shell.position.x, shell.position.y + 0.15, shell.position.z);
        this.dummy.rotation.set(0, time * 12 + shell.id, 0);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
