import * as THREE from 'three';
import { aiTargetPoint } from '../sim/ai/driver';
import { meshAiTargetPoint } from '../sim/ai/meshDriver';
import { getTrack, trackGeometry } from '../sim/track';
import type { AiState, KartState, SimState } from '../sim/types';

const MAX = 16;

/**
 * `?ai-debug=1` (MK-15): a yellow ball at each AI's steering target, and a panel listing every
 * AI's rubber-band multiplier and drift state (on MK8 courses, MK-128: also gliding, anti-gravity,
 * spin boost and coins). Read-only view of the sim.
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
    if (track.kind === 'arena') return;
    const target =
      track.kind === 'spline'
        ? (kart: KartState, ai: AiState) =>
            aiTargetPoint(kart, ai, trackGeometry(track), track.aiLine ?? [])
        : (kart: KartState, ai: AiState) => meshAiTargetPoint(kart, ai, track, state);
    const lines: string[] = [];
    let count = 0;
    for (const kart of state.karts) {
      if (!kart.ai || count >= MAX) continue;
      const p = target(kart, kart.ai);
      this.dummy.position.set(p.x, p.y + 0.6, p.z);
      this.dummy.updateMatrix();
      this.targets.setMatrixAt(count, this.dummy.matrix);
      count += 1;
      const scale = kart.ai.speedScale ?? 1;
      const drift = kart.drift.direction !== 0 ? ` drift t${kart.drift.tier}` : '';
      // MK8 courses (MK-128): gliding, anti-gravity, a spin boost, coins held.
      const mk8 = [
        kart.glide ? ' glide' : '',
        kart.antigrav ? ' antigrav' : '',
        (kart.spinBoostTimer ?? 0) > 0 ? ' spin' : '',
        kart.coins !== undefined ? ` ${kart.coins}c` : '',
      ].join('');
      lines.push(`#${kart.id} ×${scale.toFixed(3)}${drift}${mk8}`);
    }
    this.targets.count = count;
    this.targets.instanceMatrix.needsUpdate = true;
    const text = lines.join('\n');
    if (this.panel.textContent !== text) this.panel.textContent = text;
  }
}
