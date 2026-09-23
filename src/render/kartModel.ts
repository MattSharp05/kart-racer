import * as THREE from 'three';

export interface KartModel {
  root: THREE.Group;
  /** Rotated around X as the kart rolls. Front wheels also turn with steering. */
  wheels: THREE.Object3D[];
  frontWheels: THREE.Object3D[];
}

const WHEEL_RADIUS = 0.32;

/** Placeholder primitive kart: body, four wheels, a driver. Replaced by the model factory in MK-7. */
export function createPlaceholderKart(colour = 0xe63946): KartModel {
  const root = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.45, 2.1),
    new THREE.MeshLambertMaterial({ color: colour }),
  );
  body.position.y = 0.45;
  root.add(body);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.3, 0.5),
    new THREE.MeshLambertMaterial({ color: colour }),
  );
  nose.position.set(0, 0.4, -1.2);
  root.add(nose);

  const driver = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xffd6a5 }),
  );
  driver.position.set(0, 1.05, 0.25);
  root.add(driver);

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
    root.add(pivot);
    wheels.push(wheel);
    if (front) frontWheels.push(pivot);
  }

  return { root, wheels, frontWheels };
}

export { WHEEL_RADIUS };
