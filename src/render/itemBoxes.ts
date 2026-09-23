import * as THREE from 'three';
import type { SimState } from '../sim/types';

const SIZE = 1.3;
const HOVER = 1.1;

function questionMarkTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 128, 128);
    gradient.addColorStop(0, '#ff70a6');
    gradient.addColorStop(0.5, '#ffd670');
    gradient.addColorStop(1, '#70d6ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 64, 70);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Spinning, bobbing "?" boxes for every active item box (one instanced draw call). */
export class ItemBoxRenderer {
  private mesh: THREE.InstancedMesh | undefined;
  private readonly dummy = new THREE.Object3D();

  constructor(private readonly scene: THREE.Scene) {}

  sync(state: SimState, time: number): void {
    const boxes = state.entities.filter((e) => e.kind === 'itemBox');
    if (!this.mesh) {
      if (boxes.length === 0) return;
      this.mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(SIZE, SIZE, SIZE),
        // Unlit so the rainbow stays bright from any angle.
        new THREE.MeshBasicMaterial({
          map: questionMarkTexture(),
          transparent: true,
          opacity: 0.9,
        }),
        boxes.length,
      );
      this.scene.add(this.mesh);
    }
    boxes.forEach((box, i) => {
      const spin = time * 1.2 + box.id;
      this.dummy.position.set(
        box.position.x,
        box.position.y + HOVER + Math.sin(spin * 2) * 0.12,
        box.position.z,
      );
      this.dummy.rotation.set(0.4, spin, 0.3);
      // Hit boxes shrink away and grow back as they respawn.
      this.dummy.scale.setScalar(box.respawnTimer > 0 ? 0.001 : 1);
      this.dummy.updateMatrix();
      this.mesh?.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
