import * as THREE from 'three';
import type { DrawnFrame } from './karts';

const DISTANCE = 6.5;
const HEIGHT = 2.6;
const LOOK_AHEAD = 4;
const LOOK_HEIGHT = 1;
/** Gliding (MK-106): with the glider fully open the camera sits this much further back and up, m. */
const GLIDE_DISTANCE = 3;
const GLIDE_HEIGHT = 1.2;
/** Higher = the camera catches up faster (1/s). */
const FOLLOW_RATE = 6;
const HEADING_RATE = 5;
const BASE_FOV = 62;
const MAX_EXTRA_FOV = 10;
const MIN_HEIGHT_ABOVE_GROUND = 0.8;

/** How fast the camera's up follows the kart's on walls and ceilings (MK-99), 1/s. */
const UP_RATE = 4;
/** The camera's up never turns more than this in one frame, radians (no sudden flips). */
const MAX_UP_STEP = (25 * Math.PI) / 180;

/** The camera stays this far in front of anything between it and the kart, m. */
const CLIP_MARGIN = 0.4;

/**
 * Where a ray from `from` along the unit `direction` first hits the course within `maxDistance`,
 * as a distance; null if nothing is in the way (MK-99: walls and ceilings around a mesh track).
 */
export type CameraClip = (
  from: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
) => number | null;

/** Extra FOV right after a boost starts (MK-27), degrees. */
const FOV_KICK = 8;
const FOV_KICK_DECAY = 3;
const SHAKE_DECAY = 7;
const MAX_SHAKE = 0.6;

/**
 * Third-person chase camera: sits behind the kart, lags smoothly, widens FOV with speed. Juice
 * (MK-27): shake on hits/bumps/landings and an FOV kick on boosts — both off with reduced motion.
 */
