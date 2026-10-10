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
import { CoinRenderer } from './coins';
import { ItemBoxRenderer } from './itemBoxes';
import { skinOf } from './itemSkins';
import { drawnGroundFor } from './drawnGround';
import { KartRenderer, type DrawnFrame, type KartPoseFilter } from './karts';
import { NameTags } from './nameTags';
import { AdaptiveQuality } from './quality';
import { CAMERA_FAR, CAMERA_NEAR, createScene, defaultLook } from './scene';
import { trackTheme } from './theme';
import type { TrackLook } from './trackLook';
import {
  chaseCameraRange,
  createTrackView,
  overviewCamera,
  type TrackViewUpdate,
} from './trackView';
import { trackViews } from '../content/tracks/render';
import { UnderwaterView } from './underwater';
import {
  pixelRect,
  splitViews,
  STEP_DOWN_FROM_VIEWS,
  STEPPED_DOWN_PIXEL_RATIO,
  viewFov,
  type SplitLayout,
  type ViewRect,
} from './viewports';

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
  /**
   * The local players' karts by slot, P1 first (MK-145): with 2–4 of them the chase view splits,
   * one view each. Fewer: the one view follows `follow`.
   */
  views?: () => readonly number[];
  /** How two players' views share the screen (MK-145): stacked (default) or side by side. */
  splitLayout?: () => SplitLayout;
}

/** One player's view of a split screen (MK-145), as the HUD and tests see it. */
export interface PlayerView {
  /** Player slot: 0 = P1. */
  slot: number;
  kartId: number;
  rect: ViewRect;
}

/** A split-screen view after P1's: its own camera and chase camera (MK-145). */
interface ExtraView {
  camera: THREE.PerspectiveCamera;
  chase: ChaseCamera;
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
  /** Coins (MK-109), on tracks that have them. */
  private readonly coins: CoinRenderer;
  /** Underwater look (MK-107), on tracks with water. */
  private readonly underwater: UnderwaterView;
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
  /** Split-screen (MK-145): P2–P4's cameras, made the first time they're needed. */
  private readonly extraViews: ExtraView[] = [];
  /** The 3-player split's overview quadrant camera (MK-145). */
  private overviewCam: THREE.PerspectiveCamera | undefined;
  /** The karts the split views follow this frame, P1 first; empty with one view. */
  private viewKarts: readonly number[] = [];
  /** The split views drawn last frame (MK-145); empty with one view. */
  private playerViews: PlayerView[] = [];
  /** The overview quadrant of a 3-player split (MK-145). */
  private overview: ViewRect | undefined;
  /** 3–4 views: quality stepped down (MK-145). */
  private steppedDown = false;
  private readonly canvasSize = new THREE.Vector2();
  private readonly spot = new THREE.Vector3();

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
    this.karts.setDrawnGround(drawnGroundFor(options.track));
    this.karts.headlights = trackTheme(options.track).night ?? false;
    this.chaseCamera = new ChaseCamera(this.camera);
    // Juice (MK-27). Shake and FOV kick respect reduced motion (OS setting or &reduced-motion=1).
    this.chaseCamera.reducedMotion = options.reducedMotion;
    this.effects = new Effects(this.scene, this.karts, (kartId) => this.chaseOf(kartId));
    this.itemBoxes = new ItemBoxRenderer(this.scene);
    this.coins = new CoinRenderer(this.scene);
    this.underwater = new UnderwaterView(this.scene);
    this.nameTags = new NameTags(this.scene);
    this.addItemRenderers();
    this.aiDebug = options.aiDebug ? new AiDebugView(this.scene) : undefined;
    window.addEventListener('resize', () => this.markChanged());

