import * as THREE from 'three';
import type { KartId } from '../sim/data/karts';

/**
 * A kart's 3D model. Everything the renderer animates hangs off these handles, so any model source
 * (primitives now, glTF later) just has to provide them.
 */
export interface KartModel {
  root: THREE.Group;
  /** Visual-only child of root: leans and yaws into drifts without affecting physics. */
  body: THREE.Group;
  /** Rotated around X as the kart rolls. */
  wheels: THREE.Object3D[];
  /** Pivots that turn with steering. */
  frontWheels: THREE.Object3D[];
  /** Spark clusters behind the two rear wheels (drift charge colour). */
  sparks: THREE.Group[];
  /** Exhaust flame shown while boosting. */
  flame: THREE.Mesh;
  /** Radius of the rear wheels, for roll speed. */
  wheelRadius: number;
  /** Pickup drone shown above the kart while it's being respawned (MK-13). */
  drone: THREE.Group;
}

export interface KartColours {
  body: number;
  accent: number;
  driver: number;
}

/**
 * Builds kart models. To use custom art later, add a `GltfKartFactory` implementing this interface:
 * load the glTF per kart id, find the wheel/body nodes by name, and return the same handles.
 * Models must fit the physics footprint in `sim/tuning.ts` (kartFront 1.45 m, kartRear 1.07 m,
 * kartHalfWidth 0.86 m), facing −Z.
 */
export interface KartModelFactory {
  create(kartId: KartId, colours?: Partial<KartColours>): KartModel;
}

export const KART_COLOURS: Record<KartId, KartColours> = {
  maple: { body: 0xe63946, accent: 0xf1faee, driver: 0xffd6a5 },
  pixie: { body: 0xffc300, accent: 0xff70a6, driver: 0xffe5ec },
  boulder: { body: 0x2b59c3, accent: 0x14213d, driver: 0xc9ada7 },
  swoop: { body: 0x2a9d8f, accent: 0xe9c46a, driver: 0xffddd2 },
};

/** Extra paint jobs for when the same kart appears more than once in a race. */
const ALTERNATE_BODIES: Record<KartId, number[]> = {
  maple: [0x9d0208, 0xf77f00],
  pixie: [0xc77dff, 0x80ed99],
  boulder: [0x6c757d, 0x3a0ca3],
  swoop: [0x06d6a0, 0x118ab2],
};

/** Colours for the `repeat`-th copy of a kart in a race (0 = the standard paint). */
export function alternateColours(kartId: KartId, repeat: number): Partial<KartColours> {
  if (repeat === 0) return {};
  const options = ALTERNATE_BODIES[kartId];
  const body = options[(repeat - 1) % options.length];
  return body === undefined ? {} : { body };
}

export const SPARKS_PER_WHEEL = 6;

interface Shape {
  chassis: [width: number, height: number, length: number];
  chassisY: number;
  frontRadius: number;
  rearRadius: number;
  /** Wheel centres (x, z). */
  frontZ: number;
  rearZ: number;
  wheelX: number;
  driverY: number;
  driverZ: number;
}

const SHAPES: Record<KartId, Shape> = {
  maple: {
    chassis: [1.3, 0.45, 2.1],
    chassisY: 0.45,
    frontRadius: 0.32,
    rearRadius: 0.32,
    frontZ: -0.75,
    rearZ: 0.75,
    wheelX: 0.72,
    driverY: 1.05,
    driverZ: 0.25,
  },
  pixie: {
    chassis: [1.05, 0.35, 1.8],
    chassisY: 0.38,
    frontRadius: 0.26,
    rearRadius: 0.28,
    frontZ: -0.7,
    rearZ: 0.72,
    wheelX: 0.66,
    driverY: 0.9,
    driverZ: 0.2,
  },
  boulder: {
    chassis: [1.45, 0.6, 2.0],
    chassisY: 0.55,
    frontRadius: 0.33,
    rearRadius: 0.38,
    frontZ: -0.72,
    rearZ: 0.66,
    wheelX: 0.7,
    driverY: 1.2,
    driverZ: 0.3,
  },
  swoop: {
    chassis: [1.2, 0.32, 2.1],
    chassisY: 0.36,
    frontRadius: 0.29,
    rearRadius: 0.3,
    frontZ: -0.8,
    rearZ: 0.74,
    wheelX: 0.72,
    driverY: 0.88,
    driverZ: 0.3,
  },
};

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

