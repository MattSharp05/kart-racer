// A course's collision built from its model (MK-123 round 2). The pack's `collision.bin` keeps only
// a surface per triangle, decided when the pack was built; the course model (`course.glb`) keeps
// every material apart by name (`tools/mk8/models.ts`), so the client can apply the course's
// `materials.ts` itself, with the pipeline's rules (`tools/mk8/collision.ts`): each material maps
// to its surface (unlisted ones to the name guesses), `ignore` drops its triangles. Sweet Sweet
// Canyon's deployed `collision.bin` was built from the guesses alone (the soda's surface solid
// road, the road under it water, the "…Blight" roads missing), so it opts in
// (`Mk8CourseContent.collisionFromModel`) and drives on the pack as it is, no rebuild.
//
// Deterministic: the bytes alone decide the result (meshopt decoding is exact, the transforms are
// doubles rounded to float32 once), so host and clients build the same mesh. The full and `-low`
// models give the same mesh: the pipeline encodes both from one geometry and only their textures
// differ (`tools/mk8/modelCollision.test.ts` pins it), so the sim doesn't depend on `&quality`.
// Not simplified (the pipeline's meshoptimizer is a dev dependency): every triangle of the kept
// materials, minus degenerate ones; `modelCollision.perf.test.ts` holds a dense 300k-triangle
// course to the query budget.
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  collisionFromTriangles,
  MESH_SURFACES,
  type CollisionMesh,
  type MeshMaterialSurface,
  type MeshSurface,
} from '../../../sim/meshCollision';
import { guessSurface } from './surfaceGuess';

/** The pipeline's grid cell, m (`tools/mk8/collision.ts` `COLLISION_DEFAULTS.cellSize`). */
export const MODEL_COLLISION_CELL = 4;

/** Resolves once the meshopt decoder (WebAssembly) is ready; `modelCollision` needs it. */
export const modelCollisionReady: Promise<void> = MeshoptDecoder.ready;

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
/** glTF primitive mode 4 = TRIANGLES (the only mode the pipeline collects). */
const TRIANGLES = 4;

interface GltfJson {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: {
    children?: number[];
    mesh?: number;
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes?: {
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
      material?: number;
      mode?: number;
    }[];
  }[];
  materials?: { name?: string }[];
  accessors?: {
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    normalized?: boolean;
    count: number;
    type: string;
    sparse?: unknown;
  }[];
  bufferViews?: {
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
    extensions?: {
      EXT_meshopt_compression?: {
        buffer: number;
        byteOffset?: number;
        byteLength: number;
        byteStride: number;
        count: number;
        mode: 'ATTRIBUTES' | 'TRIANGLES' | 'INDICES';
        filter?: 'NONE' | 'OCTAHEDRAL' | 'QUATERNION' | 'EXPONENTIAL';
      };
    };
  }[];
}

/** What reading the model found, besides the mesh (for the course check and tests). */
export interface ModelCollisionStats {
  /** Triangles kept per surface. */
  surfaces: Partial<Record<MeshSurface, number>>;
  /** Triangles dropped: `ignore` materials, and degenerate ones. */
  ignored: number;
  degenerate: number;
  /** Materials the map doesn't list (they took the name guesses). */
  guessed: string[];
}

/**
 * The collision mesh of a course model (GLB bytes, meshopt-compressed and quantized as the
 * pipeline writes them, or plain), its materials mapped by `materials`. Call after
 * `modelCollisionReady`. Throws on a file it can't read.
 */
