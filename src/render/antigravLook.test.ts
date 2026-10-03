import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSimState } from '../sim/state';
import { tuning } from '../sim/tuning';
import type { KartState } from '../sim/types';
import { syncAntigravLook } from './antigravLook';
import { createBumperViews } from './bumpers';
import { PrimitiveKartFactory } from './kartModels';

const kart = (patch: Partial<KartState>): KartState => ({
  ...(createSimState({ seed: 1 }).karts[0] as KartState),
  up: { x: 0, y: 1, z: 0 },
  forward: { x: 0, y: 0, z: -1 },
  ...patch,
});

const glowOf = (root: THREE.Object3D) => root.userData.hoverGlow as THREE.Mesh;

describe('anti-gravity look (MK-108)', () => {
  it('folds the wheels flat with a blue glow in anti-gravity, and back on plain road', () => {
    const model = new PrimitiveKartFactory().create('maple');
    for (let i = 0; i < 40; i += 1) syncAntigravLook(model, kart({ antigrav: true }), i);
    for (const wheel of model.wheels) {
      expect(Math.abs(wheel.parent?.rotation.z ?? 0)).toBeCloseTo(Math.PI / 2, 5);
      // The axle (the wheel's X) now points along the kart's up: the tyre lies flat.
      wheel.updateWorldMatrix(true, false);
      const axle = new THREE.Vector3(1, 0, 0).transformDirection(wheel.matrixWorld);
      expect(Math.abs(axle.y)).toBeCloseTo(1, 5);
    }
    expect(glowOf(model.root).visible).toBe(true);
    for (let i = 0; i < 40; i += 1) syncAntigravLook(model, kart({ antigrav: false }), i);
    for (const wheel of model.wheels) expect(Math.abs(wheel.parent?.rotation.z ?? 1)).toBe(0);
    expect(glowOf(model.root).visible).toBe(false);
  });

  it('a spin boost turns the body once round over the boost', () => {
    const model = new PrimitiveKartFactory().create('maple');
    const { seconds } = tuning.mk8.spinBoost;
    model.body.rotation.y = 0;
    syncAntigravLook(model, kart({ antigrav: true, spinBoostTimer: seconds / 2 }), 0);
    expect(model.body.rotation.y).toBeCloseTo(Math.PI, 5);
    model.body.rotation.y = 0;
    syncAntigravLook(model, kart({ antigrav: true, spinBoostTimer: 0 }), 0);
    expect(model.body.rotation.y).toBe(0);
  });

  it('draws one ball per boost bumper', () => {
    const group = createBumperViews([
      { kind: 'boostBumper', position: { x: 1, y: 2, z: 3 }, radius: 1.5 },
      { kind: 'glide', from: 0, to: 0.1 },
    ]);
    expect(group.children).toHaveLength(1);
    expect(group.children[0]?.position.toArray()).toEqual([1, 2, 3]);
  });
});
