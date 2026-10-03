import * as THREE from 'three';
import { itemRendererClasses, type ItemRenderer } from '../content/items/render';
import type { Game } from '../game/game';
import type { RenderInfo } from '../game/testApi';
import type { ScenarioView } from '../scenarios/registry';
import { raycastMesh, surfaceMask } from '../sim/meshTrack';
import { getTrack, trackGeometry, type TrackDef } from '../sim/track';
import { DT, tuning } from '../sim/tuning';
import type { InputFrame, SimState } from '../sim/types';
import { AiDebugView } from './aiDebug';
import { ChaseCamera, LineupCamera, type CameraClip } from './camera';
import { Effects } from './effects';
import { HazardRenderer } from './hazards';
import { ItemBoxRenderer } from './itemBoxes';
import { skinOf } from './itemSkins';
import { KartRenderer, type DrawnFrame, type KartPoseFilter } from './karts';
import { NameTags } from './nameTags';
import { AdaptiveQuality } from './quality';
import { CAMERA_FAR, CAMERA_NEAR, createScene, defaultLook } from './scene';
import { trackTheme } from './theme';
import { createTrackView, overviewCamera, type TrackViewUpdate } from './trackView';

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
  /** The colour of a person's name tag, by kart id (online, MK-55). */
  playerColour?: (kartId: number) => string;
  /** `&quality=low` (MK-71): start in, and keep, adaptive quality's lowest setting. */
  lowQuality?: boolean;
}

