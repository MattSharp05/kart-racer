// The seated driving pose (MK-101 QA round 2): the pack's racers are rigged but carry no
// animations, so they load in their bind pose (a T-pose, standing). This bends their skeleton once,
// at load, into a driver's pose: thighs forward, knees bent, arms reaching to the wheel.
//
// The real rigs' bone names aren't known here (the pack is private), so limbs are found the way
// most rigs name them: a side (`L`/`Left`/`R`/`Right`, as its own word or a suffix like `ArmL`) and
// a limb word (`Leg`, `Thigh`, `Knee`, `Arm`, `Shoulder`, `Elbow`, `Hand`, …), ignoring cloth, hair
// and twist bones. Each limb is then aimed by direction, not by angles, so the bones' own axes
// don't matter: the upper segment turns to point along `upper`, the lower one along `lower`.
// Without named limbs it falls back to the skeleton's shape: chains hanging below the hips are
// legs, chains reaching out sideways are arms.
import * as THREE from 'three';

/** One limb's aim, in the driver's frame: −Z forward, +Y up, +X out to the limb's side. */
interface LimbAim {
  upper: readonly [number, number, number];
  lower: readonly [number, number, number];
}

/** The pose. Legs: thighs forward and a little up, shins down to the pedals; arms to the wheel. */
export const SEAT_POSE: { leg: LimbAim; arm: LimbAim } = {
  leg: { upper: [0.15, 0.25, -1], lower: [0.05, -0.5, -1] },
  arm: { upper: [0.3, -0.6, -0.75], lower: [-0.25, 0.05, -1] },
};

export type LimbKind = 'arm' | 'leg';

/** A posed limb: its kind, its side (+1 = +X) and the bones aimed (upper, lower). */
export interface PosedLimb {
  kind: LimbKind;
  side: 1 | -1;
  bones: [string, string];
}

/** What `seatRacer` did, for tests and the stage hooks. */
export interface SeatReport {
  limbs: PosedLimb[];
  /** Whether the limbs came from bone names (false: from the skeleton's shape). */
  byName: boolean;
}

const LEG_WORDS = new Set([
  'leg',
  'upleg',
  'thigh',
  'knee',
  'calf',
  'shin',
  'foot',
  'ankle',
  'toe',
]);
const ARM_WORDS = new Set([
  'arm',
  'upperarm',
  'forearm',
  'shoulder',
  'clavicle',
  'collar',
  'elbow',
  'hand',
  'wrist',
]);
/** Bones that hang off a limb or the body but aren't one. */
const NOT_LIMB = new Set([
  'skirt',
  'dress',
  'cloth',
  'cape',
  'hair',
  'braid',
  'ribbon',
  'tail',
  'ear',
  'hat',
  'cap',
  'sleeve',
  'shell',
  'wing',
  'cloud',
  'finger',
  'thumb',
]);
/** Helper bones along a limb (twist/roll): passed through, never bent. */
const HELPER = new Set(['roll', 'twist', 'helper', 'sub', 'end', 'null']);
const LEFT = new Set(['l', 'left']);
const RIGHT = new Set(['r', 'right']);

/** A bone name's words, lower-case: `Arm1L` → arm 1 l, `L_UpperArm` → l upper arm upperarm. */
export function boneWords(name: string): string[] {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  // Compounds split by case (`UpperArm`, `UpLeg`, `ForeArm`) also count whole.
  const joined = words.slice(1).map((w, i) => `${words[i] ?? ''}${w}`);
  return [...words, ...joined];
}

function kindOf(words: string[]): LimbKind | 'other' | undefined {
  if (words.some((w) => NOT_LIMB.has(w))) return 'other';
  if (words.some((w) => LEG_WORDS.has(w))) return 'leg';
  // A hip with a side (`L_Hip`) is a thigh; the middle one is the pelvis.
  if (words.includes('hip') && sideOf(words)) return 'leg';
  if (words.some((w) => ARM_WORDS.has(w))) return 'arm';
  return undefined;
}

function sideOf(words: string[]): 1 | -1 | undefined {
  // A side marker is its own word, or a single trailing/leading capital stuck to the name
  // (`ArmL` → arm l), which `boneWords` already split off.
  if (words.some((w) => LEFT.has(w))) return 1;
  if (words.some((w) => RIGHT.has(w))) return -1;
  return undefined;
}

const isBone = (o: THREE.Object3D): o is THREE.Bone => o instanceof THREE.Bone;
const childBones = (b: THREE.Object3D) => b.children.filter(isBone);

/** Bones under `root`, parents before children. */
function bonesOf(root: THREE.Object3D): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if (isBone(o)) bones.push(o);
  });
  return bones;
}

