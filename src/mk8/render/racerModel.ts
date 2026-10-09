// An MK8 racer in its kart (MK-101): the racer's GLB from the pack, scaled to its view's height and
// seated in a kart assembled from its parts (`kartAssembly.ts`, MK-102; the Standard Kart unless
// told otherwise), posed each frame from `motion.ts`. The models have skeletons but no animations: at
// load the legs and arms are bent into a seated driving pose (`seatPose.ts`, QA round 2: they came
// in standing in a T-pose); the head bone (when there is one) turns to look back; everything else
// is transforms on the groups below.
//
// The real pack (MK-136) differs from the fixture's block figures, handled here: every mesh is
// skinned (the DAE skeletons), the tire model is the kart's set of four tires (each with an
// overlay layer), and the conversion got some materials wrong (`repairMaterials`).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STANDARD_PARTS, mk8Body, mk8Glider, mk8Tires } from '../content/parts';
import type { Mk8RacerView } from '../content/racers/view';
import { rootGeometry } from './courseBatch';
import { Mk8Kart, bodyModelPath, tireModelPath } from './kartAssembly';
import { trickRoll, type MotionState } from './motion';
import { seatRacer, type SeatReport } from './seatPose';

/** The pack's files this needs (`tools/mk8/sources.ts` → `modelOutputs`). */
export const KART_BODY_PATH = bodyModelPath(STANDARD_PARTS.body);
export const KART_TIRE_PATH = tireModelPath(STANDARD_PARTS.tires);
export const racerModelPath = (view: Pick<Mk8RacerView, 'model'>) =>
  `models/racers/${view.model}.glb`;

/** How much of the driver's lean the kart body shares. */
const KART_LEAN_SHARE = 0.3;
/** Without a head bone the whole driver turns this share of the look-back. */
const BODY_LOOK_SHARE = 0.35;
/** glTF models face +Z; our karts face −Z. */
const GLTF_TO_KART_YAW = Math.PI;
const HEAD_BONE = /head/i;

let gltfLoader: GLTFLoader | undefined;

/** A pack GLB's scene (meshopt-compressed, WebP textures), its materials repaired. */
export async function parseGlb(bytes: ArrayBuffer): Promise<THREE.Group> {
  gltfLoader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // `parseAsync` may keep the buffer; hand it a copy so the loader's bytes stay whole.
  const gltf = await gltfLoader.parseAsync(bytes.slice(0), '');
  repairMaterials(gltf.scene);
  return gltf.scene;
}

/** Texels below this alpha are cut out on a material made opaque again. */
const CUTOUT_ALPHA = 0.5;

/** Lamps keep a full glow; nothing else in a kart or racer glows. */
const LAMP = /light|lamp/i;

/**
 * Undoes what the DAE conversion gets wrong in the real pack (MK-136):
 * - every material comes as glTF's physical model (it writes `KHR_materials_ior`/`_volume`) but
 *   uses none of it: drawn with the plain standard one, a cheaper shader on phones;
 * - fully transparent materials (blend, opacity 0: the Standard Kart, Lakitu, Peach, Daisy and
 *   Koopa Troopa) are solid models: made opaque, a texture's own alpha still cutting out;
 * - a full white glow with no glow map (the Standard Tires, three kart bodies) would draw the part
 *   flat white: switched off, except on lamps.
 */