/** A name tag's colour when the options don't say. */
const DEFAULT_TAG_COLOUR = '#ffffff';

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
  /** Keeps the chase camera inside a mesh track's walls and ceilings (MK-99). */
  private readonly cameraClip: CameraClip = (from, direction, maxDistance) => {
    const track = this.track.def;
    if (track.kind !== 'mesh') return null;
    return (
      raycastMesh(track.collision, from, direction, maxDistance, CAMERA_BLOCKERS)?.distance ?? null
    );
  };
  /** The followed kart's drawn facing and up (scratch, MK-99). */
  private readonly followedFrame: DrawnFrame = {
    forward: new THREE.Vector3(),
    up: new THREE.Vector3(),
  };
  private readonly itemBoxes: ItemBoxRenderer;
  /** The other people's names over their karts (online, MK-55). */
  private readonly nameTags: NameTags;
  /** The track drawn now (MK-78: rebuilt when a race on another track loads). */
  private track!: DrawnTrack;
  /** Bananas, shells… one renderer per item renderer class (`src/content/items/<id>/render.ts`). */
  private readonly itemRenderers = new Map<
    new (scene: THREE.Scene) => ItemRenderer,
    ItemRenderer
  >();
  /** Item skins' renderers (MK-103: MK8 races), made the first time a race with the skin shows. */
  private readonly skinRenderers = new Map<string, ItemRenderer>();
  private readonly aiDebug: AiDebugView | undefined;
  private readonly quality: AdaptiveQuality;
  /** Render parts that get cheaper in low-quality mode register here. */
  private readonly lowQualityHooks: ((low: boolean) => void)[];
  private framesSinceChange = 0;
  /** Tick (plus alpha) drawn last frame, for the pose filter's clock while paused. */
  private lastSimTime = 0;
  /** The track's fog, put away while the overview shows (hazards may set it again each frame). */
  private hiddenFog: THREE.Fog | THREE.FogExp2 | undefined;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly game: Game,
    private readonly options: WorldOptions,
  ) {
    ({ renderer: this.renderer, scene: this.scene, camera: this.camera } = createScene(canvas));
    // The launch track (Sunny Circuit, unless a scenario says otherwise); `reset` swaps it.
    this.buildTrack(options.track);
    this.view = options.view;
    this.followId = options.follow;
    this.lineup = new LineupCamera(this.camera);
    this.karts = new KartRenderer(this.scene);
    this.karts.headlights = trackTheme(options.track).night ?? false;
    this.chaseCamera = new ChaseCamera(this.camera);
    // Juice (MK-27). Shake and FOV kick respect reduced motion (OS setting or &reduced-motion=1).
    this.chaseCamera.reducedMotion = options.reducedMotion;
    this.effects = new Effects(this.scene, this.karts, this.chaseCamera);
    this.itemBoxes = new ItemBoxRenderer(this.scene);
    this.nameTags = new NameTags(this.scene);
    this.addItemRenderers();
    this.aiDebug = options.aiDebug ? new AiDebugView(this.scene) : undefined;
    window.addEventListener('resize', () => this.markChanged());

    // Adaptive quality (MK-28).
    this.lowQualityHooks = [(low) => this.effects.setLowQuality(low)];
    this.quality = new AdaptiveQuality(window.devicePixelRatio, (pixelRatio, lowQuality) => {
      this.renderer.setPixelRatio(pixelRatio);
      this.lowQualityHooks.forEach((hook) => hook(lowQuality));
      this.markChanged();
    });
    if (options.lowQuality) this.quality.forceLow();
  }

  /**
   * A new state was loaded: draw its track (rebuilt only if it changed), rebuild the karts and
   * switch camera to follow kart `follow`.
   */
  reset(view: ScenarioView, follow: number): void {
    const trackId = this.game.state.trackId;
    if (trackId !== this.track.def.id) this.setTrack(getTrack(trackId));
    this.karts.reset();
    this.effects.reset();
    this.nameTags.reset();
    this.view = view;
    this.followId = follow;
    this.markChanged();
  }

  /**
   * Overview (MK-79): straight down at the whole track, every frame (other cameras move the same
   * camera, and the window may resize), with no fog. Any other view: the camera upright again.
   */
  private applyOverview(overview: boolean): void {
    if (overview) {
      overviewCamera(this.camera, this.track.def);
      if (this.scene.fog) this.hiddenFog = this.scene.fog;
      this.scene.fog = null;
      return;
    }
    this.camera.up.set(0, 1, 0);
    if (this.camera.far !== CAMERA_FAR || this.camera.near !== CAMERA_NEAR) {
      this.camera.far = CAMERA_FAR;
      this.camera.near = CAMERA_NEAR;
      this.camera.updateProjectionMatrix();
    }
    if (this.hiddenFog && !this.scene.fog) this.scene.fog = this.hiddenFog;
    this.hiddenFog = undefined;
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
    const ticks = game.previousState.tick + (state.tick - game.previousState.tick) * game.alpha;
    this.track.hazards.sync(ticks, this.camera.position);
    this.track.update?.(ticks, this.camera.position);
    // Item renderers may draw on a kart where it's drawn (MK-120: Bullet Bill).
    this.addItemRenderers();
    const kartModel = (id: number) => this.karts.kart(id);
    for (const renderer of this.itemRenderers.values()) {
      renderer.sync(state, state.tick / 60, kartModel);
    }
    this.syncSkins(state);
    this.aiDebug?.sync(state);
    const followed = this.karts.kart(followId);
    const kart = state.karts[followId];
    this.applyOverview(view === 'overview');
    if (view === 'lineup') {
      this.lineup.update(game.paused ? 0 : frameSeconds);
    } else if (followed && kart && view === 'chase') {
      const speedRatio = Math.abs(kart.speed) / tuning.topSpeed[state.engineClass];
      // Paused: the camera holds still (shake and FOV kick freeze too).
      const seconds = game.paused ? 0 : frameSeconds;
      // Gliding (MK-106): pull back as the glider opens, in again as it folds.
      this.chaseCamera.pullBack = this.karts.gliderOpenness(followId);
      // Mesh tracks (MK-99): follow the kart's own up, onto walls and ceilings.
      if (kart.up && this.karts.frame(followId, this.followedFrame))
        this.chaseCamera.followSurface(
          followed,
          this.followedFrame,
          speedRatio,
          seconds,
          snapCamera,
          this.cameraClip,
        );
      else this.chaseCamera.update(followed, speedRatio, seconds, 0, snapCamera);
    }
    const followedSpeed = kart ? Math.abs(kart.speed) / tuning.topSpeed[state.engineClass] : 0;
    this.effects.update(state, followId, followedSpeed, view);
    this.nameTags.sync(
      state,
      followId,
      (id) => this.karts.kart(id),
      this.camera,
      this.options.playerColour ?? (() => DEFAULT_TAG_COLOUR),
      view === 'chase',
    );
    this.onUpdate(frameSeconds);
    if (draw) this.renderer.render(this.scene, this.camera);
  }

  /** Makes a renderer for each item renderer class not made yet (MK8 items register later). */
  private addItemRenderers(): void {
    for (const Renderer of itemRendererClasses()) {
      if (!this.itemRenderers.has(Renderer))
        this.itemRenderers.set(Renderer, new Renderer(this.scene));
    }
  }

  /** Draws the race's item skin (MK-103); skins made earlier hide themselves in other races. */
  private syncSkins(state: SimState): void {
    const skin = skinOf(state);
    if (skin && !this.skinRenderers.has(skin.id)) {
      this.skinRenderers.set(skin.id, new skin.renderer(this.scene));
    }
    const kartModel = (id: number) => this.karts.kart(id);
    for (const renderer of this.skinRenderers.values()) {
      renderer.sync(state, state.tick / 60, kartModel);
    }
  }

  /** Builds `def`'s scene: its theme, road, scenery and hazards, remembering what it added. */
  private buildTrack(def: TrackDef): void {
    const before = new Set(this.scene.children);
    defaultLook(this.scene);
    const update = createTrackView(this.scene, def);
    const hazards = new HazardRenderer(this.scene, def);
    const objects = this.scene.children.filter((o) => !before.has(o));
    this.track = { def, update, hazards, objects };
  }

  /** Swaps the drawn track for `def` (MK-78): an online or menu race on another track. */
  private setTrack(def: TrackDef): void {
    for (const object of this.track.objects) {
      this.scene.remove(object);
      disposeObject(object);
    }
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.buildTrack(def);
    // The old track's fog, if the overview put it away, isn't this track's to restore (MK-91).
    this.hiddenFog = undefined;
    this.karts.headlights = trackTheme(def).night ?? false;
    this.markChanged();
  }

  /** Renderer stats and camera juice state for the test API. */
  renderInfo(): RenderInfo {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      trackId: this.track.def.id,
      camera: {
        fov: this.camera.fov,
        shake: this.chaseCamera.shake,
        fovKick: this.chaseCamera.fovKick,
        lookDown: -this.camera.getWorldDirection(new THREE.Vector3()).y,
        trackInView: this.trackInView(),
        height: this.camera.position.y,
        up: (({ x, y, z }) => ({ x, y, z }))(this.chaseCamera.upVector(new THREE.Vector3())),
        distance: this.chaseCamera.distance(),
      },
      gliders: this.game.state.karts.map((_, i) => this.karts.gliderOpenness(i)),
    };
  }

  /** Share of the track's centreline samples the camera sees (test API, MK-79). */
  private trackInView(): number {
    const track = this.track.def;
    if (track.kind !== 'spline') return 1;
    const samples = trackGeometry(track).samples;
    this.camera.updateMatrixWorld();
    const point = new THREE.Vector3();
    const seen = samples.filter((s) => {
      point.set(s.x, s.y, s.z).project(this.camera);
      return Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && Math.abs(point.z) <= 1;
    }).length;
    return seen / samples.length;
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

/** What the chase camera can't see through on a mesh track: everything solid (not water). */
const CAMERA_BLOCKERS = surfaceMask('road', 'offroad', 'boost', 'wall', 'antigrav', 'glide');

/** A drawn track: its def, per-frame updates and the scene objects it added. */
interface DrawnTrack {
  def: TrackDef;
  /** The track's moving scenery, if it has any (MK-59: falling snow). */
  update: TrackViewUpdate | undefined;
  /** Track hazards (MK-49), posed from the tick. */
  hazards: HazardRenderer;
  objects: THREE.Object3D[];
}

/** Frees the GPU side of `root`'s meshes (three re-uploads anything shared that's used again). */
function disposeObject(root: THREE.Object3D): void {
  // A course model keeps its geometry and textures for the next race on it (MK-105).
  if (root.userData.sharedAssets === true) return;
  root.traverse((object) => {
    if (!(
      object instanceof THREE.Mesh ||
      object instanceof THREE.Points ||
      object instanceof THREE.Line
    ))
      return;
    object.geometry.dispose();
    const materials: THREE.Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
