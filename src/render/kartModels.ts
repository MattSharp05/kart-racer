import * as THREE from 'three';
import { racerViews } from '../content/racers/render';
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

/** Colours for the `repeat`-th copy of a kart in a race (0 = the standard paint). */
export function alternateColours(kartId: KartId, repeat: number): Partial<KartColours> {
  if (repeat === 0) return {};
  const options = racerViews.get(kartId).alternateBodies;
  const body = options[(repeat - 1) % options.length];
  return body === undefined ? {} : { body };
}

export const SPARKS_PER_WHEEL = 6;

/** A kart's proportions (m); each racer's `render.ts` sets its own. */
export interface KartShape {
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

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

/**
 * Distinct silhouettes from primitives: shared layout, per-kart proportions and details (from each
 * racer's `src/content/racers/<id>/render.ts`).
 */
export class PrimitiveKartFactory implements KartModelFactory {
  create(kartId: KartId, colours: Partial<KartColours> = {}): KartModel {
    const view = racerViews.get(kartId);
    const palette = { ...view.colours, ...colours };
    const shape = view.shape;
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

    view.details({ body, shape, palette, lambert });
    const { wheels, frontWheels } = this.addWheels(body, shape);
    const sparks = this.addSparks(body, shape);
    const flame = this.addFlame(body, shape);
    const drone = createDrone();
    root.add(drone);
    return { root, body, wheels, frontWheels, sparks, flame, wheelRadius: shape.rearRadius, drone };
  }

  private addWheels(body: THREE.Group, shape: KartShape) {
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

  private addSparks(body: THREE.Group, shape: KartShape): THREE.Group[] {
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

  private addFlame(body: THREE.Group, shape: KartShape): THREE.Mesh {
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
