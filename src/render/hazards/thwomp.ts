import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hazardKinds } from '../../sim/hazards';
import { cyclePhase } from '../../sim/hazards/shapes';
import type { HazardPose, PeriodicHazard } from '../../sim/hazards/types';
import { tuning } from '../../sim/tuning';

/** How a Thwomp looks (MK-124). Lengths in m, as fractions of its footprint where noted. */
const THWOMP = {
  /** The block's height, as a share of its footprint's width. */
  height: 1.15,
  /** Spikes: per face across, how long, as a share of the block's half width; their radius. */
  spikes: 3,
  spikeLength: 0.42,
  spikeRadius: 0.32,
  /** Dust puffs out from under it for this long after it lands, s, this big at most. */
  dustSeconds: 0.6,
  dustSize: 1.8,
  dustPuffs: 10,
};

const COLOURS = {
  stone: 0x7d8796,
  stoneDark: 0x5b6472,
  spike: 0xa7afba,
  eye: 0xf4f1e8,
  pupil: 0x1a1a22,
  brow: 0x323844,
  teeth: 0xe9e4d6,
  mouth: 0x23262e,
  dust: 0xd8c9a8,
};

/** Paints every vertex of `geometry` `colour` (non-indexed, no uv: merges with the others). */
function painted(geometry: THREE.BufferGeometry, colour: number): THREE.BufferGeometry {
  const g = geometry.toNonIndexed();
  g.deleteAttribute('uv');
  const c = new THREE.Color(colour);
  const count = g.getAttribute('position').count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) colours.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

const box = (w: number, h: number, l: number, x: number, y: number, z: number, colour: number) =>
  painted(new THREE.BoxGeometry(w, h, l).translate(x, y, z), colour);

/** A spike on the block pointing along `dir` from `at`. */
function spike(at: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number) {
  const cone = new THREE.ConeGeometry(radius, length, 4).translate(0, length / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  cone.applyQuaternion(q).translate(at.x, at.y, at.z);
  return painted(cone, COLOURS.spike);
}

/**
 * A Thwomp (MK-124), in the hazard's own frame (X across, Z along; it faces −Z, back at the karts
 * coming): a spiked stone block with a scowling face, hovering `thwomp.lift` m up and slamming
 * onto its footprint, its shadow darkening as it comes and dust puffing out as it lands. Our own
 * low-poly look, not Nintendo's model. Three draws.
 */
export function createThwomp(def: PeriodicHazard): THREE.Object3D {
  const group = new THREE.Group();
  const w = def.halfWidth;
  const l = def.halfLength;
  const h = 2 * w * THWOMP.height;
  const spikeLength = w * THWOMP.spikeLength;
  const parts: THREE.BufferGeometry[] = [
    box(2 * w, h, 2 * l, 0, h / 2, 0, COLOURS.stone),
    // A darker band round the bottom and a cap on top: carved stone.
    box(2 * w + 0.06, h * 0.12, 2 * l + 0.06, 0, h * 0.06, 0, COLOURS.stoneDark),
    box(2 * w * 0.8, 0.12, 2 * l * 0.8, 0, h + 0.06, 0, COLOURS.stoneDark),
  ];
  // The face, on the −Z side: eyes, angry brows, a row of teeth.
  const face = -l - 0.02;
  for (const side of [-1, 1]) {
    const x = side * w * 0.42;
    parts.push(
      box(w * 0.42, h * 0.2, 0.08, x, h * 0.62, face, COLOURS.eye),
      box(w * 0.16, h * 0.12, 0.1, x - side * w * 0.06, h * 0.6, face - 0.02, COLOURS.pupil),
      painted(
        new THREE.BoxGeometry(w * 0.55, h * 0.07, 0.12)
          .rotateZ(-side * 0.35)
          .translate(x, h * 0.78, face - 0.03),
        COLOURS.brow,
      ),
    );
  }
  parts.push(box(w * 1.1, h * 0.16, 0.08, 0, h * 0.3, face, COLOURS.mouth));
  const teeth = 6;
  for (let i = 0; i < teeth; i += 1) {
    const x = -w * 0.5 + (w * (i + 0.5)) / teeth;
    parts.push(box(w * 0.13, h * 0.13, 0.1, x, h * 0.32, face - 0.02, COLOURS.teeth));
  }
  // Spikes on the sides, back and top (not the face).
  const n = THWOMP.spikes;
  const across = (i: number, half: number) => -half + ((i + 0.5) * 2 * half) / n;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      const y = h * (0.3 + 0.4 * j);
      parts.push(
        spike(
          new THREE.Vector3(-w, y, across(i, l)),
          new THREE.Vector3(-1, 0, 0),
          spikeLength,
          THWOMP.spikeRadius,
        ),
        spike(
          new THREE.Vector3(w, y, across(i, l)),
          new THREE.Vector3(1, 0, 0),
          spikeLength,
          THWOMP.spikeRadius,
        ),
        spike(
          new THREE.Vector3(across(i, w), y, l),
          new THREE.Vector3(0, 0, 1),
          spikeLength,
          THWOMP.spikeRadius,
        ),
      );
    }
    for (let j = 0; j < n; j += 1) {
      parts.push(
        spike(
          new THREE.Vector3(across(i, w), h, across(j, l)),
          new THREE.Vector3(0, 1, 0),
          spikeLength,
          THWOMP.spikeRadius,
        ),
      );
    }
  }
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error('Thwomp: geometries do not merge');
  const body = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  body.name = 'body';

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

  const dust = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({
      color: COLOURS.dust,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
    THWOMP.dustPuffs,
  );
  dust.name = 'dust';
  dust.frustumCulled = false;

  group.add(body, shadow, dust);
  return group;
}

