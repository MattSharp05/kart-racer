import * as THREE from 'three';
import { getTrack, groundAt } from '../sim/track';
import { tuning } from '../sim/tuning';
import type { KartState, SimEvent, SimState } from '../sim/types';
import type { ChaseCamera } from './camera';
import type { KartRenderer } from './karts';

const MAX_PARTICLES = 320;
const GRAVITY = 9;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  born: number;
  /** Lifetime, ticks. */
  life: number;
  size: number;
  gravity: number;
  colour: THREE.Color;
}

interface KartMemory {
  spin: number;
  boost: number;
  airTime: number;
  finished: boolean;
  squash: number;
}

/** Deterministic 0..1 noise from integers (so paused test frames always look the same). */
function hash(a: number, b: number, c: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

const TRAIL_COLOURS = ['#ffd166', '#ff8c42', '#ff5d5d'].map((c) => new THREE.Color(c));
const WHITE = new THREE.Color('#ffffff');
const STAR_COLOURS = ['#fff3b0', '#ffd166', '#ffffff'].map((c) => new THREE.Color(c));
const CONFETTI = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#c77dff'].map(
  (c) => new THREE.Color(c),
);
const DUST = new THREE.Color('#b08d57');

/**
 * Juice (MK-27): boost trails, dust off-road, star bursts on hits, confetti at the finish,
 * landing squash, camera shake / FOV kick, and a speed-lines overlay. Everything is driven by sim
 * ticks (not wall-clock time), so paused frames are stable. Render-only: never touches the sim.
 */
export class Effects {
  private readonly particles: Particle[] = [];
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly memory = new Map<number, KartMemory>();
  private readonly speedLines = document.createElement('div');
  private lastTick = -1;
  private speedLinesOpacity = '';