/** How many bones deep the longest chain below `bone` (counting it) runs within `keep`. */
function depth(bone: THREE.Bone, keep: (b: THREE.Bone) => boolean): number {
  let best = 0;
  for (const c of childBones(bone)) if (keep(c)) best = Math.max(best, depth(c, keep));
  return best + 1;
}

/** The chain from `start` down its deepest branch within `keep`. */
function chainFrom(start: THREE.Bone, keep: (b: THREE.Bone) => boolean): THREE.Bone[] {
  const chain = [start];
  for (let last = start; ;) {
    const next = childBones(last)
      .filter(keep)
      .sort((a, b) => depth(b, keep) - depth(a, keep))[0];
    if (!next) return chain;
    chain.push(next);
    last = next;
  }
}

interface Limb {
  kind: LimbKind;
  side: 1 | -1;
  /** From the limb's root (clavicle/hip offset) to its end (hand/foot). */
  chain: THREE.Bone[];
}

/** Limbs found by bone name. */
function namedLimbs(bones: THREE.Bone[], frame: Frame): Limb[] {
  const info = new Map<THREE.Bone, { kind: LimbKind | 'other' | undefined; side?: 1 | -1 }>();
  for (const b of bones) {
    const words = boneWords(b.name);
    const side = sideOf(words);
    info.set(b, { kind: kindOf(words), ...(side ? { side } : {}) });
  }
  const limbs: Limb[] = [];
  for (const kind of ['leg', 'arm'] as const) {
    for (const b of bones) {
      const own = info.get(b);
      if (own?.kind !== kind) continue;
      const side = own.side ?? frame.sideOf(b);
      if (!side) continue;
      // A limb starts at its first bone of this kind and side.
      const parent = b.parent && isBone(b.parent) ? b.parent : undefined;
      const parentInfo = parent ? info.get(parent) : undefined;
      if (parent && parentInfo?.kind === kind && (parentInfo.side ?? frame.sideOf(parent)) === side)
        continue;
      const keep = (c: THREE.Bone) => {
        const k = info.get(c)?.kind;
        return k !== 'other' && (k === kind || k === undefined);
      };
      const chain = chainFrom(b, keep);
      // The name's side only pairs bones up: which way is out comes from where the limb is (a
      // racer's left is −X once turned to face −Z).
      const out = frame.sideOf(chain.at(-1) ?? b) ?? frame.sideOf(b);
      if (!out || limbs.some((l) => l.kind === kind && l.side === out)) continue;
      limbs.push({ kind, side: out, chain });
    }
  }
  return limbs;
}

/** Share of the skeleton's height a chain must span to count as a limb (fallback). */
const MIN_LIMB_SHARE = 0.2;
/** How much of a chain's span must point down (legs) or sideways (arms) (fallback). */
const LIMB_DIRECTION_SHARE = 0.6;

/** Limbs found by shape: chains of 3+ bones off a branching bone, hanging down or reaching out. */
function shapedLimbs(bones: THREE.Bone[], frame: Frame): Limb[] {
  const ys = bones.map((b) => frame.at(b).y);
  const height = Math.max(...ys) - Math.min(...ys);
  const keep = (c: THREE.Bone) => kindOf(boneWords(c.name)) !== 'other';
  const limbs: Limb[] = [];
  for (const branch of bones) {
    const children = childBones(branch);
    if (children.length < 2) continue;
    for (const start of children) {
      if (!keep(start)) continue;
      const chain = chainFrom(start, keep);
      const last = chain.at(-1);
      if (chain.length < 3 || !last) continue;
      const span = frame.at(last).sub(frame.at(start));
      const length = span.length();
      if (length < height * MIN_LIMB_SHARE) continue;
      const side = frame.sideOf(start) ?? (span.x > 0 ? 1 : span.x < 0 ? -1 : undefined);
      if (!side) continue;
      const kind: LimbKind | undefined =
        -span.y > length * LIMB_DIRECTION_SHARE
          ? 'leg'
          : Math.abs(span.x) > length * LIMB_DIRECTION_SHARE
            ? 'arm'
            : undefined;
      if (!kind || limbs.some((l) => l.kind === kind && l.side === side)) continue;
      limbs.push({ kind, side, chain });
    }
  }
  return limbs;
}

/** Bone positions and directions in the driver's frame (the model's fitted holder). */
class Frame {
  private readonly inverse: THREE.Matrix4;
  readonly rotation: THREE.Quaternion;
  /** Bones closer than this to the middle have no side. */
  private readonly middle: number;

  constructor(
    readonly holder: THREE.Object3D,
    root: THREE.Object3D,
  ) {
    holder.updateMatrixWorld(true);
    this.inverse = holder.matrixWorld.clone().invert();
    this.rotation = holder.getWorldQuaternion(new THREE.Quaternion());
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    this.middle = size.length() * MIDDLE_SHARE;
  }

