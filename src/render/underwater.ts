// Underwater look (MK-107): on a track whose route has water volumes, karts in the water show a
// propeller at the back and trail bubbles, crossing the surface throws a splash, and while the
// camera itself is under water the screen is tinted blue with moving caustics. Render-only, from
// `KartState.inWater` and the route's water zones (course-wide water shading is the course look's).
// Nothing is built on tracks without water, so they draw exactly as before.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RouteDef } from '../sim/route';
import { DT } from '../sim/tuning';
import type { SimState } from '../sim/types';
import { hasWater, insideWater } from '../sim/underwater';

/** Particles in the shared bubble/splash pool (one draw call). */
const POOL = 384;
/** Bubbles per second from each kart in the water (more at speed). */
const BUBBLE_RATE = 10;
const BUBBLE_RATE_AT_SPEED = 25;
const BUBBLE_LIFE = 1.4;
const BUBBLE_RISE = 1.6;
/** Droplets in one splash, their life (s), launch speed (m/s) and gravity (m/s²). */
const SPLASH_DROPS = 28;
const SPLASH_LIFE = 0.8;
const SPLASH_SPEED = 4.5;
const SPLASH_GRAVITY = 14;
/** Longest frame step the particles take, s (a tab coming back doesn't jump them). */
const MAX_STEP = 0.1;
const BUBBLE_COLOUR = new THREE.Color(0xd8f4ff);
const SPLASH_COLOUR = new THREE.Color(0xffffff);
/** Propeller: where it sits on the body (karts face −Z), its spin per m/s and at rest, rad/s. */
const PROP_Z = 1.05;
const PROP_Y = 0.45;
const PROP_SPIN_PER_SPEED = 1.2;
const PROP_SPIN_IDLE = 8;
const PROP_NAME = 'propeller';
const TINT = new THREE.Color(0x1a6fb0);
const TINT_OPACITY = 0.38;

interface Particle {
  life: number;
  age: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  splash: boolean;
}

export class UnderwaterView {
  private built: Built | undefined;
  private route: RouteDef | undefined;
  /** Each kart's `inWater` last frame (a change is a splash; unset while respawning: none). */
  private readonly wasIn: (boolean | undefined)[] = [];
  private readonly propellers: (THREE.Mesh | undefined)[] = [];
  private lastTime: number | undefined;
  /** Small LCG so bubbles look the same on every run (screenshots). */
  private seed = 1;
  /** The camera is under water: the tint shows (test API). */
  cameraUnder = false;

  constructor(private readonly scene: THREE.Scene) {}

  /** Draws this frame. `simTime` is the sim's tick (plus alpha): particles move with the race. */
  sync(
    state: SimState,
    route: RouteDef | undefined,
    simTime: number,
    kartBody: (id: number) => THREE.Object3D | undefined,
    camera: THREE.Camera,
  ): void {
    if (route !== this.route) this.reset(route);
    if (!route || !hasWater(route)) {
      this.cameraUnder = false;
      return;
    }
    const built = (this.built ??= build(this.scene));
    const seconds = Math.min(MAX_STEP, Math.max(0, (simTime - (this.lastTime ?? simTime)) * DT));
    this.lastTime = simTime;

    for (const kart of state.karts) {
      const body = kartBody(kart.id);
      const inWater = kart.inWater === true;
      const was = this.wasIn[kart.id];
      if (was !== undefined && kart.inWater !== undefined && was !== inWater && body)
        this.splash(built, body.getWorldPosition(built.scratch));
      this.wasIn[kart.id] = kart.inWater;
      if (!body) continue;
      const prop = this.propeller(kart.id, body);
      prop.visible = inWater;
      if (!inWater) continue;
      prop.rotation.z += (PROP_SPIN_IDLE + Math.abs(kart.speed) * PROP_SPIN_PER_SPEED) * seconds;
      const rate =
        BUBBLE_RATE + (BUBBLE_RATE_AT_SPEED - BUBBLE_RATE) * Math.min(1, Math.abs(kart.speed) / 20);
      const due = rate * seconds;
      const count = Math.floor(due) + (this.random() < due % 1 ? 1 : 0);
      if (count > 0) prop.getWorldPosition(built.scratch);
      for (let i = 0; i < count; i += 1) this.bubble(built, built.scratch);
    }
    this.stepParticles(built, route, seconds);

    camera.updateMatrixWorld();
    this.cameraUnder = insideWater(route, camera.getWorldPosition(built.scratch));
    built.tint.visible = this.cameraUnder;
    built.time.value = simTime * DT;
  }

