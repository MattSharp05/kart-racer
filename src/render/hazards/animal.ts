import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AnimalSpecies, MoverHazard } from '../../sim/hazards/types';
import { DT } from '../../sim/tuning';

/**
 * How an animal looks (MK-61 QA round 2: animals crossing Canopy Rush's trail), sizes in m. The
 * model faces −Z like a kart; the body sits on four legs of `leg` m.
 */
interface AnimalLook {
  /** Body length, height and width. */
  body: readonly [number, number, number];
  leg: number;
  colour: number;
  /** Belly, saddle, snout-tip or stripe colour. */
  accent: number;
  /** Head size (a cube this big) and how far it juts forward and up from the body's front top. */
  head: number;
  headUp: number;
  /** Snout length (0: none). */
  snout: number;
  /** A pale band round the middle (a Malayan tapir), stripes (its calf), tusks (a boar), antlers. */
  saddle?: boolean;
  stripes?: boolean;
  tusks?: boolean;
  antlers?: boolean;
  /** A raised neck (a deer): the head sits this much higher. */
  neck?: number;
  /** Metres per full stride (both pairs of legs swing once). */
  stride: number;
}

const LOOKS: Record<AnimalSpecies, AnimalLook> = {
  boar: {
    body: [1.9, 0.85, 0.8],
    leg: 0.45,
    colour: 0x4f3a2a,
    accent: 0x8a6e5e,
    head: 0.6,
    headUp: -0.1,
    snout: 0.35,
    tusks: true,
    stride: 1.4,
  },
  tapir: {
    body: [2.3, 1.0, 0.95],
    leg: 0.6,
    colour: 0x26242a,
    accent: 0xd9d2c4,
    head: 0.62,
    headUp: 0,
    snout: 0.45,
    saddle: true,
    stride: 1.8,
  },
  tapirCalf: {
    body: [1.2, 0.55, 0.5],
    leg: 0.35,
    colour: 0x6b4a30,
    accent: 0xe8dcc0,
    head: 0.36,
    headUp: 0,
    snout: 0.22,
    stripes: true,
    stride: 1.1,
  },
  deer: {
    body: [1.7, 0.75, 0.6],
    leg: 0.95,
    colour: 0xb07a45,
    accent: 0xefe6d6,
    head: 0.42,
    headUp: 0.1,
    snout: 0.25,
    neck: 0.6,
    antlers: true,
    stride: 2.4,
  },
};

/** Tusk and antler colours; hoof-dark leg ends aren't worth a draw. */
const IVORY = 0xf1ead8;
const ANTLER = 0x6b5436;
/** How far the legs swing each way while walking, rad. */
const LEG_SWING = 0.55;

/** A box of `size` centred at `at`, every vertex painted `colour` (no uvs, non-indexed). */
function box(
  [w, h, l]: readonly [number, number, number],
  [x, y, z]: readonly [number, number, number],
  colour: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, l).translate(x, y, z).toNonIndexed();
  geometry.deleteAttribute('uv');
  const c = new THREE.Color(colour);
  const count = geometry.getAttribute('position').count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) colours.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}