    // Adaptive quality (MK-28).
    this.lowQualityHooks = [
      (low) => this.effects.setLowQuality(low),
      (low) => this.track.look?.setLowQuality?.(low),
    ];
    this.quality = new AdaptiveQuality(window.devicePixelRatio, () => this.applyQuality());
    if (options.lowQuality) this.quality.forceLow();
  }

  /** Adaptive quality's pixel ratio and low-quality mode, stepped down for 3–4 views (MK-145). */
  private applyQuality(): void {
    const { pixelRatio, lowQuality } = this.quality;
    const stepped = this.steppedDown;
    this.renderer.setPixelRatio(
      stepped ? Math.min(pixelRatio, STEPPED_DOWN_PIXEL_RATIO) : pixelRatio,
    );
    this.lowQualityHooks.forEach((hook) => hook(lowQuality || stepped));
    this.markChanged();
  }

  /** The chase camera following kart `kartId`, if a view follows it (camera juice, MK-27). */
  private chaseOf(kartId: number): ChaseCamera | undefined {
    if (this.viewKarts.length < 2) return kartId === this.followId ? this.chaseCamera : undefined;
    const index = this.viewKarts.indexOf(kartId);
    if (index < 0) return undefined;
    return index === 0 ? this.chaseCamera : this.extraViews[index - 1]?.chase;
  }

  /** The split views drawn last frame (MK-145), P1 first; empty with a single view. */
  views(): readonly PlayerView[] {
    return this.playerViews;
  }

  /** The 3-player split's overview quadrant (MK-145), if one shows. */
  overviewRect(): ViewRect | null {
    return this.overview ?? null;
  }

  /**
   * Where kart `kartId` is drawn in the overview quadrant (MK-145), as fractions of the quadrant
   * from its top left; null without an overview or kart.
   */
  overviewSpot(kartId: number): { x: number; y: number } | null {
    const model = this.karts.kart(kartId);
    const camera = this.overviewCam;
    if (!this.overview || !model || !camera) return null;
    const point = this.spot.copy(model.position).project(camera);
    return { x: (point.x + 1) / 2, y: (1 - point.y) / 2 };
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
    // Split views start behind their karts again (new cameras snap on their first frame).
    this.extraViews.length = 0;
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
    const { near, far } = chaseCameraRange(this.track.def);
    if (this.camera.far !== far || this.camera.near !== near) {
      this.camera.far = far;
      this.camera.near = near;
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
    this.coins.sync(state, state.tick / 60);
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
    const kart = state.karts[followId];
    // Split-screen (MK-145): 2–4 local players in the chase view get a view each.
    const viewKarts = view === 'chase' ? (this.options.views?.() ?? []) : [];
    const split = viewKarts.length > 1;
    this.viewKarts = split ? viewKarts : [];
    this.setSteppedDown(split && viewKarts.length >= STEP_DOWN_FROM_VIEWS);
    this.applyOverview(view === 'overview');
    // Paused: the cameras hold still (shake and FOV kick freeze too).
    const seconds = game.paused ? 0 : frameSeconds;
    if (view === 'lineup') {
      this.lineup.update(game.paused ? 0 : frameSeconds);
    } else if (split) {
      viewKarts.forEach((kartId, i) => {
        const extra = i === 0 ? undefined : this.extraView(i - 1);
        this.followKart(extra?.chase ?? this.chaseCamera, kartId, seconds, snapCamera);
        if (extra) this.fitRange(extra.camera);
      });
    } else if (view === 'chase') {
      this.followKart(this.chaseCamera, followId, seconds, snapCamera);
    }
    const followedSpeed = kart ? Math.abs(kart.speed) / tuning.topSpeed[state.engineClass] : 0;
    // One screen-wide speed-lines overlay: not over several views.
    this.effects.update(state, followId, followedSpeed, split ? 'split' : view);
    this.nameTags.sync(
      state,
      followId,
      (id) => this.karts.kart(id),
      this.camera,
      this.options.playerColour ?? (() => DEFAULT_TAG_COLOUR),
      view === 'chase',
    );
    this.layOutViews(split ? viewKarts : []);
    const route = this.track.def.kind === 'mesh' ? this.track.def.route : undefined;
    this.underwater.sync(state, route, simTime, (id) => this.karts.body(id), this.camera);
    this.onUpdate(frameSeconds);
    const look = this.track.look;
    look?.update?.({ state, ticks, followId, camera: this.camera, paused: game.paused });
    if (!draw) return;
    if (split) this.drawSplit(state);
    else if (!look?.render?.()) this.renderer.render(this.scene, this.camera);
  }

  /** Moves `chase` (and so its camera) behind kart `kartId` for this frame. */
  private followKart(chase: ChaseCamera, kartId: number, seconds: number, snap: boolean): void {
    const state = this.game.state;
    const followed = this.karts.kart(kartId);
    const kart = state.karts[kartId];
    if (!followed || !kart) return;
    const speedRatio = Math.abs(kart.speed) / tuning.topSpeed[state.engineClass];
    // Gliding (MK-106): pull back as the glider opens, in again as it folds.
    chase.pullBack = this.karts.gliderOpenness(kartId);
    // Mesh tracks (MK-99): follow the kart's own up, onto walls and ceilings.
    if (kart.up && this.karts.frame(kartId, this.followedFrame))
      chase.followSurface(followed, this.followedFrame, speedRatio, seconds, snap, this.cameraClip);
    else chase.update(followed, speedRatio, seconds, 0, snap);
  }

  /** P2–P4's view `index` (0 = P2), made on first use. */
  private extraView(index: number): ExtraView {
    let extra = this.extraViews[index];
    if (!extra) {
      const camera = new THREE.PerspectiveCamera(this.camera.fov, 1, CAMERA_NEAR, CAMERA_FAR);
      const chase = new ChaseCamera(camera);
      chase.reducedMotion = this.options.reducedMotion;
      extra = { camera, chase };
      this.extraViews[index] = extra;
    }
    return extra;
  }

  /** A split view's clip planes: the track's chase range, as P1's camera (MK-145). */
  private fitRange(camera: THREE.PerspectiveCamera): void {
    const { near, far } = chaseCameraRange(this.track.def);
    if (camera.far === far && camera.near === near) return;
    camera.far = far;
    camera.near = near;
    camera.updateProjectionMatrix();
  }

  /** Steps quality down for 3–4 views and back up after (MK-145). */
  private setSteppedDown(on: boolean): void {
    if (on === this.steppedDown) return;
    this.steppedDown = on;
    this.applyQuality();
  }

  /**
   * The split views for `viewKarts` (MK-145), for the HUD and tests; none with one view. Leaving
   * split-screen puts P1's camera back on the whole canvas.
   */
  private layOutViews(viewKarts: readonly number[]): void {
    if (viewKarts.length < 2) {
      if (this.playerViews.length > 0) this.fitCamera(this.camera, { x: 0, y: 0, w: 1, h: 1 });
      this.playerViews = [];
      this.overview = undefined;
      return;
    }
    const { views, overview } = splitViews(
      viewKarts.length,
      this.options.splitLayout?.() ?? 'stacked',
    );
    this.playerViews = views.map((rect, slot) => ({ slot, kartId: viewKarts[slot] ?? -1, rect }));
    this.overview = overview;
  }

  /** Sets `camera`'s aspect to `rect`'s on the canvas. */
  private fitCamera(camera: THREE.PerspectiveCamera, rect: ViewRect): void {
    const { x: width, y: height } = this.renderer.getSize(this.canvasSize);
    const aspect = (rect.w * width) / Math.max(1, rect.h * height);
    if (Math.abs(camera.aspect - aspect) < 1e-6) return;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  /**
   * Draws each player's view into its part of the canvas (MK-145), and the 3-player split's
   * overview quadrant. Renderer stats add up over the views. MK8 courses' post-processing (bloom,
   * boost blur) is off in split-screen (MK-148): a full-screen pass per view would cost more than
   * the views themselves; with 2 views the course's tone mapping stays, 3–4 step down to low.
   */
  private drawSplit(state: SimState): void {
    const renderer = this.renderer;
    const { x: width, y: height } = renderer.getSize(this.canvasSize);
    const overview = this.overview;
    renderer.info.autoReset = false;
    renderer.info.reset();
    renderer.setScissorTest(true);
    const colour = this.options.playerColour ?? (() => DEFAULT_TAG_COLOUR);
    const drawInto = (rect: ViewRect, camera: THREE.PerspectiveCamera) => {
      const px = pixelRect(rect, width, height);
      renderer.setViewport(px.x, px.y, px.w, px.h);
      renderer.setScissor(px.x, px.y, px.w, px.h);
      renderer.render(this.scene, camera);
    };
    for (const { slot, kartId, rect } of this.playerViews) {
      const camera = slot === 0 ? this.camera : this.extraView(slot - 1).camera;
      this.fitCamera(camera, rect);
      const models = (id: number) => this.karts.kart(id);
      this.nameTags.sync(state, kartId, models, camera, colour, true);
      // A very wide view draws with a narrower vertical FOV; the chase camera keeps its own.
      const fov = camera.fov;
      camera.fov = viewFov(fov, camera.aspect);
      camera.updateProjectionMatrix();
      drawInto(rect, camera);
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    if (overview) {
      this.overviewCam ??= new THREE.PerspectiveCamera(this.camera.fov, 1, CAMERA_NEAR, CAMERA_FAR);
      const camera = this.overviewCam;
      this.fitCamera(camera, overview);
      overviewCamera(camera, this.track.def);
      this.nameTags.sync(state, -1, () => undefined, camera, colour, false);
      const fog = this.scene.fog;
      this.scene.fog = null;
      drawInto(overview, camera);
      this.scene.fog = fog;
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.info.autoReset = true;
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
    // An MK8 course's look (MK-125): light, sky, post-processing, water, ambience.
    const view = trackViews.has(def.id) ? trackViews.get(def.id) : undefined;
    const look = view?.look?.({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      objects,
      // The launch track is built before adaptive quality exists (`forceLow` tells it later).
      lowQuality: (this.quality as AdaptiveQuality | undefined)?.lowQuality ?? false,
      reducedMotion: this.options.reducedMotion,
    });
    this.track = { def, update, hazards, objects, look };
  }

  /** Swaps the drawn track for `def` (MK-78): an online or menu race on another track. */
  private setTrack(def: TrackDef): void {
    this.track.look?.dispose();
    for (const object of this.track.objects) {
      this.scene.remove(object);
      disposeObject(object);
    }
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.buildTrack(def);
    this.karts.setDrawnGround(drawnGroundFor(def));
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
      underwater: this.underwater.cameraUnder,
      propellers: this.underwater.propellersShown(),
      views: this.playerViews.map(({ slot, kartId, rect }) => {
        const camera = slot === 0 ? this.camera : this.extraView(slot - 1).camera;
        const { x, y, z } = camera.position;
        return { slot, kartId, rect, camera: { x, y, z, aspect: camera.aspect } };
      }),
      steppedDown: this.steppedDown,
      pixelRatio: this.renderer.getPixelRatio(),
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
  /** The track's own look (MK-125), if its view has one. */
  look: TrackLook | undefined;
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
