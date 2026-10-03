// The fixture pack's racers (MK-101): a block figure per MK8 racer id, two materials and a
// two-joint skeleton with a `Head` bone like the real rigged racers; Peach's materials fully
// transparent like the real conversion's (MK-136). Group `racer/<id>`.
import type { Document, Mesh } from '@gltf-transform/core';
import {
  box,
  glb,
  lostOpacity,
  material,
  newDoc,
  primitive,
  scene,
  type FixtureFile,
} from './gltf.ts';

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

/** A block figure facing +Z (glTF's forward), sitting: body, head with a nose, a `Head` bone. */
function racer(index: number): Document {
  const doc = newDoc();
  const buffer = doc.getRoot().listBuffers()[0]!;
  const tall = 1 + (index % 4) * 0.08;
  const headY = 0.62 * tall;
  const bodyMat = material(doc, COLOURS[index]!);
  // Peach's materials came out of the real conversion fully transparent.
  if (RACERS[index] === 'peach') lostOpacity(bodyMat);
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

const files: FixtureFile[] = RACERS.map((id, i) => ({
  path: `models/racers/${id}.glb`,
  group: `racer/${id}`,
  make: () => glb(racer(i)),
}));
export default files;
