import * as THREE from 'three';
import type {
  HazardDef,
  HazardPose,
  MoverHazard,
  PeriodicHazard,
  RotatorHazard,
  ZoneEffectHazard,
} from '../../sim/hazards/types';

/**
 * How one hazard kind is drawn (MK-49): a model built once per hazard, posed every frame from the
 * sim's pure pose function. Written as methods so a view for one def type fits the table of all.
 */
export interface HazardView<D extends HazardDef = HazardDef> {
  id: D['kind'];
  /** The model, at the origin; `night` = the track has a night theme (use glowing materials). */
  create(def: D, night: boolean): THREE.Object3D;
  /** Poses `object` for this frame. Visibility hazards return a fog distance (m) to apply. */
  update(
    object: THREE.Object3D,
    def: D,
    pose: HazardPose,
    camera: THREE.Vector3,
  ): number | undefined;
}

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
const glow = (color: number, night: boolean) =>
  night ? new THREE.MeshBasicMaterial({ color }) : lambert(color);

/** A boxy traffic kart with glowing lamps at night. */
export const moverView: HazardView<MoverHazard> = {
  id: 'mover',
  create(def, night) {
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
  update(object, _def, pose) {
    object.position.set(pose.x, pose.y, pose.z);
    object.rotation.y = pose.heading;
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

/** A swirling translucent dome; while on, it thickens the fog for a camera inside it. */
export const zoneEffectView: HazardView<ZoneEffectHazard> = {
  id: 'zoneEffect',
  create(def) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xe0b070,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    return dome;
  },
  update(object, def, pose, camera) {
    object.position.set(pose.x, pose.y, pose.z);
    object.visible = pose.amount > 0;
    if (pose.amount === 0) return undefined;
    const inside = Math.hypot(camera.x - def.centre.x, camera.z - def.centre.z) <= def.radius;
    return inside ? def.visibility : undefined;
  },
};
