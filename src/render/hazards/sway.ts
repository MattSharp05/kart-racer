import * as THREE from 'three';
import { swaySpan } from '../../sim/hazards/sway';
import type { HazardPose, SwayHazard } from '../../sim/hazards/types';
import type { HazardView } from './views';

/** How a swaying deck looks (MK-61: a rope bridge). Lengths in m, angles in rad. */
const DECK = {
  /** Plank spacing along the deck, and each plank's length along it and thickness. */
  plankStep: 1,
  plankLength: 0.85,
  plankThickness: 0.25,
  /** Posts along both edges every this far; their height, and the hand-rope's height. */
  postStep: 5,
  postHeight: 1.4,
  postSize: 0.28,
  ropeHeight: 1.15,
  ropeSize: 0.09,
  /** The anchor posts at both ends: this much taller and thicker. */
  anchorScale: 2.2,
  /** Mid-span at full lean: the deck rolls this far, and slides this far sideways. */
  roll: 0.05,
  shift: 0.6,
  /** Small lift so the planks sit on the road's level without z-fighting its ends. */
  lift: 0.03,
};

const COLOURS = { plankA: 0xa47449, plankB: 0x8c5f38, post: 0x5e3f22, rope: 0xd9c38f };

/** One instanced mesh of boxes per deck: planks, then posts, then rope spans. */
interface DeckParts {
  boxes: THREE.InstancedMesh;
  planks: number;
  posts: number;
  ropes: number;
  length: number;
}

/** Deck length (XZ) of a swaying deck. */
function deckLength(def: SwayHazard): number {
  return Math.hypot(def.to.x - def.from.x, def.to.z - def.from.z);
}

/** Where the deck's cross-section is `along` m from its start, at this lean: roll and shift. */
function section(def: SwayHazard, pose: HazardPose, along: number, length: number) {
  const lean = pose.amount * swaySpan(along / length);
  // Leaning right: the right edge dips (negative roll about the deck's axis) and slides right.
  return { roll: -DECK.roll * lean, shift: DECK.shift * lean };
}

/** A point `across` m right of the centreline and `up` m above the deck, on a rolled section. */
function onSection(s: { roll: number; shift: number }, across: number, up: number) {
  const cos = Math.cos(s.roll);
  const sin = Math.sin(s.roll);
  return { x: across * cos - up * sin + s.shift, y: across * sin + up * cos };
}

/**
 * A rope bridge swaying with the sim's pose (MK-61): planks, posts along both edges with a hand
 * rope between them, and tall anchor posts at both ends, all boxes of one instanced draw. It rolls
 * and slides the way the deck pushes, most mid-span, nothing at the anchors.
 */
export const swayView: HazardView<SwayHazard> = {
  id: 'sway',
  create(def) {
    const length = deckLength(def);
    const planks = Math.max(1, Math.round(length / DECK.plankStep));
    const postRows = Math.max(1, Math.round(length / DECK.postStep));
    const posts = (postRows + 1) * 2;
    const ropes = postRows * 2;
    // Every part is a box: one unit box, scaled per instance, is one draw for the whole bridge.
    const boxes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      planks + posts + ropes,
    );
    const colour = new THREE.Color();
    for (let i = 0; i < boxes.count; i += 1) {
      const hex =
        i < planks
          ? i % 3 === 1
            ? COLOURS.plankB
            : COLOURS.plankA
          : i < planks + posts
            ? COLOURS.post
            : COLOURS.rope;
      boxes.setColorAt(i, colour.setHex(hex));
    }
    boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The instances move every frame: bound the whole deck once, so it's culled off screen.
    boxes.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, -length / 2),
      length / 2 + def.halfWidth + DECK.postHeight * DECK.anchorScale,
    );
    const group = new THREE.Group();
    group.add(boxes);
    group.position.set(def.from.x, def.from.y, def.from.z);
    group.rotation.y = Math.atan2(-(def.to.x - def.from.x), -(def.to.z - def.from.z));
    group.userData.parts = { boxes, planks, posts, ropes, length } satisfies DeckParts;
    return group;
  },
  update(object, def, pose) {
    const { boxes, planks, posts, length } = object.userData.parts as DeckParts;
    const dummy = new THREE.Object3D();
    const place = (index: number) => {
      dummy.updateMatrix();
      boxes.setMatrixAt(index, dummy.matrix);
    };
    // The deck runs along local −Z (the group faces from → to), its right is +X.
    for (let i = 0; i < planks; i += 1) {
      const along = (i + 0.5) * (length / planks);
      const s = section(def, pose, along, length);
      const centre = onSection(s, 0, DECK.lift - DECK.plankThickness / 2);
      dummy.position.set(centre.x, centre.y, -along);
      dummy.rotation.set(0, 0, s.roll);
      dummy.scale.set(def.halfWidth * 2, DECK.plankThickness, DECK.plankLength);
      place(i);
    }
    const rows = posts / 2;
    const tops: THREE.Vector3[][] = [[], []];
    for (let row = 0; row < rows; row += 1) {
      const along = (row / (rows - 1)) * length;
      const s = section(def, pose, along, length);
      const scale = row === 0 || row === rows - 1 ? DECK.anchorScale : 1;
      for (const [k, side] of [-1, 1].entries()) {
        const height = DECK.postHeight * scale;
        const middle = onSection(s, side * def.halfWidth, DECK.lift + height / 2);
        dummy.position.set(middle.x, middle.y, -along);
        dummy.rotation.set(0, 0, s.roll);
        dummy.scale.set(DECK.postSize * scale, height, DECK.postSize * scale);
        place(planks + row * 2 + k);
        const top = onSection(s, side * def.halfWidth, DECK.lift + DECK.ropeHeight);
        tops[k]?.push(new THREE.Vector3(top.x, top.y, -along));
      }
    }
    for (const [k, side] of tops.entries()) {
      for (let i = 0; i + 1 < side.length; i += 1) {
        const a = side[i];
        const b = side[i + 1];
        if (!a || !b) continue;
        // A rope span: centred between two post tops, stretched along the line between them.
        dummy.position.copy(a).add(b).multiplyScalar(0.5);
        dummy.rotation.set(0, 0, 0);
        dummy.lookAt(b);
        dummy.scale.set(DECK.ropeSize, DECK.ropeSize, a.distanceTo(b));
        place(planks + posts + k * (rows - 1) + i);
      }
    }
    boxes.instanceMatrix.needsUpdate = true;
    return undefined;
  },
};
