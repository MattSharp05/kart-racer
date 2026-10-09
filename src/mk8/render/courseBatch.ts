// Course mesh batching (MK-133): an MK8 course GLB arrives as hundreds of small static meshes, one
// draw call each. Meshes that share a material are merged into one, per square cell of the course,
// so the draw calls fall to about one per material per cell in view, and the cells still let the
// camera's frustum skip the parts of the course behind it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Side of a batching cell, m: a course (~600 m across) splits into a few dozen of them. */
export const COURSE_CELL_METRES = 120;

/** How many meshes went in and how many came out. */
export interface BatchStats {
  meshesBefore: number;
  meshesAfter: number;
}

/**
 * Merges `root`'s static meshes in place: those with the same material, the same vertex
 * attributes and a centre in the same `cellSize` cell (on X/Z, world space) become one mesh, a
 * child of `root` (so `root`'s own transform, e.g. a course's scale, still applies once).
 * Left alone: skinned, instanced and morphing meshes, meshes with several materials and mirrored
 * ones (their winding would flip). Call it before the course is first drawn, with its matrices up
 * to date; it never changes what is drawn, only how many draws it takes.
 */
export function batchCourseMeshes(
  root: THREE.Object3D,
  cellSize: number = COURSE_CELL_METRES,
): BatchStats {
  root.updateMatrixWorld(true);
  const groups = new Map<string, THREE.Mesh[]>();
  let meshesBefore = 0;
  const centre = new THREE.Vector3();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshesBefore += 1;
    if (!batchable(object)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometry.boundingBox?.getCenter(centre).applyMatrix4(object.matrixWorld);
    const cell = `${Math.floor(centre.x / cellSize)},${Math.floor(centre.z / cellSize)}`;
    const key = `${(object.material as THREE.Material).uuid}|${signature(geometry)}|${cell}`;
    const group = groups.get(key);
    if (group) group.push(object);
    else groups.set(key, [object]);
  });

  let merged = 0;
  const toRoot = root.matrixWorld.clone().invert();
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geometry = mergeGeometries(meshes.map((m) => rootGeometry(m, toRoot)));
    const first = meshes[0];
    if (!geometry || !first) continue;
    const material = first.material as THREE.Material;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `batch:${material.name}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = first.renderOrder;
    mesh.updateMatrixWorld(true);
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    for (const m of meshes) m.removeFromParent();
    merged += meshes.length - 1;
  }
  // The meshes moved out were never drawn: nothing on the GPU to free.
  return { meshesBefore, meshesAfter: meshesBefore - merged };
}

function batchable(mesh: THREE.Mesh): boolean {
  if (mesh instanceof THREE.SkinnedMesh || mesh instanceof THREE.InstancedMesh) return false;
  if (Array.isArray(mesh.material) || !mesh.visible) return false;
  const geometry = mesh.geometry as THREE.BufferGeometry;
  if (Object.keys(geometry.morphAttributes).length > 0) return false;
  if (!geometry.attributes.position) return false;
  return mesh.matrixWorld.determinant() > 0;
}

/** What `mergeGeometries` needs to match: attribute names, sizes and types, and an index. */
function signature(geometry: THREE.BufferGeometry): string {
  const attributes = Object.keys(geometry.attributes)
    .sort()
    .map((name) => {
      const a = geometry.getAttribute(name);
      return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`;
    });
  return `${attributes.join(',')}|${geometry.index ? 'i' : 'n'}`;
}

/**
 * A copy of the mesh's geometry in the root's space (`toRoot`: world → root), de-interleaved, its
 * positions as floats. The pack's models are quantized (KHR_mesh_quantization: positions are
 * normalized int16 in the mesh's box, the node's transform scales them back), and moving int16
 * positions out to metres wrapped them round (MK-123 round 2: Sweet Sweet Canyon's road, merged
 * from many meshes, vanished while karts still drove on it).
 */
function rootGeometry(mesh: THREE.Mesh, toRoot: THREE.Matrix4): THREE.BufferGeometry {
  const source = mesh.geometry as THREE.BufferGeometry;
  const geometry = new THREE.BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    const attribute = source.getAttribute(name);
    geometry.setAttribute(
      name,
      name === 'position'
        ? floatAttribute(attribute)
        : attribute instanceof THREE.InterleavedBufferAttribute
          ? attribute.clone()
          : (attribute as THREE.BufferAttribute).clone(),
    );
  }
  if (source.index) geometry.setIndex(source.index.clone());
  geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
  return geometry;
}

/** The attribute's values (dequantized) in a new float32 attribute. */
function floatAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): THREE.BufferAttribute {
  const { count, itemSize } = attribute;
  const values = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i += 1)
    for (let c = 0; c < itemSize; c += 1) values[i * itemSize + c] = attribute.getComponent(i, c);
  return new THREE.BufferAttribute(values, itemSize);
}
