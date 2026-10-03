// MK8-style looks for our five unique items (MK-115): glossy, saturated materials and the sparkle
// of MK8's star-shine, built from simple shapes (they are ours: the pack has no models for them).
import * as THREE from 'three';
import type { ItemLook } from '../../../../render/itemSkins';

/** How an item of ours looks in MK8 races: its skin look, the model held over the driver. */
export interface Mk8OurLook extends ItemLook {
  /** Our item's id. */
  id: string;
  /** Held over the driver while it's in the slot: unit size, centred, its front towards −Z. */
  held(): THREE.Object3D;
}

/** A glossy, clear-coated material in `color` (MK8's candy-like item finish). */
export function gloss(color: string, options: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    ...options,
  });
}

/** An unlit see-through material that adds its light (glows, shines and haze). */
export function glow(color: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** A four-pointed star outline, `size` m tip to tip, `waist` its thickness at the centre. */
function starShape(size: number, waist: number): THREE.Shape {
  const r = size / 2;
  const w = waist / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, r);
  shape.quadraticCurveTo(w * 0.4, w * 0.4, r, 0);
  shape.quadraticCurveTo(w * 0.4, -w * 0.4, 0, -r);
  shape.quadraticCurveTo(-w * 0.4, -w * 0.4, -r, 0);
  shape.quadraticCurveTo(-w * 0.4, w * 0.4, 0, r);
  return shape;
}

/**
 * MK8's star-shine: a four-pointed sparkle, three crossed planes so it reads from any side,
 * `size` m across.
 */
export function sparkle(size: number, color = '#ffffff', opacity = 0.95): THREE.Object3D {
  const group = new THREE.Group();
  const geometry = new THREE.ShapeGeometry(starShape(size, size * 0.3));
  const material = glow(color, opacity);
  for (const [x, y] of [
    [0, 0],
    [0, Math.PI / 2],
    [Math.PI / 2, 0],
  ] as const) {
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.set(x, y, 0);
    group.add(plane);
  }
  return group;
}

/** Wraps `model` so it is centred on the origin with its largest side 1 m. */
export function unitSize(model: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  model.position.sub(centre);
  const inner = new THREE.Group();
  inner.add(model);
  inner.scale.setScalar(1 / (Math.max(size.x, size.y, size.z) || 1));
  const outer = new THREE.Group();
  outer.add(inner);
  return outer;
}
