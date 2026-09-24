import * as THREE from 'three';
import { aiTargetPoint } from '../sim/ai/driver';
import { getTrack, trackGeometry } from '../sim/track';
import type { SimState } from '../sim/types';

const MAX = 16;

/**
 * `?ai-debug=1` (MK-15): a yellow ball at each AI's steering target, and a panel listing every
 * AI's rubber-band multiplier and drift state. Read-only view of the sim.
 */
export class AiDebugView {
  private readonly targets: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly panel = document.createElement('pre');

  constructor(scene: THREE.Scene) {
    this.targets = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#ffe066' }),
      MAX,
    );
    this.targets.count = 0;
    this.targets.frustumCulled = false;
    scene.add(this.targets);
    this.panel.className = 'ai-debug';
    document.body.append(this.panel);
  }

  sync(state: SimState): void {
    const track = getTrack(state.trackId);
    if (track.kind !== 'spline') return;
    const geometry = trackGeometry(track);
    const lines: string[] = [];
    let count = 0;
    for (const kart of state.karts) {
      if (!kart.ai || count >= MAX) continue;
      const p = aiTargetPoint(kart, kart.ai, geometry, track.aiLine ?? []);
      this.dummy.position.set(p.x, p.y + 0.6, p.z);
      this.dummy.updateMatrix();
      this.targets.setMatrixAt(count, this.dummy.matrix);
      count += 1;
      const scale = kart.ai.speedScale ?? 1;
      const drift = kart.drift.direction !== 0 ? ` drift t${kart.drift.tier}` : '';
      lines.push(`#${kart.id} ×${scale.toFixed(3)}${drift}`);
    }
    this.targets.count = count;
    this.targets.instanceMatrix.needsUpdate = true;
    const text = lines.join('\n');
    if (this.panel.textContent !== text) this.panel.textContent = text;
  }
}
