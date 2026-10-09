// The fixture pack's racers (MK-101): a block figure per MK8 racer id, two materials and a
// skeleton like the real rigged racers' (named limbs and a `Head` bone, in a T-pose; round 2);
// Peach's materials fully transparent like the real conversion's (MK-136). Group `racer/<id>`.
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
  type Vec3,
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

/** A bone of the fixture skeleton: its name, parent (index) and place relative to it. */
interface BoneSpec {
  name: string;
  parent?: number;
  at: Vec3;
}

/**
 * The fixture skeleton (MK-101 round 2), named the way rigs like the real racers' name their
 * bones (`Hip`, `Spine1`, `Head`, `ClavicleL`, `Arm1L`, `Arm2L`, `HandL`, `Leg1L`, `Leg2L`, `FootL`,
 * …) and in the bind pose the pack's models come in: standing, arms straight out (a T-pose). The
 * game bends it into a seated pose at load. `tall` scales it upward.
 */
function skeleton(tall: number): BoneSpec[] {
  const bones: BoneSpec[] = [
    { name: 'Hip', at: [0, 0.45 * tall, 0] },
    { name: 'Spine1', parent: 0, at: [0, 0.15 * tall, 0] },
    { name: 'Spine2', parent: 1, at: [0, 0.14 * tall, 0] },
    { name: 'Head', parent: 2, at: [0, 0.06 * tall, 0] },
  ];
  // The racer faces +Z, so its left is +X.
  for (const [side, x] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const clavicle = bones.push({ name: `Clavicle${side}`, parent: 2, at: [0.08 * x, 0, 0] }) - 1;
    const arm1 = bones.push({ name: `Arm1${side}`, parent: clavicle, at: [0.18 * x, 0, 0] }) - 1;
    const arm2 = bones.push({ name: `Arm2${side}`, parent: arm1, at: [0.22 * x, 0, 0] }) - 1;
    const hand = bones.push({ name: `Hand${side}`, parent: arm2, at: [0.2 * x, 0, 0] }) - 1;
    bones.push({ name: `Finger1${side}`, parent: hand, at: [0.08 * x, 0, 0] });
    const leg1 = bones.push({ name: `Leg1${side}`, parent: 0, at: [0.12 * x, 0, 0] }) - 1;
    const leg2 = bones.push({ name: `Leg2${side}`, parent: leg1, at: [0, -0.22 * tall, 0] }) - 1;
    const foot = bones.push({ name: `Foot${side}`, parent: leg2, at: [0, -0.2 * tall, 0] }) - 1;
    bones.push({ name: `Toe${side}`, parent: foot, at: [0, -0.03 * tall, 0.12] });
  }
  return bones;
}

/** Where each bone sits in the bind pose. */
function bindPositions(bones: BoneSpec[]): Vec3[] {
  const out: Vec3[] = [];
  for (const b of bones) {
    const p = b.parent === undefined ? [0, 0, 0] : out[b.parent]!;
    out.push([p[0]! + b.at[0], p[1]! + b.at[1], p[2]! + b.at[2]]);
  }
  return out;
}

/** A box from `a` to `b` (a limb segment), `w` thick. */
function segment(a: Vec3, b: Vec3, w: number) {
  const size: Vec3 = [
    Math.max(Math.abs(b[0] - a[0]), w),
    Math.max(Math.abs(b[1] - a[1]), w),
    Math.max(Math.abs(b[2] - a[2]), w),
  ];
  return box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], size);
}

/**
 * A block figure facing +Z (glTF's forward) in a T-pose, skinned rigidly to the skeleton above:
 * torso, arms and legs in the racer's colour, the head (with a nose) and hands in skin tone.
 */
function racer(index: number): Document {
  const doc = newDoc();
  const buffer = doc.getRoot().listBuffers()[0]!;
  const tall = 1 + (index % 4) * 0.08;
  const bones = skeleton(tall);
  const at = bindPositions(bones);
  const bone = (name: string) => bones.findIndex((b) => b.name === name);
  const headY = at[bone('Head')]![1];
  const bodyMat = material(doc, COLOURS[index]!);
  // Peach's materials came out of the real conversion fully transparent.
  if (RACERS[index] === 'peach') lostOpacity(bodyMat);
  const skinMat = material(doc, [0.98, 0.82, 0.68]);

  const body = [box([0, 0.62 * tall, 0], [0.5, 0.36 * tall, 0.4])];
  const bodyJoints = [bone('Spine1')];
  const skin = [
    box([0, headY + 0.2, 0], [0.42, 0.4, 0.42]),
    box([0, headY + 0.18, 0.25], [0.1, 0.1, 0.12]),
  ];
  const skinJoints = [bone('Head'), bone('Head')];
  for (const side of ['L', 'R']) {
    for (const [from, to, w] of [
      [`Arm1${side}`, `Arm2${side}`, 0.12],
      [`Arm2${side}`, `Hand${side}`, 0.1],
      [`Leg1${side}`, `Leg2${side}`, 0.16],
      [`Leg2${side}`, `Foot${side}`, 0.14],
      [`Foot${side}`, `Toe${side}`, 0.12],
    ] as const) {
      body.push(segment(at[bone(from)]!, at[bone(to)]!, w));
      bodyJoints.push(bone(from));
    }
    skin.push(segment(at[bone(`Hand${side}`)]!, at[bone(`Finger1${side}`)]!, 0.1));
    skinJoints.push(bone(`Hand${side}`));
  }
  const mesh: Mesh = doc
    .createMesh('figure')
    .addPrimitive(primitive(doc, body, bodyMat, bodyJoints))
    .addPrimitive(primitive(doc, skin, skinMat, skinJoints));

  const nodes = bones.map((b) => doc.createNode(b.name).setTranslation([...b.at]));
  for (const [i, b] of bones.entries())
    if (b.parent !== undefined) nodes[b.parent]!.addChild(nodes[i]!);
  // Bind pose without rotations: each inverse bind matrix undoes the bone's position.
  const inverseBind = new Float32Array(
    at.flatMap(([x, y, z]) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1]),
  );
  const skeletonSkin = doc
    .createSkin('skeleton')
    .setSkeleton(nodes[0]!)
    .setInverseBindMatrices(
      doc.createAccessor().setType('MAT4').setArray(inverseBind).setBuffer(buffer),
    );
  for (const node of nodes) skeletonSkin.addJoint(node);
  const figure = doc.createNode('figure').setMesh(mesh).setSkin(skeletonSkin);
  scene(doc, nodes[0]!, figure);
  return doc;
}

const files: FixtureFile[] = RACERS.map((id, i) => ({
  path: `models/racers/${id}.glb`,
  group: `racer/${id}`,
  make: () => glb(racer(i)),
}));
export default files;
