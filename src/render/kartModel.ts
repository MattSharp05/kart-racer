import * as THREE from 'three';

export interface KartModel {
  root: THREE.Group;
  /** Visual-only child of root: leans and yaws into drifts without affecting physics. */
  body: THREE.Group;
  /** Spark clusters behind the two rear wheels (drift charge colour). */
  sparks: THREE.Group[];
  /** Exhaust flame shown while boosting. */
  flame: THREE.Mesh;
  /** Rotated around X as the kart rolls. Front wheels also turn with steering. */
  wheels: THREE.Object3D[];
  frontWheels: THREE.Object3D[];
}

const WHEEL_RADIUS = 0.32;
export const SPARKS_PER_WHEEL = 6;

/** Placeholder primitive kart: body, four wheels, a driver. Replaced by the model factory in MK-7. */
export function createPlaceholderKart(colour = 0xe63946): KartModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.45, 2.1),
    new THREE.MeshLambertMaterial({ color: colour }),
  );
  chassis.position.y = 0.45;
  body.add(chassis);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.3, 0.5),
    new THREE.MeshLambertMaterial({ color: colour }),
  );
  nose.position.set(0, 0.4, -1.2);
  body.add(nose);

  const driver = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xffd6a5 }),
  );
  driver.position.set(0, 1.05, 0.25);
  body.add(driver);

  const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 16);
  wheelGeometry.rotateZ(Math.PI / 2);
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const wheels: THREE.Object3D[] = [];
  const frontWheels: THREE.Object3D[] = [];
  for (const [x, z, front] of [
    [-0.72, -0.75, true],
    [0.72, -0.75, true],
    [-0.72, 0.75, false],
    [0.72, 0.75, false],
  ] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_RADIUS, z);
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    pivot.add(wheel);
    body.add(pivot);
    wheels.push(wheel);
    if (front) frontWheels.push(pivot);
  }

  const sparks = [-0.72, 0.72].map((x) => {
    const cluster = new THREE.Group();
    cluster.position.set(x, 0.12, 1.15);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < SPARKS_PER_WHEEL; i += 1) {
      const spark = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), material);
      cluster.add(spark);
    }
    cluster.visible = false;
    body.add(cluster);
    return cluster;
  });

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 1.2, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.85 }),
  );
  flame.rotation.x = Math.PI / 2;
  flame.position.set(0, 0.45, 1.65);
  flame.visible = false;
  body.add(flame);

  return { root, body, wheels, frontWheels, sparks, flame };
}

export { WHEEL_RADIUS };
