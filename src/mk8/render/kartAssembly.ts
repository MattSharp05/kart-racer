// An MK8 kart put together from its parts (MK-102): the body's GLB scaled to the body's length,
// four instances of the tire GLB on the body's wheel anchors, and the glider's GLB above and behind
// the driver, hidden until the kart glides (MK-106: it unfolds on launch and folds on landing).
import * as THREE from 'three';
import type { Mk8Body, Mk8Glider, Mk8Tires } from '../content/parts';
import { fitModel, mergeStaticMeshes } from './racerModel';

export const bodyModelPath = (id: string) => `models/karts/bodies/${id}.glb`;
export const tireModelPath = (id: string) => `models/karts/tires/${id}.glb`;
export const gliderModelPath = (id: string) => `models/karts/gliders/${id}.glb`;

/** The pack files a kart of these parts needs. */
export function kartFiles(parts: { body: string; tires: string; glider?: string }): string[] {
  return [
    bodyModelPath(parts.body),
    tireModelPath(parts.tires),
    ...(parts.glider !== undefined ? [gliderModelPath(parts.glider)] : []),
  ];
}

/** Which parts, and their loaded models (each a fresh scene, owned by the kart). */
export interface KartParts {
  body: Mk8Body;
  tires: Mk8Tires;
  glider?: Mk8Glider;
  models: { body: THREE.Object3D; tire: THREE.Object3D; glider?: THREE.Object3D };
}

/** Where the open glider's bottom centre sits in the kart's frame (above and behind the seat), m. */
const GLIDER_HEIGHT = 1.45;
const GLIDER_BACK = 0.35;
/** The four wheels: [side (+ = right), end (− = front, karts face −Z)]. */
const WHEELS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

/**
 * A kart: `object` holds the body and tires (merged by material, so the four tires are one draw
 * call) and the glider. Its origin is on the ground under the kart's centre.
 */
export class Mk8Kart {
  readonly object = new THREE.Group();
  /** Height of the body's underside, where a driver's seat is measured from, m. */
  readonly rideHeight: number;
  /** The wheel centres in the kart's frame, front left, front right, rear left, rear right. */
  readonly wheels: THREE.Vector3[] = [];
  private readonly glider: THREE.Group | undefined;
  /** The open glider's scale (as fitted to its span). */
  private readonly gliderScale = new THREE.Vector3(1, 1, 1);
  private openness = 0;

  constructor(readonly parts: KartParts) {
    this.object.name = 'kart';
    const { body, tires, models } = parts;
    const shell = fitModel(models.body, 'z', body.length);
    this.object.add(shell);
    const size = new THREE.Box3().setFromObject(shell).getSize(new THREE.Vector3());
    const radius = tires.diameter / 2;
    const w = body.wheels;
    for (const [side, end] of WHEELS) {
      const tire = fitModel(models.tire.clone(), 'y', tires.diameter, side > 0 ? Math.PI : 0);
      const track = end < 0 ? w.frontTrack : w.rearTrack;
      const axle = end < 0 ? w.frontAxle : w.rearAxle;
      tire.position.set((side * size.x * track) / 2, 0, (end * size.z * axle) / 2);
      this.object.add(tire);
      this.wheels.push(tire.position.clone().setY(radius));
    }
    // The tires sit under the body: lift it to rest on them.
    shell.position.y = radius;
    this.rideHeight = radius;
    mergeStaticMeshes(this.object);

    if (parts.glider && models.glider) {
      this.glider = fitModel(models.glider, 'x', parts.glider.span);
      this.glider.name = 'glider';
      this.glider.position.set(0, GLIDER_HEIGHT + radius, GLIDER_BACK);
      this.gliderScale.copy(this.glider.scale);
      this.glider.visible = false;
      this.object.add(this.glider);
    }
  }

  /** Opens (shows) or folds away (hides) the glider. */
  setGliderOpen(open: boolean): void {
    this.setGliderOpenness(open ? 1 : 0);
  }

  /**
   * Unfolds the glider part-way (MK-106; `render/glider.ts`'s `nextOpenness` times it): 0 folded
   * away (hidden) … 1 fully open. It spreads sideways from the middle and rises into place.
   */
  setGliderOpenness(openness: number): void {
    this.openness = Math.min(1, Math.max(0, openness));
    if (!this.glider) return;
    const s = Math.max(this.openness, 1e-3);
    const { x, y, z } = this.gliderScale;
    this.glider.scale.set(x * s, y * (0.5 + 0.5 * s), z * (0.5 + 0.5 * s));
    this.glider.visible = this.openness > 0;
  }

  get gliderOpen(): boolean {
    return this.glider?.visible ?? false;
  }

  /** How far the glider is unfolded, 0–1. */
  get gliderOpenness(): number {
    return this.glider ? this.openness : 0;
  }

  get hasGlider(): boolean {
    return this.glider !== undefined;
  }
}