export class ChaseCamera {
  private heading: number | undefined;
  /** Current shake amplitude, m (decays). */
  shake = 0;
  /** Current extra FOV from a boost, degrees (decays). */
  fovKick = 0;
  reducedMotion = false;
  /** How far the camera pulls back for a glide: 0 = normal … 1 = glider open (MK-106). */
  pullBack = 0;
  private shakeTime = 0;
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  /** Surface-following (mesh tracks, MK-99): the camera's smoothed up and facing. */
  private surfaceUp: THREE.Vector3 | undefined;
  private readonly surfaceForward = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    camera.fov = BASE_FOV;
  }

  /**
   * `speedRatio` = |speed| / top speed, 0..1+. `dt` = real frame time, seconds.
   * `snap` jumps straight to the resting position (after tests/QA fast-forward the sim).
   */
  update(kart: THREE.Object3D, speedRatio: number, dt: number, groundY = 0, snap = false): void {
    const kartHeading = kart.rotation.y;
    this.surfaceUp = undefined;
    if (this.heading === undefined || snap) {
      this.heading = kartHeading;
      this.place(kart, kartHeading, 1);
      return;
    }
    let delta = (kartHeading - this.heading) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.heading += delta * (1 - Math.exp(-HEADING_RATE * dt));

    this.place(kart, this.heading, 1 - Math.exp(-FOLLOW_RATE * dt));
    this.camera.position.y = Math.max(this.camera.position.y, groundY + MIN_HEIGHT_ABOVE_GROUND);
    // Shake: a quick wobble on top of the follow position, fading out. And the FOV.
    this.juice(dt, speedRatio);
  }

  /**
   * The chase camera for a kart on a mesh track (MK-99): behind and above the kart in its own
   * frame, so it follows it up walls and onto ceilings. Its up eases towards the kart's (never more
   * than `MAX_UP_STEP` a frame) and its facing towards the kart's, both by real time.
   */
  followSurface(
    kart: THREE.Object3D,
    frame: DrawnFrame,
    speedRatio: number,
    dt: number,
    snap = false,
    clip?: CameraClip,
  ): void {
    if (!this.surfaceUp || snap) {
      this.surfaceUp = frame.up.clone();
      this.surfaceForward.copy(frame.forward);
      this.placeOnSurface(kart, 1, clip);
      return;
    }
    // Up: towards the kart's, by a capped angle.
    const angle = this.surfaceUp.angleTo(frame.up);
    if (angle > 1e-6) {
      const step = Math.min(angle * (1 - Math.exp(-UP_RATE * dt)), MAX_UP_STEP);
      const axis = this.scratch.crossVectors(this.surfaceUp, frame.up);
      if (axis.lengthSq() < 1e-12) axis.copy(frame.forward);
      this.turn.setFromAxisAngle(axis.normalize(), step);
      this.surfaceUp.applyQuaternion(this.turn).normalize();
    }
    // Facing: flat to the camera's up, then turned about it towards the kart's (by angle, so it
    // swings round even from straight behind).
    this.flatten();
    const want = this.scratch
      .copy(frame.forward)
      .addScaledVector(this.surfaceUp, -frame.forward.dot(this.surfaceUp));
    if (want.lengthSq() > 1e-8) {
      want.normalize();
      const turn = Math.acos(Math.min(1, Math.max(-1, this.surfaceForward.dot(want))));
      const side =
        Math.sign(this.target.crossVectors(this.surfaceForward, want).dot(this.surfaceUp)) || 1;
      this.turn.setFromAxisAngle(this.surfaceUp, side * turn * (1 - Math.exp(-HEADING_RATE * dt)));
      this.surfaceForward.applyQuaternion(this.turn);
      this.flatten();
    }
    this.placeOnSurface(kart, 1 - Math.exp(-FOLLOW_RATE * dt), clip);
    this.juice(dt, speedRatio);
  }

  /** The camera's up (unit, world) on a mesh track; +Y elsewhere. */
  upVector(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
  }

  /** Makes `surfaceForward` perpendicular to `surfaceUp` (keeps the last facing if degenerate). */
  private flatten(): void {
    const up = this.surfaceUp;
    if (!up) return;
    const f = this.surfaceForward;
    f.addScaledVector(up, -f.dot(up));
    if (f.lengthSq() < 1e-8) f.set(1, 0, 0).addScaledVector(up, -up.x);
    f.normalize();
  }

  private placeOnSurface(kart: THREE.Object3D, blend: number, clip?: CameraClip): void {
    const up = this.surfaceUp;
    if (!up) return;
    const f = this.surfaceForward;
    this.target.copy(kart.position);
    this.desired
      .copy(this.target)
      .addScaledVector(f, -this.distance())
      .addScaledVector(up, this.height());
    this.camera.position.lerp(this.desired, blend);
    if (clip) {
      // Never behind a wall, the floor or the ceiling: pull in to just in front of it.
      const from = this.scratch.copy(this.target).addScaledVector(up, LOOK_HEIGHT);
      const ray = this.lookAt.subVectors(this.camera.position, from);
      const distance = ray.length();
      if (distance > 1e-6) {
        ray.divideScalar(distance);
        const hit = clip(from, ray, distance + CLIP_MARGIN);
        if (hit !== null)
          this.camera.position.copy(from).addScaledVector(ray, Math.max(0, hit - CLIP_MARGIN));
      }
    }
    this.lookAt.copy(this.target).addScaledVector(f, LOOK_AHEAD).addScaledVector(up, LOOK_HEIGHT);
    this.camera.up.copy(up);
    this.camera.lookAt(this.lookAt);
  }

  /** Shake and the speed/boost FOV (both camera modes). */
  private juice(dt: number, speedRatio: number): void {
    // Paused (dt 0): no shake step; adding the same offset again every still frame would drift the
    // camera away from its kart (MK-145: bumped split-screen karts on a paused frame).
    if (this.shake > 0.001 && dt > 0) {
      this.shakeTime += dt;
      const s = this.shake;
      this.camera.position.x += Math.sin(this.shakeTime * 71) * s;
      this.camera.position.y += Math.sin(this.shakeTime * 53 + 1) * s * 0.6;
      this.camera.position.z += Math.cos(this.shakeTime * 67) * s;
      this.shake *= Math.exp(-SHAKE_DECAY * dt);
    } else if (this.shake <= 0.001) this.shake = 0;
    this.fovKick *= Math.exp(-FOV_KICK_DECAY * dt);
    const fov = BASE_FOV + MAX_EXTRA_FOV * Math.min(1, Math.max(0, speedRatio)) + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  /** How far behind the kart the camera sits, m (further while gliding). */
  distance(): number {
    return DISTANCE + GLIDE_DISTANCE * this.pullBack;
  }

  private height(): number {
    return HEIGHT + GLIDE_HEIGHT * this.pullBack;
  }

  /** Adds camera shake (`amount` 0..1 = gentle..hard). Ignored with reduced motion. */
  addShake(amount: number): void {
    if (this.reducedMotion) return;
    this.shake = Math.min(MAX_SHAKE, this.shake + amount * MAX_SHAKE);
  }

  /** Widens the FOV briefly when a boost starts. Ignored with reduced motion. */
  kickFov(): void {
    if (this.reducedMotion) return;
    this.fovKick = FOV_KICK;
  }

  private place(kart: THREE.Object3D, heading: number, blend: number): void {
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    this.target.copy(kart.position);
    const distance = this.distance();
    this.desired.set(
      this.target.x - fx * distance,
      this.target.y + this.height(),
      this.target.z - fz * distance,
    );
    this.camera.position.lerp(this.desired, blend);
    this.lookAt.set(
      this.target.x + fx * LOOK_AHEAD,
      this.target.y + LOOK_HEIGHT,
      this.target.z + fz * LOOK_AHEAD,
    );
    this.camera.lookAt(this.lookAt);
  }
}

const LINEUP_RADIUS = 11;
const LINEUP_HEIGHT = 3.5;
/** rad/s */
const LINEUP_ORBIT_SPEED = 0.25;
/** Start in front of the karts (they face −Z), slightly to the side. */
const LINEUP_START_ANGLE = -0.35;

/** Slow orbit around the kart lineup (kart select preview, `kart-lineup` scenario). Frozen when paused. */
export class LineupCamera {
  private angle = LINEUP_START_ANGLE;
  private readonly centre = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  /** Radius when focused on one kart (kart select) instead of the whole lineup. */
  private radius = LINEUP_RADIUS;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.update(0);
  }

  /** Orbits around `point` (default: the origin), closer in when showing a single kart. */
  focus(point: THREE.Vector3, single = false, snap = false): void {
    this.target.copy(point);
    this.radius = single ? 6 : LINEUP_RADIUS;
    if (snap) this.centre.copy(point);
  }

  update(dt: number): void {
    this.angle += LINEUP_ORBIT_SPEED * dt;
    this.centre.lerp(this.target, 1 - Math.exp(-6 * dt));
    this.camera.position.set(
      this.centre.x + Math.sin(this.angle) * this.radius,
      this.centre.y + LINEUP_HEIGHT * (this.radius / LINEUP_RADIUS),
      this.centre.z - Math.cos(this.angle) * this.radius,
    );
    this.camera.lookAt(this.centre.x, this.centre.y + 0.6, this.centre.z);
  }
}