export function repairMaterials(root: THREE.Object3D): void {
  const repaired = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const fix = (material: THREE.Material): THREE.Material => {
      let m = repaired.get(material);
      if (!m) {
        m = repairMaterial(material);
        repaired.set(material, m);
      }
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
}

function repairMaterial(material: THREE.Material): THREE.Material {
  let m = material as THREE.Material & { map?: THREE.Texture | null };
  if (material instanceof THREE.MeshPhysicalMaterial && !usesPhysical(material)) {
    m = THREE.MeshStandardMaterial.prototype.copy.call(new THREE.MeshStandardMaterial(), material);
    material.dispose();
  }
  if (m.transparent && m.opacity === 0) {
    m.opacity = 1;
    m.transparent = false;
    m.depthWrite = true;
    if (m.map) m.alphaTest = CUTOUT_ALPHA;
  }
  if (
    m instanceof THREE.MeshStandardMaterial &&
    !m.emissiveMap &&
    m.emissive.equals(WHITE) &&
    !LAMP.test(m.name)
  ) {
    m.emissive.setRGB(0, 0, 0);
  }
  return m;
}

/** Whether a physical material uses anything the standard one lacks. */
function usesPhysical(m: THREE.MeshPhysicalMaterial): boolean {
  return (
    m.transmission > 0 ||
    m.clearcoat > 0 ||
    m.sheen > 0 ||
    m.iridescence > 0 ||
    m.anisotropy > 0 ||
    m.dispersion > 0 ||
    m.specularIntensity !== 1 ||
    !m.specularColor.equals(WHITE) ||
    m.specularColorMap !== null ||
    m.specularIntensityMap !== null
  );
}

const WHITE = new THREE.Color(1, 1, 1);

const vertex = new THREE.Vector3();
const direction = new THREE.Vector4();

/**
 * Swaps every skinned mesh under `root` for a plain one in its current pose, positions and normals
 * baked (float, so a quantized mesh's scale, carried by its bind matrices, is kept). For parts that
 * never bend: a plain mesh clones and merges cleanly, a cloned skinned one keeps the original's
 * bones and draws wherever they are.
 */
export function bakeSkinned(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) skinned.push(o);
  });
  for (const mesh of skinned) {
    const source = mesh.geometry;
    const position = source.getAttribute('position');
    const normal = source.getAttribute('normal');
    const positions = new Float32Array(position.count * 3);
    const normals = normal ? new Float32Array(normal.count * 3) : undefined;
    for (let i = 0; i < position.count; i++) {
      mesh.applyBoneTransform(i, vertex.fromBufferAttribute(position, i)).toArray(positions, i * 3);
      if (normal && normals) {
        direction.set(normal.getX(i), normal.getY(i), normal.getZ(i), 0);
        mesh.applyBoneTransform(i, direction);
        vertex
          .set(direction.x, direction.y, direction.z)
          .normalize()
          .toArray(normals, i * 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (normals) geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    for (const [name, attribute] of Object.entries(source.attributes)) {
      if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(name))
        geometry.setAttribute(name, attribute);
    }
    geometry.setIndex(source.getIndex());
    for (const group of source.groups)
      geometry.addGroup(group.start, group.count, group.materialIndex);
    const plain = new THREE.Mesh(geometry, mesh.material);
    plain.name = mesh.name;
    plain.position.copy(mesh.position);
    plain.quaternion.copy(mesh.quaternion);
    plain.scale.copy(mesh.scale);
    mesh.parent?.add(plain);
    mesh.removeFromParent();
  }
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  return meshes;
}

/** Two meshes whose bounds agree to this share of the model's size are the same shape. */
const SAME_SHAPE_SHARE = 1e-3;

function sameBox(a: THREE.Box3, b: THREE.Box3, tolerance: number): boolean {
  return a.min.distanceTo(b.min) <= tolerance && a.max.distanceTo(b.max) <= tolerance;
}

/**
 * Removes overlay layers: meshes on exactly the same geometry as an earlier one (the real pack's
 * kart parts repeat each mesh up to three times, with mask textures, which z-fight it).
 */
export function dropLayers(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const tolerance =
    new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).length() * SAME_SHAPE_SHARE;
  const kept: THREE.Box3[] = [];
  for (const mesh of meshesOf(root)) {
    const box = new THREE.Box3().setFromObject(mesh);
    if (kept.some((k) => sameBox(k, box, tolerance))) mesh.removeFromParent();
    else kept.push(box);
  }
}

