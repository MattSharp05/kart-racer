import type * as THREE from 'three';
import type { SimState } from '../sim/types';

/**
 * A track's own look and ambience (MK-125: MK8 courses' light, sky, bloom, water and sounds), set up
 * by its `TrackView.look` when the world builds the track and torn down when it changes.
 */
export interface TrackLookContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The objects the track view added (the course model): where its materials are. */
  objects: readonly THREE.Object3D[];
  /** Adaptive quality's low-quality mode now (`&quality=low`, or a slow device). */
  lowQuality: boolean;
  /** Reduced motion (OS setting or `&reduced-motion=1`): no motion blur. */
  reducedMotion: boolean;
}

/** What a look sees each frame. */
export interface TrackLookFrame {
  state: SimState;
  /** The tick drawn (fractional, between ticks): drive motion from it, not wall time. */
  ticks: number;
  /** The kart the camera follows. */
  followId: number;
  camera: THREE.PerspectiveCamera;
  /** The race is stopped (pause menu, a test's `pause`): ambience goes quiet. */
  paused: boolean;
}

export interface TrackLook {
  update?(frame: TrackLookFrame): void;
  /** Draws the frame itself (post-processing); false leaves it to the world's plain render. */
  render?(): boolean;
  /** Adaptive quality switched low-quality mode on or off. */
  setLowQuality?(low: boolean): void;
  /** The track changes: put back what the look changed on the renderer and scene, stop sounds. */
  dispose(): void;
}
