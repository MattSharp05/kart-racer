import * as THREE from 'three';

const DISTANCE = 6.5;
const HEIGHT = 2.6;
const LOOK_AHEAD = 4;
const LOOK_HEIGHT = 1;
/** Higher = the camera catches up faster (1/s). */
const FOLLOW_RATE = 6;
const HEADING_RATE = 5;
const BASE_FOV = 62;
const MAX_EXTRA_FOV = 10;
const MIN_HEIGHT_ABOVE_GROUND = 0.8;

/** Third-person chase camera: sits behind the kart, lags smoothly, widens FOV with speed. */
export class ChaseCamera {
  private heading: number | undefined;
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    camera.fov = BASE_FOV;
  }

  /**
   * `speedRatio` = |speed| / top speed, 0..1+. `dt` = real frame time, seconds.
   * `snap` jumps straight to the resting position (after tests/QA fast-forward the sim).
   */
  update(kart: THREE.Object3D, speedRatio: number, dt: number, groundY = 0, snap = false): void {
    const kartHeading = kart.rotation.y;
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

    const fov = BASE_FOV + MAX_EXTRA_FOV * Math.min(1, Math.max(0, speedRatio));
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  private place(kart: THREE.Object3D, heading: number, blend: number): void {
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    this.target.copy(kart.position);
    this.desired.set(
      this.target.x - fx * DISTANCE,
      this.target.y + HEIGHT,
      this.target.z - fz * DISTANCE,
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
