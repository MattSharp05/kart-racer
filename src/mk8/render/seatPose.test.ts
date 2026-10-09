import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import mario from '../content/racers/mario/render';
import { KART_BODY_PATH, KART_TIRE_PATH, Mk8RacerModel, fitModel, parseGlb } from './racerModel';
import { SEAT_POSE, boneWords, seatRacer } from './seatPose';

type V = [number, number, number];

/** A skeleton from [name, parent name, offset] rows; the first row is the root. */
function rig(rows: [string, string | null, V, THREE.Euler?][]): THREE.Group {
  const root = new THREE.Group();
  const byName = new Map<string, THREE.Bone>();
  for (const [name, parent, at, rotation] of rows) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(...at);
    if (rotation) bone.rotation.copy(rotation);
    (parent ? byName.get(parent)! : root).add(bone);
    byName.set(name, bone);
  }
  return root;
}

/** A Mixamo-style T-pose facing +Z (left = +X), 1.8 m, with a skirt and a ponytail. */
function mixamo(): THREE.Group {
  const rows: [string, string | null, V][] = [
    ['Hips', null, [0, 0.9, 0]],
    ['Spine', 'Hips', [0, 0.3, 0]],
    ['Neck', 'Spine', [0, 0.25, 0]],
    ['Head', 'Neck', [0, 0.1, 0]],
    ['Ponytail1', 'Head', [0, 0, -0.1]],
    ['Ponytail2', 'Ponytail1', [0, -0.3, 0]],
    ['Ponytail3', 'Ponytail2', [0, -0.3, 0]],
    ['SkirtFront', 'Hips', [0, -0.1, 0.1]],
  ];
  for (const [side, x] of [
    ['Left', 1],
    ['Right', -1],
  ] as const) {
    rows.push(
      [`${side}Shoulder`, 'Spine', [0.1 * x, 0.2, 0]],
      [`${side}Arm`, `${side}Shoulder`, [0.15 * x, 0, 0]],
      [`${side}ForeArmRoll`, `${side}Arm`, [0.14 * x, 0, 0]],
      [`${side}ForeArm`, `${side}ForeArmRoll`, [0.14 * x, 0, 0]],
      [`${side}Hand`, `${side}ForeArm`, [0.25 * x, 0, 0]],
      [`${side}HandIndex1`, `${side}Hand`, [0.08 * x, 0, 0]],
      [`${side}UpLeg`, 'Hips', [0.1 * x, -0.05, 0]],
      [`${side}Leg`, `${side}UpLeg`, [0, -0.4, 0]],
      [`${side}Foot`, `${side}Leg`, [0, -0.4, 0]],
      [`${side}ToeBase`, `${side}Foot`, [0, -0.05, 0.12]],
      [`${side}SkirtSide`, 'Hips', [0.15 * x, -0.1, 0]],
    );
  }
  return rig(rows);
}

/** Seats `root` in a holder turned like `fitModel`'s (facing −Z); returns the holder. */
function seated(root: THREE.Object3D, kinds?: ('arm' | 'leg')[]) {
  const holder = new THREE.Group();
  root.rotation.y = Math.PI;
  holder.add(root);
  const report = seatRacer(root, holder, kinds);
  return { holder, report };
}

const at = (root: THREE.Object3D, name: string) =>
  root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());

/** The aim of pose `p` for a limb on side `side` (+1 = +X), normalised. */
const aimOf = (p: readonly [number, number, number], side: 1 | -1) =>
  new THREE.Vector3(p[0] * side, p[1], p[2]).normalize();

