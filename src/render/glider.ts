// A kart's glider in a race (MK-106): a simple wing on two struts above the driver, built from
// primitives (MK8 Mode's own glider models are `mk8/render/kartAssembly.ts`'s). It unfolds sideways
// over `tuning.mk8.glide.openSeconds` when the sim says the kart glides and folds away on landing.
import * as THREE from 'three';
import { tuning } from '../sim/tuning';

/** Wing span, chord and height of its centre above the kart's origin, m. */
const SPAN = 2.4;
const CHORD = 0.9;
const HEIGHT = 1.9;
/** How far behind the kart's centre the wing sits, m (karts face −Z). */
const BACK = 0.3;
/** The wing tilts nose-up this much, radians. */
const TILT = 0.12;

/**
 * How open a glider is after `seconds` more, from `openness` (0 folded … 1 open): it opens while the
 * kart glides and folds when it doesn't, at the same rate either way.
 */
export function nextOpenness(openness: number, gliding: boolean, seconds: number): number {
  const rate = seconds / tuning.mk8.glide.openSeconds;
  return gliding ? Math.min(1, openness + rate) : Math.max(0, openness - rate);
}

/** A glider: `object` goes on the kart's body; `setOpenness` unfolds it (hidden at 0). */
export class Glider {
  readonly object = new THREE.Group();
  private readonly wing: THREE.Group;
  openness = 0;

  constructor(colour: number) {
    this.object.name = 'glider';
    this.object.position.set(0, HEIGHT, BACK);
    this.object.rotation.x = TILT;
    this.wing = new THREE.Group();
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(SPAN, 0.06, CHORD),
      new THREE.MeshLambertMaterial({ color: colour }),
    );
    this.wing.add(canopy);
    const strutMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), strutMaterial);
      strut.position.set(side * 0.35, -0.45, 0);
      strut.rotation.z = side * 0.35;
      this.object.add(strut);
    }
    this.object.add(this.wing);
    this.setOpenness(0);
  }

  /** 0 = folded away (hidden), 1 = fully open; in between the wing unfolds sideways. */
  setOpenness(openness: number): void {
    this.openness = openness;
    this.object.visible = openness > 0;
    const s = Math.max(openness, 1e-3);
    this.wing.scale.set(s, 1, 0.4 + 0.6 * s);
  }
}
