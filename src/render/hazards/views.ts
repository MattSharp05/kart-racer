import * as THREE from 'three';
import type {
  HazardDef,
  HazardPose,
  MoverHazard,
  PeriodicHazard,
  RotatorHazard,
  ZoneEffectHazard,
} from '../../sim/hazards/types';
import { DT } from '../../sim/tuning';

/**
 * How one hazard kind is drawn (MK-49): a model built once per hazard, posed every frame from the
 * sim's pure pose function. Written as methods so a view for one def type fits the table of all.
 */
export interface HazardView<D extends HazardDef = HazardDef> {
  id: D['kind'];
  /** The model, at the origin; `night` = the track has a night theme (use glowing materials). */
  create(def: D, night: boolean): THREE.Object3D;
  /**
   * Poses `object` for this frame, at `ticks` (fractional). Visibility hazards return a fog
   * distance (m) to apply.
   */
  update(
    object: THREE.Object3D,
    def: D,
    pose: HazardPose,
    camera: THREE.Vector3,
    ticks: number,
  ): number | undefined;
}

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
const glow = (color: number, night: boolean) =>
  night ? new THREE.MeshBasicMaterial({ color }) : lambert(color);

/** A rolling ball's shadow: this dark, and this much wider than the ball. */
const BALL_SHADOW = { opacity: 0.35, scale: 1.3 };

/** Speed along its path of a mover, m/s (constant: open paths only move while active). */
function moverSpeed(def: MoverHazard): number {
  const { path } = def;
  const segments = def.activeFraction === undefined ? path.length : path.length - 1;
  let length = 0;
  for (let i = 0; i < segments; i += 1) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    if (a && b) length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return length / (def.period * (def.activeFraction ?? 1));
}

/** A ball of `colour` resting on the origin, with a round shadow under it (MK-59: snowballs). */
function rollingBall(def: MoverHazard, radius: number, colour: number): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.speed = moverSpeed(def);
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 1),
    new THREE.MeshLambertMaterial({ color: colour, flatShading: true }),
  );
  ball.name = 'ball';
  ball.position.y = radius;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * BALL_SHADOW.scale, 16),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: BALL_SHADOW.opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.08;
  group.add(ball, shadow);
  return group;
}

/** A boxy traffic kart with glowing lamps at night, or a rolling ball (`rolling`). */
export const moverView: HazardView<MoverHazard> = {
  id: 'mover',
  create(def, night) {
    if (def.rolling !== undefined) return rollingBall(def, def.radius, def.rolling);
    const group = new THREE.Group();
    const size = def.radius * 2;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(size * 0.8, size * 0.45, size),
      lambert(0xd62828),
    );
    body.position.y = size * 0.3;
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(size * 0.6, size * 0.35, size * 0.45),
      lambert(0x1d3557),
    );
    cab.position.set(0, size * 0.65, size * 0.1);
    const lamps = new THREE.Mesh(
      new THREE.BoxGeometry(size * 0.7, size * 0.12, 0.1),
      glow(0xfff1b0, night),
    );
    lamps.position.set(0, size * 0.35, -size / 2);
    group.add(body, cab, lamps);
    return group;
  },
  update(object, def, pose, _camera, ticks) {
    object.position.set(pose.x, pose.y, pose.z);
    object.rotation.y = pose.heading;
    object.visible = pose.amount > 0;
    const ball = def.rolling !== undefined ? object.getObjectByName('ball') : undefined;
    if (ball) {
      // Rolls forwards (heading 0 faces −Z, so forwards is a turn about −X): 1 rad per radius.
      ball.rotation.x = -((ticks * DT * (object.userData.speed as number)) / def.radius);
    }
    return undefined;
  },
};

/** A striped beam on a post. */
export const rotatorView: HazardView<RotatorHazard> = {
  id: 'rotator',
  create(def, night) {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.6, 8), lambert(0x3a3d42));
    post.position.y = 0.8;
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(def.armWidth, 0.8, def.armLength * 2),
      glow(0xffb703, night),
    );
    beam.position.y = 0.9;
    group.add(post, beam);
    return group;
  },
  update(object, _def, pose) {
    object.position.set(pose.x, pose.y, pose.z);
    object.rotation.y = pose.heading;
    return undefined;
  },
};

/** Crusher height above the road when open, m. */
const CRUSHER_LIFT = 3.5;
const CRUSHER_THICKNESS = 1.4;