describe('seated driving pose (MK-101 QA round 2)', () => {
  it('splits bone names into words', () => {
    expect(boneWords('Arm1L')).toEqual(expect.arrayContaining(['arm', '1', 'l']));
    expect(boneWords('L_UpperArm')).toEqual(expect.arrayContaining(['l', 'upper', 'upperarm']));
    expect(boneWords('mixamorig:LeftUpLeg')).toEqual(
      expect.arrayContaining(['left', 'up', 'leg', 'upleg']),
    );
    expect(boneWords('ClavicleR')).toEqual(expect.arrayContaining(['clavicle', 'r']));
  });

  it('bends a Mixamo-named rig: elbows and knees, never the clavicle, skirt, hair or twist bones', () => {
    const root = mixamo();
    const { report } = seated(root);
    expect(report.byName).toBe(true);
    const bones = report.limbs.map((l) => `${l.kind}:${l.bones.join('>')}`).sort();
    expect(bones).toEqual([
      'arm:LeftArm>LeftForeArm',
      'arm:RightArm>RightForeArm',
      'leg:LeftUpLeg>LeftLeg',
      'leg:RightUpLeg>RightLeg',
    ]);
    // Facing −Z, the racer's left limbs are at −X.
    for (const limb of report.limbs)
      expect(limb.side).toBe(limb.bones[0].startsWith('Left') ? -1 : 1);
  });

  it('aims each segment along the pose, whatever the bones’ own axes', () => {
    // Bones with arbitrary bind rotations (children placed to keep the same T-pose positions).
    const twisted = new THREE.Euler(0.4, -1.1, 0.7);
    const root = rig([
      ['Hip', null, [0, 0.9, 0]],
      ['Leg1L', 'Hip', [0.1, 0, 0], twisted],
      ['Leg2L', 'Leg1L', [0, -0.4, 0]],
      ['FootL', 'Leg2L', [0, -0.4, 0]],
    ]);
    // Undo the twist on the children's offsets so the leg still hangs straight down.
    const inv = new THREE.Quaternion().setFromEuler(twisted).invert();
    for (const name of ['Leg2L', 'FootL'])
      root.getObjectByName(name)!.position.applyQuaternion(inv);
    root.updateMatrixWorld(true);
    expect(at(root, 'FootL').x).toBeCloseTo(at(root, 'Leg1L').x, 5);
    const { holder, report } = seated(root);
    expect(report.limbs).toHaveLength(1);
    const side = report.limbs[0]!.side;
    const toFrame = (v: THREE.Vector3) => v.applyMatrix4(holder.matrixWorld.clone().invert());
    const hip = toFrame(at(root, 'Leg1L'));
    const knee = toFrame(at(root, 'Leg2L'));
    const foot = toFrame(at(root, 'FootL'));
    expect(knee.clone().sub(hip).normalize().dot(aimOf(SEAT_POSE.leg.upper, side))).toBeCloseTo(
      1,
      5,
    );
    expect(foot.clone().sub(knee).normalize().dot(aimOf(SEAT_POSE.leg.lower, side))).toBeCloseTo(
      1,
      5,
    );
  });

  it('falls back to the skeleton’s shape when no bone is named like a limb', () => {
    const rows: [string, string | null, V][] = [
      ['b0', null, [0, 0.9, 0]],
      ['b1', 'b0', [0, 0.5, 0]],
      ['b2', 'b1', [0, 0.2, 0]],
    ];
    for (const [s, x] of [
      ['a', 1],
      ['c', -1],
    ] as const) {
      rows.push(
        [`${s}3`, 'b1', [0.1 * x, 0, 0]],
        [`${s}4`, `${s}3`, [0.3 * x, 0, 0]],
        [`${s}5`, `${s}4`, [0.3 * x, 0, 0]],
        [`${s}6`, 'b0', [0.1 * x, 0, 0]],
        [`${s}7`, `${s}6`, [0, -0.45, 0]],
        [`${s}8`, `${s}7`, [0, -0.45, 0]],
      );
    }
    const { report } = seated(rig(rows));
    expect(report.byName).toBe(false);
    expect(report.limbs.map((l) => l.kind).sort()).toEqual(['arm', 'arm', 'leg', 'leg']);
  });

  it('leaves a rig without limbs alone; bends only the kinds asked for (Lakitu: arms)', () => {
    const plain = rig([
      ['root', null, [0, 0, 0]],
      ['Head', 'root', [0, 1, 0]],
    ]);
    expect(seated(plain).report.limbs).toEqual([]);
    const arms = seated(mixamo(), ['arm']).report;
    expect(arms.limbs.map((l) => l.kind)).toEqual(['arm', 'arm']);
  });

  it('seats the fixture pack’s racers: lower than standing, hands forward, at the seat', async () => {
    const pack = new URL('../../../tests/e2e/fixtures/mk8-pack/', import.meta.url);
    const glb = (path: string) => {
      const bytes = readFileSync(new URL(path, pack));
      return parseGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    };
    const [racer, body, tire, standing] = await Promise.all([
      glb('models/racers/mario.glb'),
      glb(KART_BODY_PATH),
      glb(KART_TIRE_PATH),
      glb('models/racers/mario.glb'),
    ]);
    const model = new Mk8RacerModel(mario, { racer, body, tire });
    expect(model.seat.byName).toBe(true);
    expect(model.seat.limbs.map((l) => l.bones.join('>')).sort()).toEqual([
      'Arm1L>Arm2L',
      'Arm1R>Arm2R',
      'Leg1L>Leg2L',
      'Leg1R>Leg2R',
    ]);
    model.object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(racer);
    // Standing it was `height` tall; seated, its knees and hands come forward and it sits lower.
    const tall = new THREE.Box3()
      .setFromObject(fitModel(standing, 'y', mario.height))
      .getSize(new THREE.Vector3()).y;
    expect(tall).toBeCloseTo(mario.height, 3);
    expect(box.max.y - box.min.y).toBeLessThan(mario.height * 0.85);
    const [x, y] = mario.seat;
    expect(box.min.y).toBeCloseTo(y + model.kart.rideHeight, 3);
    for (const name of ['HandL', 'HandR', 'Leg2L', 'Leg2R'])
      expect(at(racer, name).z, name).toBeLessThan(at(racer, 'Spine1').z - 0.1);
    // The hands meet in front of the chest, nearer the middle than the shoulders.
    expect(Math.abs(at(racer, 'HandL').x - x)).toBeLessThan(
      Math.abs(at(racer, 'Arm1L').x - x) + 0.15,
    );
  });
});
