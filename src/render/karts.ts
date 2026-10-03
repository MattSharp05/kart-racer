import * as THREE from 'three';
import { DT, tuning } from '../sim/tuning';
import type { InputFrame, SimState } from '../sim/types';
import type { KartId } from '../sim/data/karts';
import {
  alternateColours,
  PrimitiveKartFactory,
  type KartModel,
  type KartModelFactory,
} from './kartModels';
import type { KartState } from '../sim/types';
import { createHeadlights } from './headlights';
import { itemEffects } from '../content/items/registries';
import { itemViews } from '../content/items/views';

const MAX_WHEEL_TURN = 0.45;
/** How far the body leans outward and yaws into a drift, radians. */
const DRIFT_LEAN = 0.12;
const DRIFT_YAW = 0.35;
/** Spark colour per mini-turbo tier (0 = charging, not yet blue). */
const SPARK_COLOURS = [0xfff3b0, 0x3fa9ff, 0xff9a1f, 0xb15cff] as const;
/** Kart headlights on night tracks: lamps this far forward and high, this wide, lighting this far, m. */
const KART_HEADLIGHTS = [1.05, 0.4, 1.2, 9] as const;

/** Scratch object for posing each spark instance. */
const spark = new THREE.Object3D();

/** Where a kart is drawn facing and which way is up (MK-99: walls and ceilings on mesh tracks). */
export interface DrawnFrame {
  forward: THREE.Vector3;
  up: THREE.Vector3;
}

const basis = new THREE.Matrix4();
const right = new THREE.Vector3();
const axisUp = new THREE.Vector3();
const axisBack = new THREE.Vector3();
const beforeQ = new THREE.Quaternion();
const after = new THREE.Quaternion();

/** The rotation that takes the model's rest pose (facing −Z, +Y up) to `forward`/`up`. */
function surfaceQuaternion(
  forward: { x: number; y: number; z: number },
  up: { x: number; y: number; z: number },
  out: THREE.Quaternion,
): THREE.Quaternion {
  axisUp.set(up.x, up.y, up.z);
  axisBack.set(-forward.x, -forward.y, -forward.z);
  right.crossVectors(axisUp, axisBack).normalize();
  axisBack.crossVectors(right, axisUp).normalize();
  basis.makeBasis(right, axisUp, axisBack);
  return out.setFromRotationMatrix(basis);
}

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

/** How see-through the kart's effects draw it (MK-66: `ItemView.kartOpacity`; 1 = solid). */
function effectsOpacity(kart: KartState, tick: number): number {
  let opacity = 1;
  for (const effect of kart.effects) {
    if (!itemEffects.has(effect.kind)) continue;
    const item = itemEffects.get(effect.kind).item;
    const view = itemViews.has(item) ? itemViews.get(item) : undefined;
    const o = view?.kartOpacity?.(effect, tick);
    if (o !== undefined) opacity = Math.min(opacity, o);
  }
  return opacity;
}

/** A mesh material's own look, kept when it's first made see-through. */
interface SolidLook {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

/**
 * Draws a kart model at `opacity` (1 = as modelled). The first time, each mesh gets its own copy
 * of its material (models may share them), remembering its solid look to restore.
 */
function setOpacity(root: THREE.Object3D, opacity: number): void {
  const was = root.userData.opacity as number | undefined;
  if (was === opacity || (opacity === 1 && was === undefined)) return;
  root.userData.opacity = opacity;
  // Switching between solid and see-through changes how materials draw: recompile them then only.
  const flip = (was ?? 1) < 1 !== opacity < 1;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || Array.isArray(node.material)) return;
    let material = node.material as THREE.Material;
    let solid = node.userData.solidLook as SolidLook | undefined;
    if (!solid) {
      material = material.clone();
      node.material = material;
      solid = {
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
      };
      node.userData.solidLook = solid;
    }
    const ghost = opacity < 1;
    material.opacity = solid.opacity * opacity;
    material.transparent = ghost || solid.transparent;
    material.depthWrite = !ghost && solid.depthWrite;
    if (flip) material.needsUpdate = true;
  });
}

/** A drawn kart pose; a `KartPoseFilter` moves it in place. */
export interface KartPose {
  x: number;
  y: number;
  z: number;
  heading: number;
}

/**
 * Moves where karts are drawn without touching the sim (online render smoothing, MK-45: the
 * client's `NetSmoother`). `pose` is kart `kartId` interpolated `alpha` from tick `tick - 1` to `tick`.
 */
export interface KartPoseFilter {
  frame(seconds: number): void;
  adjust(kartId: number, pose: KartPose, tick: number, alpha: number): void;
}

/** Kart meshes driven by sim state, interpolated between ticks. */
export class KartRenderer {
  private readonly models: KartModel[] = [];
  private readonly types: KartId[] = [];
  /** Last sim tick the wheels were advanced for, so they spin once per tick, not per frame. */
  private wheelTick = -1;
  private readonly pose: KartPose = { x: 0, y: 0, z: 0, heading: 0 };