/** A heavy block between two pillars that drops to the road. */
export const periodicView: HazardView<PeriodicHazard> = {
  id: 'periodic',
  create(def, night) {
    const group = new THREE.Group();
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(def.halfWidth * 2, CRUSHER_THICKNESS, def.halfLength * 2),
      lambert(0x6c757d),
    );
    block.name = 'block';
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(def.halfWidth * 2 + 0.05, 0.3, def.halfLength * 2 + 0.05),
      glow(0xffd60a, night),
    );
    stripe.position.y = -CRUSHER_THICKNESS / 2 + 0.15;
    block.add(stripe);
    const pillarHeight = CRUSHER_LIFT + CRUSHER_THICKNESS + 0.5;
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, pillarHeight, 0.6),
        lambert(0x3a3d42),
      );
      pillar.position.set(side * (def.halfWidth + 0.5), pillarHeight / 2, 0);
      group.add(pillar);
    }
    group.add(block);
    return group;
  },
  update(object, def, pose) {
    object.position.set(pose.x, pose.y, pose.z);
    object.rotation.y = def.heading;
    const block = object.getObjectByName('block');
    if (block) block.position.y = CRUSHER_THICKNESS / 2 + CRUSHER_LIFT * (1 - pose.amount);
    return undefined;
  },
};

/** Dust: this many specks in a box this big (m) that travels with the camera, blown along +X. */
const DUST_COUNT = 1500;
const DUST_BOX = { half: 30, height: 10 };
const DUST_WIND = { x: 14, z: 4 };

/** Wraps `value` into [−half, half). */
const wrap = (value: number, half: number) =>
  value - Math.floor((value + half) / (2 * half)) * 2 * half;

/**
 * A swirling translucent dome; while on, it thickens the fog for a camera inside it, and with a
 * `dust` colour, specks of dust blow past the camera (one draw, moved from the tick: no state).
 */
export const zoneEffectView: HazardView<ZoneEffectHazard> = {
  id: 'zoneEffect',
  create(def) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: def.dust ?? 0xe0b070,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    if (def.dust === undefined) return dome;
    const group = new THREE.Group();
    dome.name = 'dome';
    // Fixed scatter (a hash, not Math.random) so screenshots are stable.
    const base = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const h = (n: number) => {
        const v = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
        return v - Math.floor(v);
      };
      base[i * 3] = (h(1) * 2 - 1) * DUST_BOX.half;
      base[i * 3 + 1] = h(2) * DUST_BOX.height;
      base[i * 3 + 2] = (h(3) * 2 - 1) * DUST_BOX.half;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    geometry.userData.base = base;
    const dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: def.dust,
        size: 0.12,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    dust.name = 'dust';
    dust.frustumCulled = false;
    group.add(dome, dust);
    return group;
  },
  update(object, def, pose, camera, ticks) {
    object.position.set(pose.x, pose.y, pose.z);
    object.visible = pose.amount > 0;
    if (pose.amount === 0) return undefined;
    const inside = Math.hypot(camera.x - def.centre.x, camera.z - def.centre.z) <= def.radius;
    const dust = object.getObjectByName('dust');
    if (dust instanceof THREE.Points) {
      dust.visible = inside;
      if (inside) blowDust(dust, camera, pose, ticks * DT);
    }
    return inside ? def.visibility : undefined;
  },
};

/** Moves the dust specks: each blows along the wind, wrapped into the box round the camera. */
function blowDust(dust: THREE.Points, camera: THREE.Vector3, pose: HazardPose, seconds: number) {
  const base = dust.geometry.userData.base as Float32Array;
  const position = dust.geometry.getAttribute('position') as THREE.BufferAttribute;
  const array = position.array as Float32Array;
  // Positions are local to the zone's centre (the group sits there).
  const cx = camera.x - pose.x;
  const cz = camera.z - pose.z;
  for (let i = 0; i < base.length; i += 3) {
    const x = (base[i] ?? 0) + seconds * DUST_WIND.x;
    const z = (base[i + 2] ?? 0) + seconds * DUST_WIND.z;
    array[i] = cx + wrap(x - cx, DUST_BOX.half);
    array[i + 1] = (base[i + 1] ?? 0) + Math.sin(seconds * 2 + i) * 0.4 + camera.y - pose.y - 3;
    array[i + 2] = cz + wrap(z - cz, DUST_BOX.half);
  }
  position.needsUpdate = true;
}