  /** Each kart's propeller is showing (test API). */
  propellersShown(): boolean[] {
    return this.propellers.map((p) => p?.visible === true);
  }

  private reset(route: RouteDef | undefined): void {
    this.route = route;
    this.wasIn.length = 0;
    for (const prop of this.propellers) prop?.removeFromParent();
    this.propellers.length = 0;
    this.lastTime = undefined;
    if (this.built) {
      for (const p of this.built.particles) p.life = 0;
      this.built.tint.visible = false;
    }
  }

  /** Kart `id`'s propeller, made (on its body, hidden) the first time; a new body gets a new one. */
  private propeller(id: number, body: THREE.Object3D): THREE.Mesh {
    let prop = this.propellers[id];
    if (!prop || prop.parent !== body) {
      prop?.removeFromParent();
      prop = new THREE.Mesh(propellerGeometry(), propellerMaterial());
      prop.name = PROP_NAME;
      prop.position.set(0, PROP_Y, PROP_Z);
      prop.visible = false;
      body.add(prop);
      this.propellers[id] = prop;
    }
    return prop;
  }

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  private free(built: Built): Particle | undefined {
    let oldest: Particle | undefined;
    for (const p of built.particles) {
      if (p.life <= 0) return p;
      if (!oldest || p.age / p.life > oldest.age / oldest.life) oldest = p;
    }
    return oldest;
  }

  private bubble(built: Built, at: THREE.Vector3): void {
    const p = this.free(built);
    if (!p) return;
    p.life = BUBBLE_LIFE * (0.7 + 0.6 * this.random());
    p.age = 0;
    p.splash = false;
    p.position.set(
      at.x + (this.random() - 0.5) * 0.4,
      at.y + (this.random() - 0.5) * 0.3,
      at.z + (this.random() - 0.5) * 0.4,
    );
    p.velocity.set((this.random() - 0.5) * 0.6, BUBBLE_RISE, (this.random() - 0.5) * 0.6);
  }

  private splash(built: Built, at: THREE.Vector3): void {
    for (let i = 0; i < SPLASH_DROPS; i += 1) {
      const p = this.free(built);
      if (!p) return;
      const angle = (i / SPLASH_DROPS) * Math.PI * 2 + this.random() * 0.3;
      const out = SPLASH_SPEED * (0.3 + 0.4 * this.random());
      p.life = SPLASH_LIFE * (0.7 + 0.5 * this.random());
      p.age = 0;
      p.splash = true;
      p.position.set(at.x, at.y + 0.3, at.z);
      p.velocity.set(
        Math.cos(angle) * out,
        SPLASH_SPEED * (0.7 + 0.5 * this.random()),
        Math.sin(angle) * out,
      );
    }
  }

