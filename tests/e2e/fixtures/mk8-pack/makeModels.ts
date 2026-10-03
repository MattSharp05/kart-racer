// Writes the fixture pack's synthetic models (MK-101): a block figure per MK8 racer id (two
// materials, a two-joint skeleton with a `Head` bone, like the real rigged racers), the Standard
// Kart's body and tire, and Lakitu on his cloud, and adds them to `manifest.json`. No Nintendo
// files: every shape is a coloured box or cylinder made here. Run from the repo root:
//   node tests/e2e/fixtures/mk8-pack/makeModels.ts
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Document, NodeIO, type Material, type Mesh, type Node } from '@gltf-transform/core';

const PACK = import.meta.dirname;
const RACERS = [
  'mario',
  'luigi',
  'peach',
  'daisy',
  'yoshi',
  'toad',
  'koopa-troopa',
  'shy-guy',
  'donkey-kong',
  'bowser',
  'wario',
  'waluigi',
];
/** Body colours, one per racer, so the lineup's figures tell apart. */
const COLOURS = [
  [0.85, 0.15, 0.15],
  [0.15, 0.7, 0.2],
  [0.95, 0.55, 0.75],
  [0.98, 0.65, 0.1],
  [0.4, 0.85, 0.3],
  [0.95, 0.95, 0.95],
  [0.95, 0.85, 0.2],
  [0.75, 0.1, 0.2],
  [0.55, 0.3, 0.15],
  [0.2, 0.55, 0.25],
  [0.95, 0.8, 0.1],
  [0.45, 0.2, 0.6],
] as const;

type Vec3 = [number, number, number];

/** A box's triangles (positions, normals, indices), centred at `c`, size `s`. */
function box(c: Vec3, s: Vec3) {
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
function cylinder(segments = 16) {
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

type Shape = ReturnType<typeof box>;

function material(doc: Document, rgb: readonly number[]): Material {
  return doc
    .createMaterial()
    .setBaseColorFactor([rgb[0]!, rgb[1]!, rgb[2]!, 1])
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0);
}

/** A primitive from shapes (merged), optionally bound to one joint each. */
function primitive(doc: Document, shapes: Shape[], mat: Material, joint?: number) {
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

function newDoc(): Document {
  const doc = new Document();
  doc.createBuffer();
  return doc;
}

function scene(doc: Document, ...nodes: Node[]): void {
  doc.getRoot().setDefaultScene(doc.createScene().addChild(nodes[0]!));
  for (const node of nodes.slice(1)) doc.getRoot().getDefaultScene()!.addChild(node);
}

/** A block figure facing +Z (glTF's forward), sitting: body, head with a nose, a `Head` bone. */
function racer(index: number): Document {
  const doc = newDoc();
  const buffer = doc.getRoot().listBuffers()[0]!;
  const tall = 1 + (index % 4) * 0.08;
  const headY = 0.62 * tall;
  const bodyMat = material(doc, COLOURS[index]!);
  const skinMat = material(doc, [0.98, 0.82, 0.68]);
  const mesh: Mesh = doc
    .createMesh('figure')
    .addPrimitive(
      primitive(
        doc,
        [
          box([0, 0.3 * tall, 0], [0.55, 0.6 * tall, 0.45]),
          box([0, 0.5 * tall, 0.3], [0.5, 0.12, 0.35]),
        ],
        bodyMat,
        0,
      ),
    )
    .addPrimitive(
      primitive(
        doc,
        [
          box([0, headY + 0.2, 0], [0.42, 0.4, 0.42]),
          box([0, headY + 0.18, 0.25], [0.1, 0.1, 0.12]),
        ],
        skinMat,
        1,
      ),
    );
  const hips = doc.createNode('Hips');
  const head = doc.createNode('Head').setTranslation([0, headY, 0]);
  hips.addChild(head);
  const inverseBind = new Float32Array([
    ...[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    ...[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -headY, 0, 1],
  ]);
  const skin = doc
    .createSkin('skeleton')
    .addJoint(hips)
    .addJoint(head)
    .setSkeleton(hips)
    .setInverseBindMatrices(
      doc.createAccessor().setType('MAT4').setArray(inverseBind).setBuffer(buffer),
    );
  const figure = doc.createNode('figure').setMesh(mesh).setSkin(skin);
  scene(doc, hips, figure);
  return doc;
}

function kartBody(): Document {
  const doc = newDoc();
  const paint = material(doc, [0.85, 0.12, 0.12]);
  const trim = material(doc, [0.2, 0.2, 0.22]);
  const mesh = doc
    .createMesh('standard-kart')
    .addPrimitive(
      primitive(
        doc,
        [box([0, 0.2, 0], [1.1, 0.3, 1.7]), box([0, 0.38, 0.62], [0.9, 0.12, 0.4])],
        paint,
      ),
    )
    .addPrimitive(
      primitive(
        doc,
        [box([0, 0.55, -0.2], [0.7, 0.5, 0.12]), box([0, 0.45, 0.75], [0.35, 0.25, 0.08])],
        trim,
      ),
    );
  scene(doc, doc.createNode('standard-kart').setMesh(mesh));
  return doc;
}

function tire(): Document {
  const doc = newDoc();
  const mesh = doc
    .createMesh('standard-tire')
    .addPrimitive(primitive(doc, [cylinder()], material(doc, [0.08, 0.08, 0.1])));
  scene(doc, doc.createNode('standard-tire').setMesh(mesh));
  return doc;
}

function lakitu(): Document {
  const doc = newDoc();
  const cloud = material(doc, [0.97, 0.97, 1]);
  const shell = material(doc, [0.3, 0.7, 0.3]);
  const mesh = doc
    .createMesh('lakitu')
    .addPrimitive(
      primitive(doc, [box([0, 0.2, 0], [1.2, 0.4, 1]), box([0, 0.35, 0], [0.8, 0.3, 1.2])], cloud),
    )
    .addPrimitive(
      primitive(
        doc,
        [box([0, 0.75, 0], [0.5, 0.6, 0.45]), box([0, 1.2, 0.05], [0.4, 0.35, 0.4])],
        shell,
      ),
    );
  scene(doc, doc.createNode('lakitu').setMesh(mesh));
  return doc;
}

interface Entry {
  path: string;
  bytes: number;
  sha256: string;
  group: string;
}

const io = new NodeIO();
const written: Entry[] = [];
async function write(path: string, group: string, doc: Document): Promise<void> {
  const bytes = await io.writeBinary(doc);
  mkdirSync(dirname(join(PACK, path)), { recursive: true });
  writeFileSync(join(PACK, path), bytes);
  written.push({
    path,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    group,
  });
}

for (const [i, id] of RACERS.entries())
  await write(`models/racers/${id}.glb`, `racer/${id}`, racer(i));
await write('models/karts/bodies/standard-kart.glb', 'karts', kartBody());
await write('models/karts/tires/standard-tires.glb', 'karts', tire());
await write('models/npcs/lakitu.glb', 'npcs', lakitu());

const manifestFile = join(PACK, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as { version: 1; files: Entry[] };
const paths = new Set(written.map((e) => e.path));
manifest.files = [...manifest.files.filter((e) => !paths.has(e.path)), ...written].sort((a, b) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
);
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${written.length} models`);