/**
 * One wheel of a tire model (baked, see `bakeSkinned`; layers dropped, see `dropLayers`). The real
 * pack's tire model is the kart's four tires in place; this keeps the meshes on the first one. A
 * model of one tire comes back whole.
 */
export function singleTire(scene: THREE.Object3D): THREE.Object3D {
  bakeSkinned(scene);
  scene.updateMatrixWorld(true);
  const [first, ...rest] = meshesOf(scene);
  if (!first) return scene;
  const firstBox = new THREE.Box3().setFromObject(first);
  const centre = firstBox.getCenter(new THREE.Vector3());
  const reach = firstBox.getSize(new THREE.Vector3()).length() / 2;
  for (const mesh of rest) {
    const at = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    if (at.distanceTo(centre) > reach) mesh.removeFromParent();
  }
  dropLayers(scene);
  return scene;
}

/** Z-up (+Y forward) to glTF's Y-up (+Z forward): a quarter turn about X, then a half about Y. */
const Z_UP_TO_Y_UP = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));

/**
 * A kart body stood upright. Most of the real pack's bodies came out of the DAE conversion Z-up
 * with +Y forward (the Standard Kart is Y-up): a body is longer than it is tall, so one whose Y
 * extent beats its Z extent is turned into glTF's frame (wrapped, so `fitModel` can still turn it).
 */
export function uprightBody(body: THREE.Object3D): THREE.Object3D {
  body.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
  if (size.y <= size.z) return body;
  const upright = new THREE.Group();
  upright.quaternion.copy(Z_UP_TO_Y_UP);
  upright.add(body);
  const holder = new THREE.Group();
  holder.add(upright);
  return holder;
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
    // Positions as floats: the pack's are quantized (normalized int16, scaled back by the node), and
    // baking the node's scale into int16 wrapped them round (MK-101 round 4, as MK-123 found).
    const geometries = meshes.map((mesh) => rootGeometry(mesh, inverse));
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
  /** The tire model (one tire, or the set of four); the kart gets four clones of one tire. */
  tire: THREE.Object3D;
  /** The glider, when the kart has one (hidden until it glides). */
  glider?: THREE.Object3D;
}

/** Which kart parts a racer model is built with (part ids); default the standard kart. */
export interface RacerKartParts {
  body: string;
  tires: string;
  glider?: string;
}

/**
 * One racer in its kart. Place `object` at the kart (position, heading) and call `pose` with the
 * kart's motion every frame.
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
  /** The kart the racer sits in. */
  readonly kart: Mk8Kart;
  /** The limbs bent into the seated pose at load (`seatPose.ts`). */
  readonly seat: SeatReport;

  constructor(
    readonly view: Mk8RacerView,
    parts: RacerParts,
    kartParts: RacerKartParts = STANDARD_PARTS,
  ) {
    this.object.name = view.id;
    this.motion.rotation.order = 'YXZ';
    this.object.add(this.motion);

    this.kart = new Mk8Kart({
      body: mk8Body(kartParts.body),
      tires: mk8Tires(kartParts.tires),
      ...(kartParts.glider !== undefined && parts.glider
        ? { glider: mk8Glider(kartParts.glider) }
        : {}),
      models: {
        body: parts.body,
        tire: parts.tire,
        ...(parts.glider ? { glider: parts.glider } : {}),
      },
    });
    this.motion.add(this.kart.object);

    const [x, y, z] = view.seat;
    this.driver.position.set(x, y + this.kart.rideHeight, z);
    // Scaled by its standing (bind-pose) height, then seated: lowered so its seat, now its lowest
    // point, rests where its feet stood.
    const fitted = fitModel(parts.racer, 'y', view.height, view.yaw);
    this.seat = seatRacer(parts.racer, fitted);
    if (this.seat.limbs.length > 0) {
      fitted.updateMatrixWorld(true);
      parts.racer.position.y -= new THREE.Box3().setFromObject(fitted).min.y;
    }
    this.driver.add(fitted);
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
