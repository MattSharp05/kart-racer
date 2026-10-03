// Shared pieces of the fixture pack's synthetic models (MK-101, MK-102, MK-136): coloured boxes and
// cylinders, materials, skins, and the `FixtureFile` every spec file in this folder lists. Not a
// spec itself (`make.ts` skips it).
import { Document, NodeIO, type Material, type Node } from '@gltf-transform/core';
import { KHRMaterialsIOR, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';

/**
 * One file of the fixture pack: where it goes, its manifest group, and how to make its bytes.
 * Without `make` it is a committed file made some other way (the WebP tiles, the sine), listed so
 * the manifest has it.
 */
export interface FixtureFile {
  path: string;
  group: string;
  make?: () => Promise<Uint8Array>;
}

const io = new NodeIO().registerExtensions([KHRMaterialsIOR, KHRMeshQuantization]);

/** A document as GLB bytes, quantized first like the real pack's kart parts (`quantized`). */
export async function glb(doc: Document, quantized = false): Promise<Uint8Array> {
  // The real pack's meshes are quantized: a skinned mesh's scale then lives in its bind matrices.
  if (quantized) await doc.transform(quantize());
  return io.writeBinary(doc);
}

export type Vec3 = [number, number, number];

/** A box's triangles (positions, normals, indices), centred at `c`, size `s`. */
export function box(c: Vec3, s: Vec3) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const faces: [Vec3, Vec3, Vec3][] = [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
    [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [0, 1, 0],
      [1, 0, 0],
    ],
  ];
  for (const [n, u, v] of faces) {
    const base = positions.length / 3;
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      for (let k = 0; k < 3; k++)
        positions.push(c[k]! + (s[k]! / 2) * (n[k]! + a * u[k]! + b * v[k]!));
      normals.push(...n);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

/** A tire: a cylinder along X, diameter 1, width 0.45. */
export function cylinder(segments = 16) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const half = 0.225;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const y = Math.cos(a) * 0.5;
    const z = Math.sin(a) * 0.5;
    positions.push(-half, y, z, half, y, z);
    normals.push(0, y * 2, z * 2, 0, y * 2, z * 2);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  for (const side of [-1, 1]) {
    const centre = positions.length / 3;
    positions.push(side * half, 0, 0);
    normals.push(side, 0, 0);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(side * half, Math.cos(a) * 0.5, Math.sin(a) * 0.5);
      normals.push(side, 0, 0);
    }
    for (let i = 0; i < segments; i++)
      indices.push(
        ...(side > 0
          ? [centre, centre + 1 + i, centre + 2 + i]
          : [centre, centre + 2 + i, centre + 1 + i]),
      );
  }
  return { positions, normals, indices };
}

export type Shape = ReturnType<typeof box>;

export function material(doc: Document, rgb: readonly number[]): Material {
  return doc
    .createMaterial()
    .setBaseColorFactor([rgb[0]!, rgb[1]!, rgb[2]!, 1])
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0);
}

/** What the real pack's DAE conversion makes of an opaque material: blend, opacity 0. */
export function lostOpacity(m: Material): Material {
  const [r, g, b] = m.getBaseColorFactor();
  return m.setAlphaMode('BLEND').setBaseColorFactor([r, g, b, 0]);
}

/** A one-joint skin at the origin (the real kart parts are all skinned). */
export function rootSkin(
  doc: Document,
  name: string,
): { joint: Node; skin: ReturnType<Document['createSkin']> } {
  const joint = doc.createNode(`${name}_root`);
  const skin = doc
    .createSkin(name)
    .addJoint(joint)
    .setSkeleton(joint)
    .setInverseBindMatrices(
      doc
        .createAccessor()
        .setType('MAT4')
        .setArray(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]))
        .setBuffer(doc.getRoot().listBuffers()[0]!),
    );
  return { joint, skin };
}

/** A primitive from shapes (merged), optionally bound to one joint each. */
export function primitive(doc: Document, shapes: Shape[], mat: Material, joint?: number) {
  const buffer = doc.getRoot().listBuffers()[0]!;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const s of shapes) {
    const base = positions.length / 3;
    positions.push(...s.positions);
    normals.push(...s.normals);
    indices.push(...s.indices.map((i) => i + base));
  }
  const count = positions.length / 3;
  const prim = doc
    .createPrimitive()
    .setMaterial(mat)
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer),
    )
    .setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer),
    );
  if (joint !== undefined) {
    const joints = new Uint16Array(count * 4);
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      joints[i * 4] = joint;
      weights[i * 4] = 1;
    }
    prim
      .setAttribute(
        'JOINTS_0',
        doc.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer),
      )
      .setAttribute(
        'WEIGHTS_0',
        doc.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer),
      );
  }
  return prim;
}

export function newDoc(): Document {
  const doc = new Document();
  doc.createBuffer();
  return doc;
}

export function scene(doc: Document, ...nodes: Node[]): void {
  doc.getRoot().setDefaultScene(doc.createScene().addChild(nodes[0]!));
  for (const node of nodes.slice(1)) doc.getRoot().getDefaultScene()!.addChild(node);
}
