// The fixture pack's kart parts (MK-101, MK-102): the Standard Kart's body and tires, copying the
// real pack's quirks `render/racerModel.ts` handles (MK-136: skinned, quantized meshes; the tire
// model as the set of four, each tire with an overlay layer on the same geometry; physical
// materials; a white glow on the tires; transparent paint), then 5 more bodies, 3 tires and 3
// gliders, each its own colour and proportions. Group `karts`.
import { KHRMaterialsIOR } from '@gltf-transform/extensions';
import type { Document } from '@gltf-transform/core';
import {
  box,
  cylinder,
  glb,
  lostOpacity,
  material,
  newDoc,
  primitive,
  rootSkin,
  scene,
  type FixtureFile,
  type Shape,
  type Vec3,
} from './gltf.ts';

function kartBody(): Document {
  const doc = newDoc();
  const paint = lostOpacity(material(doc, [0.85, 0.12, 0.12]));
  const trim = material(doc, [0.2, 0.2, 0.22]);
  const mesh = doc
    .createMesh('standard-kart')
    .addPrimitive(
      primitive(
        doc,
        [box([0, 0.2, 0], [1.1, 0.3, 1.7]), box([0, 0.38, 0.62], [0.9, 0.12, 0.4])],
        paint,
        0,
      ),
    )
    .addPrimitive(
      primitive(
        doc,
        [box([0, 0.55, -0.2], [0.7, 0.5, 0.12]), box([0, 0.45, 0.75], [0.35, 0.25, 0.08])],
        trim,
        0,
      ),
    );
  const { joint, skin } = rootSkin(doc, 'standard-kart');
  scene(doc, joint, doc.createNode('standard-kart').setMesh(mesh).setSkin(skin));
  return doc;
}

/** Where the set's four tires sit, in its own (bigger) units, like the real model's. */
const TIRE_SPOTS: Record<string, Vec3> = {
  LF: [3, 0, 3.5],
  RF: [-3, 0, 3.5],
  LB: [3, 0, -3.5],
  RB: [-3, 0, -3.5],
};
const TIRE_SET_SCALE = 3.5;

/**
 * The Standard Tires as the real pack has them: the kart's four tires in place, each a skinned
 * mesh drawn at its wheel by a joint, plus an overlay layer on the same geometry (pale, like the
 * real mask texture). The rubber is a physical material with a full white glow, as converted.
 */
function tire(): Document {
  const doc = newDoc();
  const ior = doc.createExtension(KHRMaterialsIOR).createIOR().setIOR(1.45);
  const rubber = material(doc, [0.08, 0.08, 0.1])
    .setName('m_Tire')
    .setEmissiveFactor([1, 1, 1])
    .setExtension('KHR_materials_ior', ior);
  const overlay = material(doc, [0.95, 0.95, 0.95]).setName('m_Tire.001');
  const buffer = doc.getRoot().listBuffers()[0]!;
  const root = doc.createNode('tires_root');
  const joints = Object.entries(TIRE_SPOTS).map(([name, at]) => {
    const joint = doc.createNode(`Tire_${name}`).setTranslation(at);
    root.addChild(joint);
    return joint;
  });
  const skin = doc
    .createSkin('tires')
    .setSkeleton(root)
    .setInverseBindMatrices(
      doc
        .createAccessor()
        .setType('MAT4')
        .setArray(
          new Float32Array(joints.flatMap(() => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])),
        )
        .setBuffer(buffer),
    );
  for (const joint of joints) skin.addJoint(joint);
  const scaled = (shape: Shape): Shape => ({
    ...shape,
    positions: shape.positions.map((v) => v * TIRE_SET_SCALE),
  });
  const nodes = Object.keys(TIRE_SPOTS).flatMap((name, i) =>
    [rubber, overlay].map((mat, layer) =>
      doc
        .createNode(`TireK_${name}__m_Tire${layer ? '_001' : ''}`)
        .setMesh(
          doc
            .createMesh(`tire-${name}-${layer}`)
            .addPrimitive(primitive(doc, [scaled(cylinder())], mat, i)),
        )
        .setSkin(skin),
    ),
  );
  scene(doc, root, ...nodes);
  return doc;
}

/** A body other than the Standard Kart (MK-102): a hull and a seat back, its own shape. */
function otherBody(
  id: string,
  rgb: readonly number[],
  hull: Vec3,
  extra: { at: Vec3; size: Vec3 }[],
): Document {
  const doc = newDoc();
  const paint = material(doc, rgb);
  const trim = material(doc, [0.2, 0.2, 0.22]);
  const mesh = doc
    .createMesh(id)
    .addPrimitive(
      primitive(
        doc,
        [box([0, hull[1] / 2 + 0.05, 0], hull), ...extra.map((e) => box(e.at, e.size))],
        paint,
      ),
    )
    .addPrimitive(primitive(doc, [box([0, hull[1] + 0.2, -0.2], [0.6, 0.4, 0.1])], trim));
  scene(doc, doc.createNode(id).setMesh(mesh));
  return doc;
}

