import * as THREE from 'three';
import { itemRendererClasses, type ItemRenderer } from '../content/items/render';
import type { Game } from '../game/game';
import type { RenderInfo } from '../game/testApi';
import type { ScenarioView } from '../scenarios/registry';
import type { TrackDef } from '../sim/track';
import { DT, tuning } from '../sim/tuning';
import type { InputFrame } from '../sim/types';
import { AiDebugView } from './aiDebug';
import { ChaseCamera, LineupCamera } from './camera';
import { Effects } from './effects';
import { ItemBoxRenderer } from './itemBoxes';
import { KartRenderer, type KartPoseFilter } from './karts';
import { AdaptiveQuality } from './quality';
import { createScene } from './scene';
import { createTrackView, overviewCamera } from './trackView';

/** Longest real frame we feed the sim, so a backgrounded tab doesn't cause a huge catch-up. */
const MAX_FRAME_SECONDS = 0.25;
/**
 * While paused, keep drawing only until the camera has settled, then stop: redrawing an unchanged
 * scene every frame wastes battery (and makes software-rendered CI browsers crawl).
 */
const SETTLE_FRAMES = 30;

/** Frame stats sink (`?perf=1` overlay), kept structural so render/ doesn't depend on ui/. */
export interface FrameStats {
  frame(
    seconds: number,
    simMs: number,
    info: { calls: number; triangles: number },
    quality: { pixelRatio: number; lowQuality: boolean },
  ): void;
}

export interface WorldOptions {
  track: TrackDef;
  view: ScenarioView;
  /** Kart the camera and sound follow: the local player's, unless spectating another. */
  follow: number;
  /** Live player inputs indexed by kart id, for steering-wheel/lean poses. */
  playerInputs: () => InputFrame[];
  reducedMotion: boolean;
  aiDebug: boolean;
  /** Where karts are drawn, if not straight from the sim (an online client's smoothing, MK-45). */
  poseFilter?: () => KartPoseFilter | null | undefined;
}

/**
 * Everything drawn in 3D (MK-35): scene, cameras, all renderers, adaptive quality and the render
 * loop, which runs the sim and draws it interpolated between ticks. Reads sim state, never writes it.
 */
export class World {
  view: ScenarioView;
  followId: number;
  /** Per-frame hook after the scene is synced, before drawing (HUD, sound, touch controls). */
  onUpdate: (frameSeconds: number) => void = () => {};
  /** Optional frame stats sink (`?perf=1`). */
  perf: FrameStats | undefined;

