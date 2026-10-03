import * as THREE from 'three';
import type { RouteZone } from '../sim/route';

/** Bumper colours: a cyan ball with a white band, like the anti-gravity road. */
const BALL = 0x2ad4ff;
const BAND = 0xffffff;

/**
 * A mesh track's boost bumpers (MK-108: route `boostBumper` zones, round colliders) drawn as balls
 * of their radius with a band round them, for courses drawn from their collision mesh (an MK8
 * course's own model has its bumpers). Two draws per bumper; an empty group without bumpers.
 */
export function createBumperViews(zones: readonly RouteZone[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'boost-bumpers';
  const ball = new THREE.MeshLambertMaterial({
    color: BALL,
    emissive: BALL,
    emissiveIntensity: 0.3,
  });
  const band = new THREE.MeshBasicMaterial({ color: BAND });
  for (const zone of zones) {
    if (zone.kind !== 'boostBumper') continue;
    const bumper = new THREE.Group();
    bumper.position.set(zone.position.x, zone.position.y, zone.position.z);
    bumper.add(new THREE.Mesh(new THREE.SphereGeometry(zone.radius, 20, 12), ball));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(zone.radius * 1.02, zone.radius * 0.08, 6, 24),
      band,
    );
    ring.rotation.x = Math.PI / 2;
    bumper.add(ring);
    group.add(bumper);
  }
  return group;
}