  at(bone: THREE.Object3D): THREE.Vector3 {
    return bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(this.inverse);
  }

  sideOf(bone: THREE.Object3D): 1 | -1 | undefined {
    const x = this.at(bone).x;
    return Math.abs(x) <= this.middle ? undefined : x > 0 ? 1 : -1;
  }

  /** A direction in this frame, as a world direction. */
  toWorld(d: THREE.Vector3): THREE.Vector3 {
    return d.clone().applyQuaternion(this.rotation).normalize();
  }
}

/** Share of the model's size within which a bone counts as on the middle line. */
const MIDDLE_SHARE = 0.01;
/** A last segment shorter than this share of its chain is a tip (toes, fingers), not the end. */
const TIP_SHARE = 0.2;

const worldQuaternion = new THREE.Quaternion();
const parentQuaternion = new THREE.Quaternion();
const turn = new THREE.Quaternion();

/** Turns `bone` (in world space) so the direction to `towards` becomes `direction` (world). */
function aim(bone: THREE.Bone, towards: THREE.Bone, direction: THREE.Vector3): void {
  bone.updateWorldMatrix(true, true);
  const from = bone.getWorldPosition(new THREE.Vector3());
  const now = towards.getWorldPosition(new THREE.Vector3()).sub(from);
  if (now.lengthSq() === 0) return;
  turn.setFromUnitVectors(now.normalize(), direction);
  bone.getWorldQuaternion(worldQuaternion).premultiply(turn);
  if (bone.parent) bone.parent.getWorldQuaternion(parentQuaternion);
  else parentQuaternion.identity();
  bone.quaternion.copy(parentQuaternion.invert().multiply(worldQuaternion));
  bone.updateWorldMatrix(false, true);
}

/**
 * The limb's bendable joints: [upper, lower, end], counted back from its end (the hand or foot by
 * name; else the chain's last bone, or the one before a short tip like toes), helpers skipped. So
 * a clavicle or hip offset at the top is never bent.
 */
function joints(limb: Limb, frame: Frame): [THREE.Bone, THREE.Bone, THREE.Bone] | undefined {
  const chain = limb.chain.filter(
    (b, i) => i === 0 || !boneWords(b.name).some((w) => HELPER.has(w)),
  );
  const endWords = END_WORDS[limb.kind];
  let end = chain.findIndex((b) => boneWords(b.name).some((w) => endWords.has(w)));
  if (end < 0) {
    end = chain.length - 1;
    const points = chain.map((b) => frame.at(b));
    const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i] ?? p));
    const total = lengths.reduce((a, b) => a + b, 0);
    if (chain.length > 3 && (lengths[lengths.length - 1] ?? 0) < total * TIP_SHARE) end -= 1;
  }
  const [upper, lower, last] = [chain[end - 2], chain[end - 1], chain[end]];
  return upper && lower && last ? [upper, lower, last] : undefined;
}

/** Words naming a limb's end. */
const END_WORDS: Record<LimbKind, ReadonlySet<string>> = {
  arm: new Set(['hand', 'wrist']),
  leg: new Set(['foot', 'ankle']),
};

const direction = (aimed: readonly [number, number, number], side: 1 | -1) =>
  new THREE.Vector3(aimed[0] * side, aimed[1], aimed[2]).normalize();

/**
 * Bends the skeleton under `root` into the seated driving pose. `holder` is the fitted model's
 * holder (`fitModel`): its frame faces −Z, +Y up. `kinds` limits it to some limbs (Lakitu: arms).
 * Skinned meshes' bounds are refreshed for the new pose.
 */
export function seatRacer(
  root: THREE.Object3D,
  holder: THREE.Object3D,
  kinds: readonly LimbKind[] = ['leg', 'arm'],
): SeatReport {
  const bones = bonesOf(root);
  const frame = new Frame(holder, root);
  let limbs = namedLimbs(bones, frame);
  const byName = limbs.length > 0;
  if (!byName) limbs = shapedLimbs(bones, frame);
  const posed: PosedLimb[] = [];
  for (const limb of limbs) {
    if (!kinds.includes(limb.kind)) continue;
    const found = joints(limb, frame);
    if (!found) continue;
    const [upper, lower, end] = found;
    const pose = SEAT_POSE[limb.kind];
    aim(upper, lower, frame.toWorld(direction(pose.upper, limb.side)));
    aim(lower, end, frame.toWorld(direction(pose.lower, limb.side)));
    posed.push({ kind: limb.kind, side: limb.side, bones: [upper.name, lower.name] });
  }
  if (posed.length > 0) refreshBounds(root);
  return { limbs: posed, byName };
}

/** Skinned meshes keep bounds from their first pose: recomputed (culling and fitting read them). */
function refreshBounds(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    o.skeleton.update();
    o.computeBoundingBox();
    o.computeBoundingSphere();
  });
}