/** Scratch object reused every frame (no garbage per frame). */
const dummy = new THREE.Object3D();

/** Poses a Thwomp at `ticks`: the block's height, its shadow and the landing dust. */
export function updateThwomp(
  object: THREE.Object3D,
  def: PeriodicHazard,
  pose: HazardPose,
  ticks: number,
): void {
  object.position.set(pose.x, pose.y, pose.z);
  object.rotation.y = def.heading;
  const lift = def.thwomp?.lift ?? 0;
  const body = object.getObjectByName('body');
  if (body) {
    // A shiver just before it drops (its warning), as the piston's lamps flash.
    const until = hazardKinds.get('periodic').secondsUntilOn?.(def, ticks) ?? Infinity;
    const shiver = pose.amount === 0 && until <= tuning.hazards.crusherWarningSeconds;
    body.position.x = shiver ? Math.sin(ticks * 2.3) * 0.08 : 0;
    body.position.y = lift * (1 - pose.amount);
  }
  const shadow = object.getObjectByName('shadow') as THREE.Mesh | undefined;
  if (shadow) (shadow.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.5 * pose.amount;

  const dust = object.getObjectByName('dust') as THREE.InstancedMesh | undefined;
  if (!dust) return;
  const phase = cyclePhase(ticks, def.period, def.phase);
  const landed = 1 - def.closedFraction - tuning.hazards.crusherMoveFraction;
  const since = (phase - landed) * def.period;
  const f = since >= 0 && since < THWOMP.dustSeconds ? since / THWOMP.dustSeconds : -1;
  dust.visible = f >= 0;
  if (!dust.visible) return;
  for (let i = 0; i < THWOMP.dustPuffs; i += 1) {
    const a = (i / THWOMP.dustPuffs) * Math.PI * 2;
    const r = Math.max(def.halfWidth, def.halfLength) + 0.4 + 2 * f;
    dummy.position.set(Math.cos(a) * r, 0.4 + 0.8 * f, Math.sin(a) * r);
    dummy.scale.setScalar(THWOMP.dustSize * (0.35 + 0.65 * f) * (1 - 0.5 * f));
    dummy.updateMatrix();
    dust.setMatrixAt(i, dummy.matrix);
  }
  dust.instanceMatrix.needsUpdate = true;
}