/** Distinct silhouettes from primitives: shared layout, per-kart proportions and details. */
export class PrimitiveKartFactory implements KartModelFactory {
  create(kartId: KartId, colours: Partial<KartColours> = {}): KartModel {
    const palette = { ...KART_COLOURS[kartId], ...colours };
    const shape = SHAPES[kartId];
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const [w, h, l] = shape.chassis;
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), lambert(palette.body));
    chassis.position.y = shape.chassisY;
    body.add(chassis);

    const driver = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), lambert(palette.driver));
    driver.position.set(0, shape.driverY, shape.driverZ);
    body.add(driver);

    this.addDetails(kartId, body, shape, palette);
    const { wheels, frontWheels } = this.addWheels(body, shape);
    const sparks = this.addSparks(body, shape);
    const flame = this.addFlame(body, shape);
    const drone = createDrone();
    root.add(drone);
    return { root, body, wheels, frontWheels, sparks, flame, wheelRadius: shape.rearRadius, drone };
  }

  private addDetails(kartId: KartId, body: THREE.Group, shape: Shape, palette: KartColours) {
    const accent = lambert(palette.accent);
    const [w, h, l] = shape.chassis;
    const top = shape.chassisY + h / 2;
    switch (kartId) {
      case 'maple': {
        const nose = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.5), lambert(palette.body));
        nose.position.set(0, shape.chassisY - 0.05, -1.2);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, l * 0.9), accent);
        stripe.position.set(0, top + 0.01, 0);
        body.add(nose, stripe);
        break;
      }
      case 'pixie': {
        // Pointy nose cone and a little bow on the driver.
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 12), lambert(palette.body));
        nose.rotation.x = -Math.PI / 2;
        // Tip at −1.45 m = the physics footprint's front edge.
        nose.position.set(0, shape.chassisY, -1.05);
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 16), accent);
        bow.position.set(0, shape.driverY + 0.35, shape.driverZ);
        body.add(nose, bow);
        break;
      }
      case 'boulder': {
        // Heavy front bumper and a roll cage.
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.25, 0.25), accent);
        bumper.position.set(0, shape.chassisY - 0.1, -1.3);
        const cage = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 16, Math.PI), accent);
        cage.position.set(0, top, shape.driverZ + 0.35);
        body.add(bumper, cage);
        break;
      }
      case 'swoop': {
        // Rear wing on two posts, and a fin.
        const wing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.06, 0.35), accent);
        wing.position.set(0, top + 0.45, 0.85);
        for (const x of [-0.4, 0.4]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), accent);
          post.position.set(x, top + 0.22, 0.85);
          body.add(post);
        }
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.6), lambert(palette.body));
        nose.position.set(0, shape.chassisY - 0.05, -1.15);
        body.add(wing, nose);
        break;
      }
    }
  }

  private addWheels(body: THREE.Group, shape: Shape) {
    const material = lambert(0x222222);
    const wheels: THREE.Object3D[] = [];
    const frontWheels: THREE.Object3D[] = [];
    for (const front of [true, false]) {
      const radius = front ? shape.frontRadius : shape.rearRadius;
      const geometry = new THREE.CylinderGeometry(radius, radius, 0.28, 16);
      geometry.rotateZ(Math.PI / 2);
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(side * shape.wheelX, radius, front ? shape.frontZ : shape.rearZ);
        const wheel = new THREE.Mesh(geometry, material);
        pivot.add(wheel);
        body.add(pivot);
        wheels.push(wheel);
        if (front) frontWheels.push(pivot);
      }
    }
    return { wheels, frontWheels };
  }

  private addSparks(body: THREE.Group, shape: Shape): THREE.Group[] {
    return [-shape.wheelX, shape.wheelX].map((x) => {
      const cluster = new THREE.Group();
      cluster.position.set(x, 0.12, shape.rearZ + shape.rearRadius + 0.1);
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (let i = 0; i < SPARKS_PER_WHEEL; i += 1) {
        cluster.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), material));
      }
      cluster.visible = false;
      body.add(cluster);
      return cluster;
    });
  }

  private addFlame(body: THREE.Group, shape: Shape): THREE.Mesh {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.2, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.85 }),
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, shape.chassisY, shape.chassis[2] / 2 + 0.6);
    flame.visible = false;
    body.add(flame);
    return flame;
  }
}

/** Little quad-rotor that carries respawning karts back to the track (original design). */
function createDrone(): THREE.Group {
  const drone = new THREE.Group();
  const shell = lambert(0xf1faee);
  const accent = lambert(0x118ab2);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), shell);
  drone.add(hub);
  for (const [x, z] of [
    [0.8, 0.8],
    [-0.8, 0.8],
    [0.8, -0.8],
    [-0.8, -0.8],
  ] as const) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), accent);
    arm.position.set(x / 2, 0, z / 2);
    arm.lookAt(0, 0, 0);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 12), accent);
    rotor.position.set(x, 0.1, z);
    drone.add(arm, rotor);
  }
  // Cable down to the kart.
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), lambert(0x333333));
  cable.position.y = -0.9;
  drone.add(cable);
  drone.position.y = 2.6;
  drone.visible = false;
  return drone;
}
