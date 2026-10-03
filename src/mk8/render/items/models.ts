// MK8 item models (MK-103): parsed from the pack's `models/items/<id>.glb` (meshopt-compressed GLB
// from `pnpm mk8:build`), each centred and scaled to one metre, then copied (sharing geometry and
// textures) wherever an item is drawn.
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Mk8Loader } from '../../loader';

/** A model's GLB in the pack. */
export const itemModelPath = (model: string): string => `models/items/${model}.glb`;

/** How a pack model's materials are fixed up for us. */
interface ModelFix {
  /** Paint it this colour (the pack's lightning has no texture, MK-93's BUILD_REPORT)… */
  tint?: string;
  /** …glowing this much. */
  glow?: number;
  /**
   * Swap its texture's red and green: the pack's red shell is the green shell's model and texture
   * (MK8 colours shells in its shader).
   */
  swapRedGreen?: boolean;
  /**
   * The model already stands upright (MK-126: the coin, whose DAE isn't turned like the others),
   * so `normalise` leaves it as it is.
   */
  upright?: boolean;
  /**
   * Materials the conversion left fully transparent that are really solid (MK-126: the Piranha
   * Plant and its pot), drawn opaque instead of as glass.
   */
  opaque?: boolean;
  /** Keeps its skeleton (posed by its bones) instead of `unskin`'s rest pose. */
  skinned?: boolean;
}

const FIXES: Readonly<Record<string, ModelFix>> = {
  lightning: { tint: '#ffd21f', glow: 0.35 },
  'red-shell': { swapRedGreen: true },
  coin: { upright: true },
  'piranha-plant': { opaque: true, upright: true, skinned: true },
};
/**
 * See-through materials the DAE conversion left fully transparent (the item box's glass came out
 * with opacity 0): drawn as glass that adds its light, this strong (reflection layers, `…Ref…`
 * meshes, fainter).
 */
const GLASS_OPACITY = 0.9;
const REFLECTION_OPACITY = 0.5;

/** Item models by pack model id. */
export class ItemModels {
  constructor(private readonly templates: ReadonlyMap<string, THREE.Object3D>) {}

  has(model: string): boolean {
    return this.templates.has(model);
  }

  ids(): string[] {
    return [...this.templates.keys()];
  }

  /** A copy of `model`, centred on the origin, its largest side `size` m; `undefined` if missing. */
  instance(model: string, size: number): THREE.Object3D | undefined {
    const template = this.templates.get(model);
    if (!template) return undefined;
    const copy = skinnedIn(template) ? cloneSkinned(template) : template.clone(true);
    copy.scale.setScalar(size);
    return copy;
  }
}

/** Whether `model` has a skinned mesh (`ModelFix.skinned`). */
function skinnedIn(model: THREE.Object3D): boolean {
  let found = false;
  model.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) found = true;
  });
  return found;
}

/**
 * Wraps `scene` so it stands upright (the pack's item models come out of the DAE conversion with
 * their top along −Z), centred on the origin with its largest side 1 m.
 */
export function normalise(scene: THREE.Object3D, alreadyUpright = false): THREE.Object3D {
  const upright = new THREE.Group();
  if (!alreadyUpright) upright.rotation.x = Math.PI / 2;
  upright.add(scene);
  const box = new THREE.Box3().setFromObject(upright);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;
  upright.position.sub(centre);
  const inner = new THREE.Group();
  inner.add(upright);
  inner.scale.setScalar(1 / largest);
  const outer = new THREE.Group();
  outer.add(inner);
  return outer;
}

/** Applies `fix` to `scene`'s materials and brings back opacity the conversion lost. */
function fixMaterials(scene: THREE.Object3D, fix: ModelFix = {}): void {
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(node.material)
      ? node.material
      : [node.material];
    for (const material of materials) {
      if (fix.opaque && material.transparent && material.opacity === 0) {
        material.transparent = false;
        material.opacity = 1;
      } else if (material.transparent && material.opacity === 0) {
        material.opacity = node.name.includes('Ref') ? REFLECTION_OPACITY : GLASS_OPACITY;
        material.blending = THREE.AdditiveBlending;
        material.depthWrite = false;
      }
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (fix.tint) material.color.set(fix.tint);
      if (fix.tint && fix.glow) {
        material.emissive.set(fix.tint);
        material.emissiveIntensity = fix.glow;
      }
      if (fix.swapRedGreen) swapRedGreen(material);
    }
  });
}

/** Draws `material`'s texture with its red and green channels swapped. */
function swapRedGreen(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\ndiffuseColor.rgb = diffuseColor.grb;',
    );
  };
  material.customProgramCacheKey = () => 'mk8-swap-red-green';
}

/**
 * Items never animate, but the pack's come with the DAE skeletons (MK-93): swap each skinned mesh
 * for a plain one in its rest pose, which copies cleanly (a cloned skinned mesh keeps the
 * original's bones and draws in the wrong place).
 */
export function unskin(scene: THREE.Object3D): void {
  const skinned: THREE.SkinnedMesh[] = [];
  scene.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) skinned.push(node);
  });
  for (const mesh of skinned) {
    const plain = new THREE.Mesh(mesh.geometry, mesh.material);
    plain.name = mesh.name;
    plain.position.copy(mesh.position);
    plain.quaternion.copy(mesh.quaternion);
    plain.scale.copy(mesh.scale);
    mesh.parent?.add(plain);
    mesh.removeFromParent();
  }
}

/** Parses one GLB into a static model. */
export async function parseModel(bytes: ArrayBuffer, keepSkin = false): Promise<THREE.Object3D> {
  const gltf = new GLTFLoader();
  gltf.setMeshoptDecoder(MeshoptDecoder);
  const scene = (await gltf.parseAsync(bytes, '')).scene;
  if (!keepSkin) unskin(scene);
  return scene;
}

/**
 * Loads the pack's item models (`ids`); ones the pack doesn't have are left out, so their items
 * keep our look. Throws what the loader throws (no pack: `PackNotInstalledError`).
 */
export async function loadItemModels(
  loader: Mk8Loader,
  ids: readonly string[],
): Promise<ItemModels> {
  await loader.loadItems();
  const templates = new Map<string, THREE.Object3D>();
  for (const id of ids) {
    const bytes = loader.file(itemModelPath(id));
    if (!bytes) continue;
    const scene = await parseModel(bytes, FIXES[id]?.skinned);
    fixMaterials(scene, FIXES[id]);
    templates.set(id, normalise(scene, FIXES[id]?.upright));
  }
  return new ItemModels(templates);
}
