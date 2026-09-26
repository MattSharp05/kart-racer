import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hazardKinds } from '../../sim/hazards';
import { cyclePhase } from '../../sim/hazards/shapes';
import type { HazardPose, PeriodicHazard } from '../../sim/hazards/types';
import { DT, tuning } from '../../sim/tuning';

/** How a piston crusher looks (MK-62). Lengths in m. */
const PISTON = {
  /** The head's underside is this high when open, and this thick. */
  lift: 5.5,
  thickness: 1.6,
  /** The housing at the top of the frame: its underside's height, and its height. */
  housing: 8,
  housingHeight: 2.2,
  /** Frame posts either side of the road, and how far outside the footprint. */
  post: 0.9,
  postGap: 0.7,
  rodRadius: 0.75,
  /** The yellow and black band round the head's bottom edge. */
  band: 0.45,
  bandStripes: 10,
  /** The warning lamps flash this many times a second before it drops. */
  flashHz: 6,
  /** Steam puffs out from under the head for this long after it lands, s, this big at most. */
  steamSeconds: 0.7,
  steamSize: 2.6,
  steamPuffs: 8,
};

const COLOURS = {
  frame: 0x4a4038,
  brass: 0xc8962e,
  head: 0x5c5f63,
  yellow: 0xf2c230,
  black: 0x1c1c1c,
  rod: 0xb8b2a6,
  lampOff: 0x4a1410,
  lampOn: 0xff3322,
  steam: 0xf2ece4,
};

/** A box of `size` centred at `at`, every vertex painted `colour`. */
function paintedBox(
  [w, h, l]: readonly [number, number, number],
  [x, y, z]: readonly [number, number, number],
  colour: number,
): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(w, h, l).translate(x, y, z).toNonIndexed();
  box.deleteAttribute('uv');
  const c = new THREE.Color(colour);
  const count = box.getAttribute('position').count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) colours.set([c.r, c.g, c.b], i * 3);
  box.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return box;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error('Piston: geometries do not merge');
  return geometry;
}

const vertexColoured = () =>
  new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** Scratch object reused every frame (no garbage per frame). */
const dummy = new THREE.Object3D();

/**
 * A steam piston (MK-62), in the crusher's own frame (X across, Z along): a frame over the road
 * with the housing on top, the head hanging from a rod, its shadow on the road, warning lamps on
 * the housing and steam puffing out when it lands. Six draws.
 */
export function createPiston(def: PeriodicHazard): THREE.Object3D {
  const group = new THREE.Group();
  const w = def.halfWidth;
  const l = def.halfLength;
  const postX = w + PISTON.postGap + PISTON.post / 2;
  const top = PISTON.housing + PISTON.housingHeight;

  const frame = new THREE.Mesh(
    merged([
      ...[-1, 1].map((side) =>
        paintedBox(
          [PISTON.post, top, PISTON.post * 1.6],
          [side * postX, top / 2, 0],
          COLOURS.frame,
        ),
      ),
      paintedBox(
        [2 * postX + PISTON.post, PISTON.housingHeight, 2 * l + 1],
        [0, PISTON.housing + PISTON.housingHeight / 2, 0],
        COLOURS.brass,
      ),
      paintedBox(
        [2 * postX + PISTON.post + 0.3, 0.3, 2 * l + 1.3],
        [0, PISTON.housing + 0.15, 0],
        COLOURS.frame,
      ),
    ]),
    vertexColoured(),
  );

  // The head, with a yellow and black band round its bottom edge (origin at its underside).
  const stripe = (2 * w) / PISTON.bandStripes;
  const head = new THREE.Mesh(
    merged([
      paintedBox(
        [2 * w, PISTON.thickness - PISTON.band, 2 * l],
        [0, PISTON.band + (PISTON.thickness - PISTON.band) / 2, 0],
        COLOURS.head,
      ),
      ...Array.from({ length: PISTON.bandStripes }, (_, i) =>
        paintedBox(
          [stripe, PISTON.band, 2 * l + 0.04],
          [-w + stripe * (i + 0.5), PISTON.band / 2, 0],
          i % 2 ? COLOURS.black : COLOURS.yellow,
        ),
      ),
    ]),
    vertexColoured(),
  );
  head.name = 'head';

  // The rod: a unit-high cylinder, stretched each frame from the head to the housing.
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(PISTON.rodRadius, PISTON.rodRadius, 1, 10).translate(0, 0.5, 0),
    new THREE.MeshLambertMaterial({ color: COLOURS.rod }),
  );
  rod.name = 'rod';

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * w, 2 * l).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  shadow.position.y = 0.06;
  shadow.name = 'shadow';

  // Warning lamps on both faces of the housing (the approach side and the far side), both ends.
  const lamps = new THREE.Mesh(
    merged(
      [-1, 1].flatMap((end) =>
        [-1, 1].map((side) =>
          new THREE.IcosahedronGeometry(0.55, 1)
            .translate(side * (w - 1), PISTON.housing + PISTON.housingHeight / 2, end * (l + 0.55))
            .deleteAttribute('uv'),
        ),
      ),
    ),
    new THREE.MeshBasicMaterial({ color: COLOURS.lampOff, toneMapped: false }),
  );
  lamps.name = 'lamps';

  const steam = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({
      color: COLOURS.steam,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
    PISTON.steamPuffs,
  );
  steam.name = 'steam';
  steam.frustumCulled = false;

  group.add(frame, head, rod, shadow, lamps, steam);
  return group;
}

