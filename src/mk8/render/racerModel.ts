// An MK8 racer in its kart (MK-101): the racer's GLB from the pack, scaled to its view's height and
// seated in the Standard Kart (body + 4 tires; other parts are the loadout ticket, MK-102), posed
// each frame from `motion.ts`. The models have skeletons but no animations: the head bone (when
// there is one) turns to look back; everything else is transforms on the groups below.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mk8RacerView } from '../content/racers/view';
import { trickRoll, type MotionState } from './motion';

/** The pack's files this needs (`tools/mk8/sources.ts` → `modelOutputs`). */
export const KART_BODY_PATH = 'models/karts/bodies/standard-kart.glb';
export const KART_TIRE_PATH = 'models/karts/tires/standard-tires.glb';
export const racerModelPath = (view: Pick<Mk8RacerView, 'model'>) =>
  `models/racers/${view.model}.glb`;

/** The Standard Kart's size here, metres: body length (the sim's kart is ~1.7 m across). */
const KART_LENGTH = 1.7;
const TIRE_DIAMETER = 0.42;
/** Tires sit this share of the body's half-length/half-width from its centre. */
const AXLE_SHARE = 0.68;
const TRACK_SHARE = 0.92;
/** How much of the driver's lean the kart body shares. */
const KART_LEAN_SHARE = 0.3;
/** Without a head bone the whole driver turns this share of the look-back. */
const BODY_LOOK_SHARE = 0.35;
/** glTF models face +Z; our karts face −Z. */
const GLTF_TO_KART_YAW = Math.PI;
const HEAD_BONE = /head/i;

let gltfLoader: GLTFLoader | undefined;

/** A pack GLB's scene (meshopt-compressed, WebP textures). */
export async function parseGlb(bytes: ArrayBuffer): Promise<THREE.Group> {
  gltfLoader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // `parseAsync` may keep the buffer; hand it a copy so the loader's bytes stay whole.
  const gltf = await gltfLoader.parseAsync(bytes.slice(0), '');
  return gltf.scene;
}

/**
 * Wraps `object` so it faces −Z, is scaled to `size` along `axis` and has the bottom centre of its
 * bounding box at the origin.
 */
export function fitModel(
  object: THREE.Object3D,
  axis: 'x' | 'y' | 'z',
  size: number,
  yaw = 0,
): THREE.Group {
  const holder = new THREE.Group();
  object.rotation.y += GLTF_TO_KART_YAW + yaw;
  holder.add(object);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const extent = box.max[axis] - box.min[axis];
  const scale = extent > 0 ? size / extent : 1;
  object.scale.multiplyScalar(scale);
  const centre = box.getCenter(new THREE.Vector3());
  object.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
  return holder;
}

/**
 * Merges the plain (unskinned, single-material) meshes under `root` that share a material into one
 * mesh each, baking their transforms, so a kart's four tires are one draw call. Meshes whose
 * attributes don't match stay as they are.
 */
export function mergeStaticMeshes(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.SkinnedMesh) return;
    if (Array.isArray(o.material)) return;
    const list = byMaterial.get(o.material) ?? [];
    list.push(o as THREE.Mesh);
    byMaterial.set(o.material, list);
  });
  for (const [material, meshes] of byMaterial) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => {
      const g = mesh.geometry.clone();
      g.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
      return g;
    });
    const merged = mergeGeometries(geometries);
    for (const g of geometries) g.dispose();
    if (!merged) continue;
    for (const mesh of meshes) mesh.removeFromParent();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = meshes[0]?.name ?? '';
    root.add(mesh);
  }
}

/** The loaded parts a racer model is built from (each a fresh scene, owned by the model). */
export interface RacerParts {
  racer: THREE.Object3D;
  body: THREE.Object3D;
  /** One tire; the kart gets four clones. */
  tire: THREE.Object3D;
}

/**
 * One racer in the Standard Kart. Place `object` at the kart (position, heading) and call `pose`
 * with the kart's motion every frame.
 */
export class Mk8RacerModel {
  /** The caller's handle: kart position and heading go here. */
  readonly object = new THREE.Group();
  /** Bob, squash, hit spin and trick roll: kart and driver together. */
  private readonly motion = new THREE.Group();
  /** The driver's lean pivot, at the seat. */
  private readonly driver = new THREE.Group();
  private readonly head: THREE.Bone | undefined;
  private readonly headRest = new THREE.Quaternion();
  private readonly look = new THREE.Quaternion();

  constructor(
    readonly view: Mk8RacerView,
    parts: RacerParts,
  ) {
    this.object.name = view.id;
    this.motion.rotation.order = 'YXZ';
    this.object.add(this.motion);

    const kart = new THREE.Group();
    kart.name = 'kart';
    const body = fitModel(parts.body, 'z', KART_LENGTH);
    kart.add(body);
    const size = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
    for (const [side, end] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const tire = fitModel(parts.tire.clone(), 'y', TIRE_DIAMETER, side > 0 ? Math.PI : 0);
      tire.position.set((side * size.x * TRACK_SHARE) / 2, 0, (end * size.z * AXLE_SHARE) / 2);
      kart.add(tire);
    }
    // The tires sit under the body: lift it to rest on them.
    body.position.y = TIRE_DIAMETER / 2;
    mergeStaticMeshes(kart);
    this.motion.add(kart);

    const [x, y, z] = view.seat;
    this.driver.position.set(x, y + TIRE_DIAMETER / 2, z);
    this.driver.add(fitModel(parts.racer, 'y', view.height, view.yaw));
    this.motion.add(this.driver);

    let head: THREE.Bone | undefined;
    parts.racer.traverse((o) => {
      if (!head && o instanceof THREE.Bone && HEAD_BONE.test(o.name)) head = o;
    });
    this.head = head;
    if (head) this.headRest.copy(head.quaternion);
  }

  /** Draws `m`: the kart rolls a little with the driver's lean. */
  pose(m: MotionState): void {
    const squashY = 1 - m.squash;
    const squashXZ = 1 + m.squash / 2;
    this.motion.position.y = m.bob;
    this.motion.scale.set(squashXZ, squashY, squashXZ);
    this.motion.rotation.y = m.spin;
    this.motion.rotation.z = -m.lean * KART_LEAN_SHARE + trickRoll(m.trick);
    this.driver.rotation.z = -m.lean * (1 - KART_LEAN_SHARE);
    if (this.head) {
      this.look.setFromAxisAngle(Y_AXIS, -m.look);
      this.head.quaternion.copy(this.headRest).premultiply(this.look);
      this.driver.rotation.y = 0;
    } else {
      this.driver.rotation.y = -m.look * BODY_LOOK_SHARE;
    }
  }

  /** Whether the racer's skeleton has a head bone (the look-back turns only it). */
  get hasHeadBone(): boolean {
    return this.head !== undefined;
  }

  dispose(): void {
    this.object.removeFromParent();
    disposeTree(this.object);
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Frees the geometries, materials and textures under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const value of Object.values(material as unknown as Record<string, unknown>))
        if (value instanceof THREE.Texture) value.dispose();
      (material as THREE.Material).dispose();
    }
  });
}