  constructor(
    scene: THREE.Scene,
    private readonly karts: KartRenderer,
    private readonly camera: ChaseCamera,
  ) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }),
      MAX_PARTICLES,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.speedLines.className = 'speed-lines';
    document.body.append(this.speedLines);
  }

  /** A new race or screen: forget everything. */
  reset(): void {
    this.particles.length = 0;
    this.memory.clear();
    this.lastTick = -1;
  }

  /** Sim events that aren't visible in the state: bumps shake the camera. */
  onEvents(events: SimEvent[], followId: number): void {
    for (const e of events) {
      if (e.type === 'bump' && (e.a === followId || e.b === followId)) {
        this.camera.addShake(Math.min(1, e.strength / 12) * 0.5);
      }
    }
  }

  update(state: SimState, followId: number, speedRatio: number, view: string): void {
    const ticks = this.lastTick < 0 ? 1 : Math.min(10, state.tick - this.lastTick);
    if (ticks > 0 || this.lastTick < 0) {
      for (const kart of state.karts) this.watchKart(kart, state, followId, Math.max(1, ticks));
      this.lastTick = state.tick;
    }
    this.draw(state.tick);

    const followed = state.karts[followId];
    const boosting = followed ? followed.boostTimer > 0 || followed.starTimer > 0 : false;
    const strength =
      view !== 'chase' ? 0 : Math.max(boosting ? 0.7 : 0, Math.min(1, (speedRatio - 0.9) / 0.15));
    const opacity = strength > 0 ? strength.toFixed(2) : '0';
    if (opacity !== this.speedLinesOpacity) {
      this.speedLinesOpacity = opacity;
      this.speedLines.style.opacity = opacity;
    }
  }

  private watchKart(kart: KartState, state: SimState, followId: number, ticks: number): void {
    const seen = this.memory.get(kart.id);
    const now: KartMemory = {
      spin: kart.spinTimer,
      boost: kart.boostTimer,
      airTime: kart.airTime,
      finished: kart.race.finishTick !== undefined,
      squash: seen?.squash ?? 0,
    };
    const isFollowed = kart.id === followId;
    const tick = state.tick;
    // Hit: a spin-out just started.
    if (kart.spinTimer > (seen?.spin ?? 0) + 1e-6 && kart.spinTimer > tuning.spinSeconds * 0.8) {
      this.burst(kart, tick, 14, STAR_COLOURS, 7, 0.15, 36);
      if (isFollowed) this.camera.addShake(0.8);
    }
    // Boost start (mini-turbo, mushroom, pad, rocket start).
    if (seen && kart.boostTimer > seen.boost + 0.05 && isFollowed) this.camera.kickFov();
    // Landing after real air time: squash + a little shake.
    if (seen && seen.airTime > 0.25 && kart.grounded && kart.airTime === 0) {
      now.squash = Math.min(0.35, seen.airTime * 0.3);
      if (isFollowed) this.camera.addShake(Math.min(0.6, seen.airTime * 0.4));
    }
    // Finish: confetti for the followed kart.
    if (isFollowed && now.finished && seen && !seen.finished) {
      this.burst(kart, tick, 60, CONFETTI, 9, 0.18, 110, 5);
    }
    now.squash *= Math.pow(0.85, ticks);
    this.memory.set(kart.id, now);
    this.squash(kart.id, now.squash, kart, tick);

    // Continuous: boost trail and off-road dust (every other tick per kart keeps it light).
    if ((tick + kart.id) % 2 !== 0) return;
    const back = { x: Math.sin(kart.heading), z: Math.cos(kart.heading) };
    if (kart.boostTimer > 0 || kart.starTimer > 0) {
      const colour = TRAIL_COLOURS[(tick + kart.id) % TRAIL_COLOURS.length] ?? WHITE;
      this.spawn({
        x: kart.position.x + back.x * 1.3,
        y: kart.position.y + 0.45,
        z: kart.position.z + back.z * 1.3,
        vx: back.x * 2 + (hash(tick, kart.id, 1) - 0.5),
        vy: 0.6,
        vz: back.z * 2 + (hash(tick, kart.id, 2) - 0.5),
        born: tick,
        life: 22,
        size: 0.22,
        gravity: 0,
        colour,
      });
    }
    if (kart.grounded && Math.abs(kart.speed) > 6) {
      const surface = groundAt(getTrack(state.trackId), kart.position).surface;
      if (surface === 'offroad' || surface === 'rough') {
        this.spawn({
          x: kart.position.x + back.x * 1.1,
          y: kart.position.y + 0.2,
          z: kart.position.z + back.z * 1.1,
          vx: (hash(tick, kart.id, 3) - 0.5) * 2,
          vy: 1.5 + hash(tick, kart.id, 4),
          vz: (hash(tick, kart.id, 5) - 0.5) * 2,
          born: tick,
          life: 30,
          size: 0.28,
          gravity: 0.4,
          colour: DUST,
        });
      }
    }
  }

  private squash(id: number, amount: number, kart: KartState, tick: number): void {
    const body = this.karts.body(id);
    if (!body) return;
    // Driver bob with speed, plus landing squash & stretch.
    const bob = kart.grounded
      ? Math.sin(tick * 0.5 + id) * Math.min(1, Math.abs(kart.speed) / 20) * 0.03
      : 0;
    body.position.y = bob;
    body.scale.set(1 + amount * 0.5, 1 - amount, 1 + amount * 0.5);
  }

  private burst(
    kart: KartState,
    tick: number,
    count: number,
    colours: THREE.Color[],
    speed: number,
    size: number,
    life: number,
    up = 3,
  ): void {
    for (let i = 0; i < count; i += 1) {
      const a = hash(tick, kart.id, i) * Math.PI * 2;
      const r = 0.4 + hash(tick, i, kart.id) * 0.6;
      this.spawn({
        x: kart.position.x,
        y: kart.position.y + 1,
        z: kart.position.z,
        vx: Math.cos(a) * speed * r,
        vy: up + hash(i, tick, kart.id) * speed * 0.6,
        vz: Math.sin(a) * speed * r,
        born: tick,
        life,
        size,
        gravity: 1,
        colour: colours[i % colours.length] ?? WHITE,
      });
    }
  }

  private spawn(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  private draw(tick: number): void {
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      if (!p) continue;
      const age = tick - p.born;
      if (age < 0 || age > p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = age / 60;
      const fade = 1 - age / p.life;
      this.dummy.position.set(
        p.x + p.vx * t,
        p.y + p.vy * t - 0.5 * GRAVITY * p.gravity * t * t,
        p.z + p.vz * t,
      );
      this.dummy.rotation.set(age * 0.2, age * 0.3, 0);
      this.dummy.scale.setScalar(p.size * (0.4 + fade * 0.6));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, p.colour);
      n += 1;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