/** Poses a piston at `ticks`: the head and rod, the shadow, the lamps and the steam. */
export function updatePiston(
  object: THREE.Object3D,
  def: PeriodicHazard,
  pose: HazardPose,
  ticks: number,
): void {
  object.position.set(pose.x, pose.y, pose.z);
  object.rotation.y = def.heading;
  const headY = PISTON.lift * (1 - pose.amount);
  const head = object.getObjectByName('head');
  if (head) head.position.y = headY;
  const rod = object.getObjectByName('rod');
  if (rod) {
    const from = headY + PISTON.thickness;
    rod.position.y = from;
    rod.scale.y = Math.max(0.01, PISTON.housing - from);
  }

  const secondsUntil = hazardKinds.get('periodic').secondsUntilOn?.(def, ticks) ?? Infinity;
  const warning = pose.amount === 0 && secondsUntil <= tuning.hazards.crusherWarningSeconds;
  const shadow = object.getObjectByName('shadow') as THREE.Mesh | undefined;
  if (shadow) {
    // Darker as the head comes down: a readable spot to stay out of.
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.47 * pose.amount;
  }
  const lamps = object.getObjectByName('lamps') as THREE.Mesh | undefined;
  if (lamps) {
    const flashOn = Math.floor(ticks * DT * PISTON.flashHz * 2) % 2 === 0;
    const lit = pose.amount > 0 || (warning && flashOn);
    (lamps.material as THREE.MeshBasicMaterial).color.setHex(
      lit ? COLOURS.lampOn : COLOURS.lampOff,
    );
  }

  // Steam: puffs out from under the head as it lands, growing and fading.
  const steam = object.getObjectByName('steam') as THREE.InstancedMesh | undefined;
  if (!steam) return;
  const phase = cyclePhase(ticks, def.period, def.phase);
  const landed = 1 - def.closedFraction - tuning.hazards.crusherMoveFraction;
  const since = (phase - landed) * def.period;
  const f = since >= 0 && since < PISTON.steamSeconds ? since / PISTON.steamSeconds : -1;
  steam.visible = f >= 0;
  if (!steam.visible) return;
  for (let i = 0; i < PISTON.steamPuffs; i += 1) {
    const side = i % 2 ? 1 : -1;
    const along = (Math.floor(i / 2) / (PISTON.steamPuffs / 2 - 1) - 0.5) * 2 * def.halfLength;
    const size = PISTON.steamSize * (0.35 + 0.65 * f) * (1 - 0.5 * f);
    dummy.position.set(side * (def.halfWidth + 0.6 + 2.2 * f), 0.6 + 1.6 * f, along);
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    steam.setMatrixAt(i, dummy.matrix);
  }
  steam.instanceMatrix.needsUpdate = true;
}