  /** Moves the particles: bubbles rise (and pop at the surface), droplets fly and fall. */
  private stepParticles(built: Built, route: RouteDef, seconds: number): void {
    const { positions, colours } = built;
    built.particles.forEach((p, i) => {
      if (p.life > 0) {
        p.age += seconds;
        if (p.splash) p.velocity.y -= SPLASH_GRAVITY * seconds;
        p.position.addScaledVector(p.velocity, seconds);
        if (p.age >= p.life || (!p.splash && !insideWater(route, p.position))) p.life = 0;
      }
      if (p.life <= 0) {
        positions.setXYZ(i, 0, -1e5, 0);
        return;
      }
      positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
      const fade = 1 - p.age / p.life;
      const c = p.splash ? SPLASH_COLOUR : BUBBLE_COLOUR;
      colours.setXYZ(i, c.r * fade, c.g * fade, c.b * fade);
    });
    positions.needsUpdate = true;
    colours.needsUpdate = true;
  }
}

interface Built {
  particles: Particle[];
  positions: THREE.BufferAttribute;
  colours: THREE.BufferAttribute;
  tint: THREE.Mesh;
  time: THREE.IUniform<number>;
  scratch: THREE.Vector3;
}

function build(scene: THREE.Scene): Built {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(POOL * 3).fill(-1e5), 3);
  const colours = new THREE.BufferAttribute(new Float32Array(POOL * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  colours.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('color', colours);
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.18,
      map: dotTexture(),
      alphaTest: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.name = 'underwaterParticles';
  points.frustumCulled = false;
  scene.add(points);

  // The tint: a quad drawn straight in clip space over everything, only while the camera is under.
  const time = { value: 0 };
  const tintMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time,
      tint: { value: TINT },
      opacity: { value: TINT_OPACITY },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 tint;
      uniform float opacity;
      varying vec2 vUv;
      // Two layers of crossing ripples: bright, thin caustic lines drifting slowly.
      float caustic(vec2 p, float t) {
        float a = sin(p.x * 9.0 + sin(p.y * 7.0 + t * 1.3) * 1.6 + t);
        float b = sin(p.y * 11.0 + sin(p.x * 6.0 - t * 1.1) * 1.8 - t * 0.8);
        return pow(1.0 - abs(a * b), 6.0);
      }
      void main() {
        float c = caustic(vUv, time) * 0.6 + caustic(vUv * 1.7 + 0.3, time * 0.7) * 0.4;
        // Darker towards the bottom, like light from the surface.
        float depth = mix(0.75, 1.0, vUv.y);
        gl_FragColor = vec4(tint * depth + vec3(0.55, 0.85, 1.0) * c * 0.35, opacity + c * 0.08);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const tint = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tintMaterial);
  tint.name = 'underwaterTint';
  tint.frustumCulled = false;
  tint.renderOrder = 10_000;
  tint.visible = false;
  scene.add(tint);

  const particles = Array.from({ length: POOL }, () => ({
    life: 0,
    age: 0,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    splash: false,
  }));
  return { particles, positions, colours, tint, time, scratch: new THREE.Vector3() };
}

let sharedGeometry: THREE.BufferGeometry | undefined;
let sharedMaterial: THREE.Material | undefined;

/** Three blades round a hub, facing back along +Z (one geometry: one draw call per kart). */
function propellerGeometry(): THREE.BufferGeometry {
  if (sharedGeometry) return sharedGeometry;
  const parts: THREE.BufferGeometry[] = [];
  const hub = new THREE.CylinderGeometry(0.07, 0.07, 0.14, 8);
  hub.rotateX(Math.PI / 2);
  parts.push(hub);
  for (let i = 0; i < 3; i += 1) {
    const blade = new THREE.BoxGeometry(0.09, 0.32, 0.025);
    blade.translate(0, 0.18, 0);
    blade.rotateY(0.35);
    blade.rotateZ((i / 3) * Math.PI * 2);
    parts.push(blade.toNonIndexed());
  }
  sharedGeometry = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  return sharedGeometry;
}

function propellerMaterial(): THREE.Material {
  return (sharedMaterial ??= new THREE.MeshLambertMaterial({ color: 0xf2c230 }));
}

/** A soft round dot (bubbles and droplets aren't square), made once on a small canvas. */
function dotTexture(): THREE.Texture | null {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
