import * as THREE from 'three';
import { DT } from '../sim/tuning';
import type { InputFrame, SimState } from '../sim/types';
import { createPlaceholderKart, WHEEL_RADIUS, type KartModel } from './kartModel';

const MAX_WHEEL_TURN = 0.45;

/** Shortest-path interpolation between two angles. */
function lerpAngle(a: number, b: number, t: number): number {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

/** Kart meshes driven by sim state, interpolated between ticks. */
export class KartRenderer {
  private readonly models: KartModel[] = [];
  /** Last sim tick the wheels were advanced for, so they spin once per tick, not per frame. */
  private wheelTick = -1;

  constructor(private readonly scene: THREE.Scene) {}

  sync(previous: SimState, current: SimState, alpha: number, inputs: readonly InputFrame[] = []) {
    current.karts.forEach((kart, i) => {
      const model = this.models[i] ?? this.createModel();
      const before = previous.karts[i] ?? kart;
      model.root.position.set(
        before.position.x + (kart.position.x - before.position.x) * alpha,
        before.position.y + (kart.position.y - before.position.y) * alpha,
        before.position.z + (kart.position.z - before.position.z) * alpha,
      );
      model.root.rotation.y = lerpAngle(before.heading, kart.heading, alpha);

      if (current.tick !== this.wheelTick) {
        const ticks = this.wheelTick < 0 ? 0 : current.tick - this.wheelTick;
        const distance = kart.speed * ticks * DT;
        for (const wheel of model.wheels) wheel.rotation.x -= distance / WHEEL_RADIUS;
      }
      const steer = inputs[i]?.steer ?? 0;
      for (const pivot of model.frontWheels) pivot.rotation.y = -steer * MAX_WHEEL_TURN;
    });
    this.wheelTick = current.tick;
  }

  /** The player's kart (kart 0), for the camera. */
  get player(): THREE.Object3D | undefined {
    return this.models[0]?.root;
  }

  private createModel(): KartModel {
    const model = createPlaceholderKart();
    this.scene.add(model.root);
    this.models.push(model);
    return model;
  }
}
