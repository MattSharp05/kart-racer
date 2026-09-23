import * as THREE from 'three';
import { DT } from '../sim/tuning';
import type { InputFrame, SimState } from '../sim/types';
import { PrimitiveKartFactory, type KartModel, type KartModelFactory } from './kartModels';
import type { KartState } from '../sim/types';

const MAX_WHEEL_TURN = 0.45;
/** How far the body leans outward and yaws into a drift, radians. */
const DRIFT_LEAN = 0.12;
const DRIFT_YAW = 0.35;
/** Spark colour per mini-turbo tier (0 = charging, not yet blue). */
const SPARK_COLOURS = [0xfff3b0, 0x3fa9ff, 0xff9a1f, 0xb15cff] as const;

/** Deterministic 0..1 noise so sparks look random but freeze exactly when the sim is paused. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

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

  constructor(
    private readonly scene: THREE.Scene,
    private readonly factory: KartModelFactory = new PrimitiveKartFactory(),
  ) {}

  sync(previous: SimState, current: SimState, alpha: number, inputs: readonly InputFrame[] = []) {
    current.karts.forEach((kart, i) => {
      const model = this.models[i] ?? this.createModel(kart);
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
        for (const wheel of model.wheels) wheel.rotation.x -= distance / model.wheelRadius;
      }
      const steer = inputs[i]?.steer ?? 0;
      for (const pivot of model.frontWheels) pivot.rotation.y = -steer * MAX_WHEEL_TURN;
      this.syncEffects(model, kart, current.tick);
    });
    this.wheelTick = current.tick;
  }

  private syncEffects(model: KartModel, kart: KartState, tick: number): void {
    const drift = kart.drift.direction;
    // Lean outward and swing the tail out, like a drifting kart.
    model.body.rotation.z = drift * DRIFT_LEAN;
    model.body.rotation.y = -drift * DRIFT_YAW;

    const showSparks = drift !== 0;
    const colour = SPARK_COLOURS[kart.drift.tier];
    model.sparks.forEach((cluster, side) => {
      cluster.visible = showSparks;
      if (!showSparks) return;
      const size = kart.drift.tier === 0 ? 0.5 : 1;
      cluster.children.forEach((spark, n) => {
        const mesh = spark as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
        mesh.material.color.setHex(colour);
        const r = noise(tick * 7 + n * 13 + side * 101);
        const angle = (n / cluster.children.length) * Math.PI * 2 + r;
        mesh.position.set(
          Math.cos(angle) * 0.25 * size,
          Math.abs(Math.sin(angle)) * 0.3 * size,
          r * 0.4,
        );
        mesh.rotation.set(-0.6 - r * 0.6, angle * 0.3, 0);
        mesh.scale.setScalar(size * (0.6 + r * 0.8));
      });
    });

    // Respawn: drone overhead while carried, then blink while invulnerable.
    model.drone.visible = kart.respawnTimer > 0;
    if (model.drone.visible) model.drone.rotation.y = tick * 0.3;
    model.body.visible = kart.invulnerableTimer <= 0 || Math.floor(tick / 5) % 2 === 0;

    model.flame.visible = kart.boostTimer > 0;
    if (model.flame.visible) {
      const flicker = 0.85 + noise(tick) * 0.4;
      model.flame.scale.set(flicker, 1 + noise(tick + 1) * 0.6, flicker);
    }
  }

  /** The player's kart (kart 0), for the camera. */
  get player(): THREE.Object3D | undefined {
    return this.models[0]?.root;
  }

  private createModel(kart: KartState): KartModel {
    const model = this.factory.create(kart.kartType);
    this.scene.add(model.root);
    this.models.push(model);
    return model;
  }
}