export function modelCollision(
  glb: ArrayBuffer | Uint8Array,
  materials: Readonly<Record<string, MeshMaterialSurface>>,
  cellSize: number = MODEL_COLLISION_CELL,
): { mesh: CollisionMesh; stats: ModelCollisionStats } {
  const { json, bin } = readGlb(glb);
  const views = new Map<number, Uint8Array>();
  const view = (index: number) => {
    let bytes = views.get(index);
    if (!bytes) views.set(index, (bytes = bufferView(json, bin, index)));
    return bytes;
  };
  const groups = MESH_SURFACES.map(() => [] as number[]);
  const stats: ModelCollisionStats = { surfaces: {}, ignored: 0, degenerate: 0, guessed: [] };
  const guessed = new Set<string>();

  const visit = (nodeIndex: number, parent: Matrix) => {
    const node = json.nodes?.[nodeIndex];
    if (!node) throw new Error(`course model: no node ${nodeIndex}`);
    const world = multiply(parent, localMatrix(node));
    const [
      m0 = 1,
      m1 = 0,
      m2 = 0,
      ,
      m4 = 0,
      m5 = 1,
      m6 = 0,
      ,
      m8 = 0,
      m9 = 0,
      m10 = 1,
      ,
      m12 = 0,
      m13 = 0,
      m14 = 0,
    ] = world;
    const mesh = node.mesh === undefined ? undefined : json.meshes?.[node.mesh];
    for (const prim of mesh?.primitives ?? []) {
      if ((prim.mode ?? TRIANGLES) !== TRIANGLES) continue;
      const name = prim.material === undefined ? '' : (json.materials?.[prim.material]?.name ?? '');
      let surface = materials[name];
      if (surface === undefined) {
        surface = guessSurface(name);
        guessed.add(name);
      }
      const position = prim.attributes.POSITION;
      if (position === undefined) continue;
      if (surface === 'ignore') {
        // Counted without decoding (indices, else vertices): ignored materials are a good share.
        stats.ignored += Math.floor((json.accessors?.[prim.indices ?? position]?.count ?? 0) / 3);
        continue;
      }
      const positions = readAccessor(json, view, position);
      const indices =
        prim.indices === undefined ? undefined : readAccessor(json, view, prim.indices);
      const count = indices ? indices.length : positions.length / 3;
      const out = groups[MESH_SURFACES.indexOf(surface)];
      if (!out) throw new Error(`course model: unknown surface ${surface}`);
      const triangle = new Float32Array(9);
      for (let i = 0; i + 2 < count; i += 3) {
        for (let k = 0; k < 3; k += 1) {
          const v = indices ? (indices[i + k] ?? 0) : i + k;
          const x = positions[v * 3] ?? 0;
          const y = positions[v * 3 + 1] ?? 0;
          const z = positions[v * 3 + 2] ?? 0;
          triangle[k * 3] = m0 * x + m4 * y + m8 * z + m12;
          triangle[k * 3 + 1] = m1 * x + m5 * y + m9 * z + m13;
          triangle[k * 3 + 2] = m2 * x + m6 * y + m10 * z + m14;
        }
        if (degenerate(triangle)) {
          stats.degenerate += 1;
          continue;
        }
        for (const value of triangle) out.push(value);
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const root of scene?.nodes ?? []) visit(root, IDENTITY);

  // Surfaces in code order, as the pipeline writes them.
  const total = groups.reduce((sum, g) => sum + g.length / 9, 0);
  const positions = new Float32Array(total * 9);
  const surfaces = new Uint8Array(total);
  let t = 0;
  groups.forEach((group, code) => {
    positions.set(group, t * 9);
    surfaces.fill(code, t, t + group.length / 9);
    t += group.length / 9;
    const surface = MESH_SURFACES[code];
    if (surface && group.length) stats.surfaces[surface] = group.length / 9;
  });
  stats.guessed = [...guessed].sort();
  return { mesh: collisionFromTriangles(positions, surfaces, cellSize), stats };
}

/** A float32 triangle with (next to) no area: nothing to stand on or hit. */
function degenerate(t: Float32Array): boolean {
  const e1x = (t[3] ?? 0) - (t[0] ?? 0);
  const e1y = (t[4] ?? 0) - (t[1] ?? 0);
  const e1z = (t[5] ?? 0) - (t[2] ?? 0);
  const e2x = (t[6] ?? 0) - (t[0] ?? 0);
  const e2y = (t[7] ?? 0) - (t[1] ?? 0);
  const e2z = (t[8] ?? 0) - (t[2] ?? 0);
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  return nx * nx + ny * ny + nz * nz === 0;
}

function readGlb(input: ArrayBuffer | Uint8Array): { json: GltfJson; bin: Uint8Array } {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || data.getUint32(0, true) !== GLB_MAGIC)
    throw new Error('course model: not a GLB');
  let json: GltfJson | undefined;
  let bin: Uint8Array = new Uint8Array(0);
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const length = data.getUint32(offset, true);
    const type = data.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
    else if (type === CHUNK_BIN) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error('course model: no JSON chunk');
  return { json, bin };
}

/** A buffer view's bytes, meshopt-decoded when compressed. Only the GLB's own buffer is read. */
function bufferView(json: GltfJson, bin: Uint8Array, index: number): Uint8Array {
  const view = json.bufferViews?.[index];
  if (!view) throw new Error(`course model: no buffer view ${index}`);
  const meshopt = view.extensions?.EXT_meshopt_compression;
  if (meshopt) {
    if (meshopt.buffer !== 0) throw new Error('course model: meshopt data outside the GLB');
    const start = meshopt.byteOffset ?? 0;
    const source = bin.subarray(start, start + meshopt.byteLength);
    const target = new Uint8Array(meshopt.count * meshopt.byteStride);
    MeshoptDecoder.decodeGltfBuffer(
      target,
      meshopt.count,
      meshopt.byteStride,
      source,
      meshopt.mode,
      meshopt.filter ?? 'NONE',
    );
    return target;
  }
  if (view.buffer !== 0) throw new Error('course model: data outside the GLB');
  const start = view.byteOffset ?? 0;
  return bin.subarray(start, start + view.byteLength);
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** An accessor's values as numbers, dequantized (`normalized`) as glTF defines. */
function readAccessor(
  json: GltfJson,
  view: (index: number) => Uint8Array,
  index: number,
): Float64Array {
  const accessor = json.accessors?.[index];
  if (!accessor || accessor.bufferView === undefined || accessor.sparse)
    throw new Error(`course model: accessor ${index} unsupported`);
  const components = COMPONENTS[accessor.type];
  const info = COMPONENT_TYPES[accessor.componentType];
  if (!components || !info) throw new Error(`course model: accessor ${index} unsupported`);
  const bytes = view(accessor.bufferView);
  const declared = json.bufferViews?.[accessor.bufferView];
  const stride =
    declared?.extensions?.EXT_meshopt_compression?.byteStride ??
    declared?.byteStride ??
    components * info.size;
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float64Array(accessor.count * components);
  const base = accessor.byteOffset ?? 0;
  for (let i = 0; i < accessor.count; i += 1)
    for (let c = 0; c < components; c += 1) {
      const raw = info.read(data, base + i * stride + c * info.size);
      out[i * components + c] = accessor.normalized ? info.normalize(raw) : raw;
    }
  return out;
}

interface ComponentType {
  size: number;
  read: (data: DataView, offset: number) => number;
  normalize: (value: number) => number;
}

const COMPONENT_TYPES: Record<number, ComponentType> = {
  5120: { size: 1, read: (d, o) => d.getInt8(o), normalize: (v) => Math.max(v / 127, -1) },
  5121: { size: 1, read: (d, o) => d.getUint8(o), normalize: (v) => v / 255 },
  5122: { size: 2, read: (d, o) => d.getInt16(o, true), normalize: (v) => Math.max(v / 32767, -1) },
  5123: { size: 2, read: (d, o) => d.getUint16(o, true), normalize: (v) => v / 65535 },
  5125: { size: 4, read: (d, o) => d.getUint32(o, true), normalize: (v) => v },
  5126: { size: 4, read: (d, o) => d.getFloat32(o, true), normalize: (v) => v },
};

/** Column-major 4×4, as glTF stores `matrix`. */
type Matrix = readonly number[];
const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function localMatrix(node: NonNullable<GltfJson['nodes']>[number]): Matrix {
  if (node.matrix?.length === 16) return node.matrix;
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  const [x = 0, y = 0, z = 0, w = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  // T · R · S
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col += 1)
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      out[col * 4 + row] = sum;
    }
  return out;
}
