// An MK8 course's look (MK-125): its light, sky and fog from `content/courses/<id>/look.ts`, glowing
// lamps, rippling water and, at full quality, MK8's glossy finish: reflections, bloom, boost motion blur
// and ACES tone mapping (`post.ts`). Low quality (`&quality=low`, or adaptive quality on a slow
// device) keeps the light, sky, water and ambience but draws plainly: no post-processing at all.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { skyGradient } from '../../render/scenery';
import type { TrackLook, TrackLookContext, TrackLookFrame } from '../../render/trackLook';
import { DT } from '../../sim/tuning';
import type { KartState } from '../../sim/types';
import type { CourseAmbience } from '../audio/ambience';
import type { CourseLook } from '../content/courses/types';
import { CoursePost } from './post';
import { applyWater, setWaterTime } from './water';

/** Where the sun is put along its direction, m (a directional light: only the direction counts). */
const SUN_DISTANCE = 100;
/** Boost blur eases in and out over this long, s. */
const BOOST_EASE_SECONDS = 0.25;
/** The reflections' blur (PMREM's sigma for the room). */
const ROOM_BLUR = 0.04;

/** What the look exposes to tests (`window.__mk8Look`). */
export interface LookInfo {
  post: boolean;
  toneMapping: THREE.ToneMapping;
  exposure: number;
  boost: number;
  water: number;
  fog: boolean;
  ambience: boolean;
}

declare global {
  interface Window {
    /** The course look drawn now (MK-125), for e2e tests. */
    __mk8Look?: () => LookInfo;
  }
}

/** The glossy reflections' environment, made once per renderer. */
const environments = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

function environment(renderer: THREE.WebGLRenderer): THREE.Texture {
  let texture = environments.get(renderer);
  if (!texture) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    texture = pmrem.fromScene(new RoomEnvironment(), ROOM_BLUR).texture;
    pmrem.dispose();
    environments.set(renderer, texture);
  }
  return texture;
}

/** Whether `kart` is boosting (mushroom, mini-turbo, boost panel, anti-gravity spin). */
export function boosting(kart: KartState | undefined): boolean {
  return kart !== undefined && (kart.boostTimer > 0 || (kart.spinBoostTimer ?? 0) > 0);
}

/**
 * Applies `look` to the scene the world just built and returns its per-frame hooks. `ambience`
 * plays the course's loops (none in unit tests).
 */
export function createCourseLook(
  look: CourseLook,
  context: TrackLookContext,
  ambience?: CourseAmbience,
): TrackLook {
  const { renderer, scene, camera, objects } = context;
  const before = { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure };
  // The sun is the scene's for every track: its position goes back when the course does.
  const sunPositions = new Map<THREE.DirectionalLight, THREE.Vector3>();
  scene.traverse((o) => {
    if (o instanceof THREE.DirectionalLight) sunPositions.set(o, o.position.clone());
  });
  applyLight(scene, look);
  for (const root of objects) markMaterials(root, look);
  const water = look.water ? applyWater(objects, look.water) : 0;

  let post: CoursePost | undefined;
  let low = context.lowQuality;
  let boost = 0;
  let lastTicks: number | undefined;

  const setQuality = (lowQuality: boolean) => {
    low = lowQuality;
    renderer.toneMapping = low ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = low ? 1 : look.exposure;
    scene.environment = low || look.reflections <= 0 ? null : environment(renderer);
    scene.environmentIntensity = look.reflections;
    if (low) {
      post?.dispose();
      post = undefined;
    } else {
      post ??= new CoursePost(renderer, scene, camera, look);
    }
  };
  setQuality(low);

  const info = (): LookInfo => ({
    post: post !== undefined,
    toneMapping: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    boost: post?.boost ?? 0,
    water,
    fog: scene.fog !== null,
    ambience: ambience?.on ?? false,
  });
  if (typeof window !== 'undefined') window.__mk8Look = info;

  return {
    update(frame: TrackLookFrame) {
      const { ticks, state, followId } = frame;
      if (look.water) setWaterTime(ticks, look.water, 1 / DT);
      // The blur eases with the drawn tick, so a still frame (and a screenshot) holds them.
      const seconds = lastTicks === undefined ? 0 : Math.max(0, ticks - lastTicks) * DT;
      lastTicks = ticks;
      const target = boosting(state.karts[followId]) && !context.reducedMotion ? 1 : 0;
      const step = seconds / BOOST_EASE_SECONDS;
      boost = target > boost ? Math.min(target, boost + step) : Math.max(target, boost - step);
      post?.setBoost(boost * look.boostBlur);
      ambience?.update(frame.paused, frame.camera.position);
    },
    render() {
      if (!post) return false;
      post.render();
      return true;
    },
    setLowQuality: setQuality,
    dispose() {
      ambience?.stop();
      post?.dispose();
      post = undefined;
      renderer.toneMapping = before.toneMapping;
      renderer.toneMappingExposure = before.exposure;
      scene.environment = null;
      scene.environmentIntensity = 1;
      for (const [sun, position] of sunPositions) sun.position.copy(position);
      if (typeof window !== 'undefined' && window.__mk8Look === info) delete window.__mk8Look;
    },
  };
}

/**
 * The course's sun, fill, fog and sky on the scene `createScene` made (the world frees a gradient
 * sky's texture with the track).
 */
function applyLight(scene: THREE.Scene, look: CourseLook): void {
  scene.background =
    'materials' in look.sky
      ? new THREE.Color(look.sky.colour)
      : skyGradient({ top: look.sky.top, middle: look.sky.middle, horizon: look.sky.horizon });
  scene.fog = look.fog ? new THREE.Fog(look.fog.colour, look.fog.near, look.fog.far) : null;
  const [x, y, z] = look.sun.direction;
  const towardsSun = new THREE.Vector3(x, y, z).normalize().multiplyScalar(SUN_DISTANCE);
  scene.traverse((object) => {
    if (object instanceof THREE.HemisphereLight) {
      object.color.set(look.fill.sky);
      object.groundColor.set(look.fill.ground);
      object.intensity = look.fill.intensity;
    } else if (object instanceof THREE.DirectionalLight) {
      object.color.set(look.sun.colour);
      object.intensity = look.sun.intensity;
      object.position.copy(towardsSun);
    }
  });
}

/**
 * The course model's own sky dome never takes fog; glowing materials (lamps, screens) light
 * themselves with their texture. Course materials are shared by every race on the course, so this
 * only ever sets the same values again.
 */
function markMaterials(root: THREE.Object3D, look: CourseLook): void {
  const skyNames = new Set('materials' in look.sky ? look.sky.materials : []);
  const glowNames = new Set(look.glow?.materials ?? []);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (skyNames.has(material.name) && 'fog' in material && material.fog !== false) {
        material.fog = false;
        material.needsUpdate = true;
      }
      if (
        look.glow &&
        glowNames.has(material.name) &&
        material instanceof THREE.MeshStandardMaterial &&
        material.map
      ) {
        material.emissive.set(0xffffff);
        material.emissiveMap = material.map;
        material.emissiveIntensity = look.glow.intensity;
        material.needsUpdate = true;
      }
    }
  });
}