/** Bodies after the Standard Kart: id, colour, hull size (x, y, z; +Z is the front) and extras. */
const BODIES: [string, readonly number[], Vec3, { at: Vec3; size: Vec3 }[]][] = [
  // An open frame: thin rails.
  [
    'pipe-frame',
    [0.95, 0.75, 0.1],
    [1.2, 0.08, 1.6],
    [
      { at: [0.55, 0.2, 0], size: [0.08, 0.3, 1.6] },
      { at: [-0.55, 0.2, 0], size: [0.08, 0.3, 1.6] },
    ],
  ],
  ['mach-8', [0.2, 0.35, 0.85], [0.9, 0.28, 1.9], [{ at: [0, 0.2, 0.95], size: [1.3, 0.06, 0.3] }]],
  [
    'cat-cruiser',
    [0.95, 0.95, 0.9],
    [1.1, 0.4, 1.6],
    [
      { at: [0.3, 0.55, 0.6], size: [0.15, 0.2, 0.08] },
      { at: [-0.3, 0.55, 0.6], size: [0.15, 0.2, 0.08] },
    ],
  ],
  ['b-dasher', [0.1, 0.1, 0.12], [1, 0.3, 2], [{ at: [0, 0.4, -0.85], size: [1.2, 0.08, 0.25] }]],
  [
    'sports-coupe',
    [0.15, 0.6, 0.3],
    [1.1, 0.45, 1.9],
    [{ at: [0, 0.6, -0.1], size: [0.9, 0.25, 0.8] }],
  ],
];

/** A tire other than the Standard (MK-102): a cylinder scaled wider or narrower, its own grey. */
function otherTire(id: string, rgb: readonly number[], width: number): Document {
  const doc = newDoc();
  const shape = cylinder();
  shape.positions = shape.positions.map((v, i) => (i % 3 === 0 ? (v * width) / 0.45 : v));
  const mesh = doc.createMesh(id).addPrimitive(primitive(doc, [shape], material(doc, rgb)));
  scene(doc, doc.createNode(id).setMesh(mesh));
  return doc;
}

const TIRES: [string, readonly number[], number][] = [
  ['monster-tires', [0.18, 0.12, 0.08], 0.7],
  ['slim-tires', [0.35, 0.35, 0.4], 0.25],
  ['slick-tires', [0.05, 0.05, 0.05], 0.55],
];

/** A glider (MK-102): a wide flat wing on two struts, its own colour. */
function glider(id: string, rgb: readonly number[], depth: number): Document {
  const doc = newDoc();
  const mesh = doc
    .createMesh(id)
    .addPrimitive(primitive(doc, [box([0, 0.6, 0], [2, 0.06, depth])], material(doc, rgb)))
    .addPrimitive(
      primitive(
        doc,
        [box([0.3, 0.3, 0], [0.04, 0.6, 0.04]), box([-0.3, 0.3, 0], [0.04, 0.6, 0.04])],
        material(doc, [0.3, 0.3, 0.3]),
      ),
    );
  scene(doc, doc.createNode(id).setMesh(mesh));
  return doc;
}

const GLIDERS: [string, readonly number[], number][] = [
  ['paper-glider', [0.95, 0.95, 0.85], 0.7],
  ['cloud-glider', [0.85, 0.92, 1], 0.9],
  ['peach-parasol', [0.98, 0.6, 0.8], 1.6],
];

const files: FixtureFile[] = [
  {
    path: 'models/karts/bodies/standard-kart.glb',
    group: 'karts',
    make: () => glb(kartBody(), true),
  },
  {
    path: 'models/karts/tires/standard-tires.glb',
    group: 'karts',
    make: () => glb(tire(), true),
  },
  ...BODIES.map(([id, rgb, hull, extra]) => ({
    path: `models/karts/bodies/${id}.glb`,
    group: 'karts',
    make: () => glb(otherBody(id, rgb, hull, extra)),
  })),
  ...TIRES.map(([id, rgb, width]) => ({
    path: `models/karts/tires/${id}.glb`,
    group: 'karts',
    make: () => glb(otherTire(id, rgb, width)),
  })),
  ...GLIDERS.map(([id, rgb, depth]) => ({
    path: `models/karts/gliders/${id}.glb`,
    group: 'karts',
    make: () => glb(glider(id, rgb, depth)),
  })),
];
export default files;