  readonly karts: KartRenderer;
  readonly effects: Effects;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly lineup: LineupCamera;
  private readonly chaseCamera: ChaseCamera;
  private readonly itemBoxes: ItemBoxRenderer;
  /** Bananas, shells… one renderer per item renderer class (`src/content/items/<id>/render.ts`). */
  private readonly itemRenderers: ItemRenderer[];
  private readonly aiDebug: AiDebugView | undefined;
  private readonly quality: AdaptiveQuality;
  /** Render parts that get cheaper in low-quality mode register here. */
  private readonly lowQualityHooks: ((low: boolean) => void)[];
  private framesSinceChange = 0;
  /** Tick (plus alpha) drawn last frame, for the pose filter's clock while paused. */
  private lastSimTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly game: Game,
    private readonly options: WorldOptions,
  ) {
    ({ renderer: this.renderer, scene: this.scene, camera: this.camera } = createScene(canvas));
    // Menus and races all happen on the launch track (Sunny Circuit, unless a scenario says otherwise).
    createTrackView(this.scene, options.track);
    this.view = options.view;
    this.followId = options.follow;
    if (this.view === 'overview') overviewCamera(this.camera, options.track);
    this.lineup = new LineupCamera(this.camera);
    this.karts = new KartRenderer(this.scene);
    this.chaseCamera = new ChaseCamera(this.camera);
    // Juice (MK-27). Shake and FOV kick respect reduced motion (OS setting or &reduced-motion=1).
    this.chaseCamera.reducedMotion = options.reducedMotion;
    this.effects = new Effects(this.scene, this.karts, this.chaseCamera);
    this.itemBoxes = new ItemBoxRenderer(this.scene);
    this.itemRenderers = itemRendererClasses().map((Renderer) => new Renderer(this.scene));
    this.aiDebug = options.aiDebug ? new AiDebugView(this.scene) : undefined;
    window.addEventListener('resize', () => this.markChanged());

    // Adaptive quality (MK-28).
    this.lowQualityHooks = [(low) => this.effects.setLowQuality(low)];
    this.quality = new AdaptiveQuality(window.devicePixelRatio, (pixelRatio, lowQuality) => {
      this.renderer.setPixelRatio(pixelRatio);
      this.lowQualityHooks.forEach((hook) => hook(lowQuality));
      this.markChanged();
    });
  }

  /** A new state was loaded: rebuild the karts and switch camera to follow kart `follow`. */
  reset(view: ScenarioView, follow: number): void {
    this.karts.reset();
    this.effects.reset();
    this.view = view;
    this.followId = follow;
    this.markChanged();
  }

  /** Something visible changed while paused: draw again until the camera settles. */
  markChanged(): void {
    this.framesSinceChange = 0;
  }

  /** Points the kart-select lineup camera at kart `index`. */
  focusLineupKart(index: number, snap = false): void {
    const model = this.karts.kart(index);
    const position = this.game.state.karts[index]?.position;
    if (position) {
      this.lineup.focus(
        model?.position ?? new THREE.Vector3(position.x, position.y, position.z),
        true,
        snap,
      );
    }
    this.markChanged();
  }

  /** Updates karts and camera for this frame, then draws (unless `draw` is false). */
  render(frameSeconds: number, snapCamera = false, draw = true): void {
    const { game, view, followId } = this;
    const state = game.state;
    const filter = this.options.poseFilter?.() ?? undefined;
    // Offsets decay with real time while the race runs; paused, with the ticks stepped (so a test's
    // `step` decays them like real play would, and a still frame keeps them).
    const simTime = state.tick + game.alpha;
    filter?.frame(game.paused ? Math.max(0, simTime - this.lastSimTime) * DT : frameSeconds);
    this.lastSimTime = simTime;
    this.karts.sync(game.previousState, state, game.alpha, this.options.playerInputs(), filter);
    this.itemBoxes.sync(state, state.tick / 60);
    for (const renderer of this.itemRenderers) renderer.sync(state, state.tick / 60);
    this.aiDebug?.sync(state);
    const followed = this.karts.kart(followId);
    const kart = state.karts[followId];
    if (view === 'lineup') {
      this.lineup.update(game.paused ? 0 : frameSeconds);
    } else if (followed && kart && view === 'chase') {
      const speedRatio = Math.abs(kart.speed) / tuning.topSpeed[state.engineClass];
      // Paused: the camera holds still (shake and FOV kick freeze too).
      this.chaseCamera.update(followed, speedRatio, game.paused ? 0 : frameSeconds, 0, snapCamera);
    }
    const followedSpeed = kart ? Math.abs(kart.speed) / tuning.topSpeed[state.engineClass] : 0;
    this.effects.update(state, followId, followedSpeed, view);
    this.onUpdate(frameSeconds);
    if (draw) this.renderer.render(this.scene, this.camera);
  }

  /** Renderer stats and camera juice state for the test API. */
  renderInfo(): RenderInfo {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      camera: {
        fov: this.camera.fov,
        shake: this.chaseCamera.shake,
        fovKick: this.chaseCamera.fovKick,
      },
    };
  }

  /** Starts the animation loop: sim frame, then render (skipped once a paused scene settles). */
  start(): void {
    let lastTime: number | undefined;
    this.renderer.setAnimationLoop((time) => {
      const frameSeconds =
        lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
      lastTime = time;
      const simStart = performance.now();
      this.game.frame(frameSeconds);
      const simMs = performance.now() - simStart;
      if (!this.game.paused || this.view === 'lineup') this.markChanged();
      if (this.framesSinceChange > SETTLE_FRAMES) return;
      this.framesSinceChange += 1;
      this.render(frameSeconds);
      if (!this.game.paused) this.quality.frame(frameSeconds);
      this.perf?.frame(frameSeconds, simMs, this.renderer.info.render, this.quality);
    });
  }
}