  /** Night tracks (MK-60): karts drive with their headlights on (set before the karts are built). */
  headlights = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly factory: KartModelFactory = new PrimitiveKartFactory(),
  ) {}

  sync(
    previous: SimState,
    current: SimState,
    alpha: number,
    inputs: readonly InputFrame[] = [],
    filter?: KartPoseFilter,
  ) {
    const pose = this.pose;
    current.karts.forEach((kart, i) => {
      const model = this.models[i] ?? this.createModel(kart);
      const before = previous.karts[i] ?? kart;
      pose.x = before.position.x + (kart.position.x - before.position.x) * alpha;
      pose.y = before.position.y + (kart.position.y - before.position.y) * alpha;
      pose.z = before.position.z + (kart.position.z - before.position.z) * alpha;
      pose.heading = lerpAngle(before.heading, kart.heading, alpha);
      filter?.adjust(i, pose, current.tick, alpha);
      model.root.position.set(pose.x, pose.y, pose.z);
      if (kart.up && kart.forward) {
        // Mesh tracks (MK-99): stand on the surface, interpolating the frame between ticks.
        surfaceQuaternion(before.forward ?? kart.forward, before.up ?? kart.up, beforeQ);
        surfaceQuaternion(kart.forward, kart.up, after);
        model.root.quaternion.slerpQuaternions(beforeQ, after, alpha);
      } else model.root.rotation.set(0, pose.heading, 0);

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
    // Spin-out (MK-17): one full turn over the spin time.
    const spin = kart.spinTimer > 0 ? (1 - kart.spinTimer / tuning.spinSeconds) * Math.PI * 2 : 0;
    model.body.rotation.y = -drift * DRIFT_YAW + spin;

    const showSparks = drift !== 0;
    const colour = SPARK_COLOURS[kart.drift.tier];
    model.sparks.forEach((cluster, side) => {
      cluster.visible = showSparks;
      if (!showSparks) return;
      const size = kart.drift.tier === 0 ? 0.5 : 1;
      cluster.material.color.setHex(colour);
      for (let n = 0; n < cluster.count; n += 1) {
        const r = noise(tick * 7 + n * 13 + side * 101);
        const angle = (n / cluster.count) * Math.PI * 2 + r;
        spark.position.set(
          Math.cos(angle) * 0.25 * size,
          Math.abs(Math.sin(angle)) * 0.3 * size,
          r * 0.4,
        );
        spark.rotation.set(-0.6 - r * 0.6, angle * 0.3, 0);
        spark.scale.setScalar(size * (0.6 + r * 0.8));
        spark.updateMatrix();
        cluster.setMatrixAt(n, spark.matrix);
      }
      cluster.instanceMatrix.needsUpdate = true;
    });

    // Respawn: drone overhead while carried, then blink while invulnerable.
    model.drone.visible = kart.respawnTimer > 0;
    if (model.drone.visible) model.drone.rotation.y = tick * 0.3;
    model.body.visible = kart.invulnerableTimer <= 0 || Math.floor(tick / 5) % 2 === 0;
    setOpacity(model.root, effectsOpacity(kart, tick));

    // Star (MK-20): a rainbow glow around the kart. Lightning: shrink to half size.
    const aura = starAura(model);
    aura.visible = kart.starTimer > 0;
    if (aura.visible) {
      (aura.material as THREE.MeshBasicMaterial).color.setHSL((tick * 0.03) % 1, 1, 0.55);
      aura.scale.setScalar(1 + Math.sin(tick * 0.4) * 0.06);
    }
    const size = kart.shrinkTimer > 0 ? 0.5 : 1;
    const current = model.root.scale.x;
    model.root.scale.setScalar(current + (size - current) * 0.2);

    model.flame.visible = kart.boostTimer > 0;
    if (model.flame.visible) {
      const flicker = 0.85 + noise(tick) * 0.4;
      model.flame.scale.set(flicker, 1 + noise(tick + 1) * 0.6, flicker);
    }
  }

  /** Removes every kart model (a new race with different karts is about to start). */
  reset(): void {
    for (const model of this.models) this.scene.remove(model.root);
    this.models.length = 0;
    this.types.length = 0;
    this.wheelTick = -1;
  }

  /** Any kart's model root (for the camera to follow another kart). */
  /** The visual body of kart `id` (for squash & stretch effects). */
  body(id: number): THREE.Object3D | undefined {
    return this.models[id]?.body;
  }

  kart(id: number): THREE.Object3D | undefined {
    return this.models[id]?.root;
  }

  /** Kart `id`'s drawn facing and up (world), written into `out`; false if it has no model. */
  frame(id: number, out: DrawnFrame): boolean {
    const root = this.models[id]?.root;
    if (!root) return false;
    out.forward.set(0, 0, -1).applyQuaternion(root.quaternion);
    out.up.set(0, 1, 0).applyQuaternion(root.quaternion);
    return true;
  }

  private createModel(kart: KartState): KartModel {
    // The same kart type twice in a race gets an alternate paint job.
    const repeats = this.types.filter((type) => type === kart.kartType).length;
    this.types.push(kart.kartType);
    const model = this.factory.create(kart.kartType, alternateColours(kart.kartType, repeats));
    if (this.headlights) model.body.add(createHeadlights(...KART_HEADLIGHTS));
    this.scene.add(model.root);
    this.models.push(model);
    return model;
  }
}

/** The star glow for a kart model, created on first use. */
function starAura(model: KartModel): THREE.Mesh {
  const existing = model.root.userData.aura as THREE.Mesh | undefined;
  if (existing) return existing;
  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 12, 8),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  aura.position.y = 0.6;
  aura.visible = false;
  model.root.add(aura);
  model.root.userData.aura = aura;
  return aura;
}