/** The body, head and trimmings of one animal, in one vertex-coloured geometry. */
function bodyGeometry(look: AnimalLook): THREE.BufferGeometry {
  const [length, height, width] = look.body;
  const y = look.leg + height / 2;
  const front = -length / 2;
  const parts = [box([width, height, length], [0, y, 0], look.colour)];
  if (look.saddle)
    parts.push(
      box([width + 0.04, height + 0.04, length * 0.4], [0, y, length * 0.12], look.accent),
    );
  if (look.stripes) {
    for (const z of [-0.25, 0, 0.25]) {
      parts.push(
        box([width + 0.03, height * 0.6, 0.06], [0, y + height * 0.1, z * length], look.accent),
      );
    }
  }
  if (!look.saddle && !look.stripes) {
    // A paler belly.
    parts.push(box([width * 0.8, 0.08, length * 0.7], [0, look.leg + 0.02, 0], look.accent));
  }
  // The neck (a deer) and the head, out in front.
  const neck = look.neck ?? 0;
  if (neck)
    parts.push(
      box(
        [width * 0.45, neck + 0.2, width * 0.5],
        [0, y + height / 2 + neck / 2 - 0.1, front + 0.15],
        look.colour,
      ),
    );
  const headY = y + height / 2 + look.headUp + neck - look.head / 2;
  const headZ = front - look.head / 2 + (neck ? 0.2 : 0.05);
  parts.push(box([look.head * 0.9, look.head, look.head], [0, headY, headZ], look.colour));
  // Ears.
  for (const side of [-1, 1]) {
    parts.push(
      box(
        [0.1, look.head * 0.35, 0.06],
        [side * look.head * 0.3, headY + look.head * 0.6, headZ + look.head * 0.25],
        look.colour,
      ),
    );
  }
  if (look.snout) {
    parts.push(
      box(
        [look.head * 0.5, look.head * 0.45, look.snout],
        [0, headY - look.head * 0.15, headZ - look.head / 2 - look.snout / 2],
        look.accent,
      ),
    );
  }
  if (look.tusks) {
    for (const side of [-1, 1]) {
      parts.push(
        box(
          [0.06, 0.2, 0.06],
          [
            side * look.head * 0.3,
            headY - look.head * 0.1,
            headZ - look.head / 2 - look.snout * 0.6,
          ],
          IVORY,
        ),
      );
    }
  }
  if (look.antlers) {
    for (const side of [-1, 1]) {
      parts.push(
        box([0.06, 0.55, 0.06], [side * 0.15, headY + look.head / 2 + 0.27, headZ + 0.05], ANTLER),
        box([0.3, 0.06, 0.06], [side * 0.3, headY + look.head / 2 + 0.45, headZ + 0.05], ANTLER),
      );
    }
  }
  // A short tail.
  parts.push(
    box(
      [0.1, 0.1, 0.3],
      [0, y + height * 0.3, length / 2 + 0.12],
      look.stripes || look.antlers ? look.accent : look.colour,
    ),
  );
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('Animal: geometries do not merge');
  return merged;
}

/** Where each leg's hip is: front left, front right, back left, back right. */
function hips(look: AnimalLook): [number, number][] {
  const [length, , width] = look.body;
  const x = width / 2 - 0.12;
  const z = length / 2 - 0.2;
  return [
    [-x, -z],
    [x, -z],
    [-x, z],
    [x, z],
  ];
}

/**
 * A low-poly animal for a `mover` with `animal` set (MK-61 QA round 2): its body (one draw) and
 * its four legs (one instanced draw), which trot as it walks.
 */
export function createAnimal(def: MoverHazard, species: AnimalSpecies): THREE.Object3D {
  const look = LOOKS[species];
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    bodyGeometry(look),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  const legWidth = Math.max(0.12, look.body[2] * 0.2);
  const legs = new THREE.InstancedMesh(
    // Hung from its hip: the box's top at the origin.
    new THREE.BoxGeometry(legWidth, look.leg, legWidth).translate(0, -look.leg / 2, 0),
    new THREE.MeshLambertMaterial({ color: look.colour, flatShading: true }),
    4,
  );
  legs.name = 'legs';
  group.add(body, legs);
  group.userData.look = look;
  group.userData.speed = moverSpeed(def);
  posedLegs(group, 0);
  return group;
}

/** Speed along its path of an open-path mover, m/s. */
function moverSpeed(def: MoverHazard): number {
  let length = 0;
  for (let i = 1; i < def.path.length; i += 1) {
    const a = def.path[i - 1];
    const b = def.path[i];
    if (a && b) length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return length / (def.period * (def.activeFraction ?? 1));
}

const dummy = new THREE.Object3D();

/** Swings the legs for `ticks` (diagonal pairs together: a trot). */
function posedLegs(group: THREE.Object3D, ticks: number): void {
  const legs = group.getObjectByName('legs') as THREE.InstancedMesh | undefined;
  const look = group.userData.look as AnimalLook | undefined;
  if (!legs || !look) return;
  const walked = ticks * DT * (group.userData.speed as number);
  const swing = LEG_SWING * Math.sin((walked / look.stride) * Math.PI * 2);
  hips(look).forEach(([x, z], i) => {
    dummy.position.set(x, look.leg, z);
    // Front-left with back-right, front-right with back-left.
    dummy.rotation.set(i === 0 || i === 3 ? swing : -swing, 0, 0);
    dummy.updateMatrix();
    legs.setMatrixAt(i, dummy.matrix);
  });
  legs.instanceMatrix.needsUpdate = true;
}

/** Poses an animal made by `createAnimal` for this frame. */
export function updateAnimal(object: THREE.Object3D, ticks: number): void {
  posedLegs(object, ticks);
}
