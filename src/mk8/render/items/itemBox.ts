// MK8's item box as a 3D box (MK-105 revisit, B3): the pack's model is additive glass spun flat
// about its up axis, and from a kart it read as a flat glowing square. This one is drawn in code:
// see-through rainbow faces shaded by which way they face, solid white edges, tilted on two axes
// like MK8's so three faces always show. One mesh (one draw); the "?" inside is the skin's.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The box's faces: how see-through, and how much light each way they face catches (0–1). */
const FACE_ALPHA = 0.42;
const SHADE = { top: 1, side: 0.82, bottom: 0.6 };
/** The edges: bar thickness (the box is 1 m) and how solid. */
const EDGE = 0.07;
const EDGE_ALPHA = 0.95;
/** MK8 tilts its boxes on two axes, radians. */
export const ITEM_BOX_TILT = { x: 0.5, z: 0.35 };
/** Rainbow across the box: hue = this × (x + y + z), plus a base hue. */
const HUE_SPREAD = 0.28;
const HUE_BASE = 0.55;
const SATURATION = 0.75;
const LIGHTNESS = 0.62;

/** A 1 m item box, centred on the origin (scale it to size; spin it about its parent's Y). */
export function itemBoxModel(): THREE.Object3D {
  const faces = colourFaces(new THREE.BoxGeometry(1, 1, 1).toNonIndexed());
  const edges = colourEdges(edgeBars());
  const geometry = mergeGeometries([faces, edges]);
  faces.dispose();
  edges.dispose();
  const mesh = new THREE.Mesh(
    geometry ?? new THREE.BoxGeometry(1, 1, 1),
    // Unlit: the faces carry their shading, so it reads as a box from any angle and in any light.
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = 'mk8-item-box';
  mesh.rotation.set(ITEM_BOX_TILT.x, 0, ITEM_BOX_TILT.z);
  const box = new THREE.Group();
  box.add(mesh);
  return box;
}

/** RGBA per vertex: a rainbow by position, darker the further the face turns from the top. */
function colourFaces(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const colours = new Float32Array(position.count * 4);
  const colour = new THREE.Color();
  for (let v = 0; v < position.count; v += 1) {
    const hue = HUE_BASE + HUE_SPREAD * (position.getX(v) + position.getY(v) + position.getZ(v));
    colour.setHSL(((hue % 1) + 1) % 1, SATURATION, LIGHTNESS);
    const ny = normal.getY(v);
    colour.multiplyScalar(ny > 0.5 ? SHADE.top : ny < -0.5 ? SHADE.bottom : SHADE.side);
    colours.set([colour.r, colour.g, colour.b, FACE_ALPHA], v * 4);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4));
  geometry.deleteAttribute('uv');
  return geometry;
}

/** The 12 edges as thin bars, one geometry. */
function edgeBars(): THREE.BufferGeometry {
  const bars: THREE.BufferGeometry[] = [];
  const half = 0.5;
  for (const axis of [0, 1, 2] as const) {
    for (const a of [-half, half]) {
      for (const b of [-half, half]) {
        const size: [number, number, number] = [EDGE, EDGE, EDGE];
        size[axis] = 1 + EDGE;
        const bar = new THREE.BoxGeometry(...size).toNonIndexed();
        const at: [number, number, number] = [0, 0, 0];
        at[(axis + 1) % 3] = a;
        at[(axis + 2) % 3] = b;
        bar.translate(...at);
        bars.push(bar);
      }
    }
  }
  const merged = mergeGeometries(bars) ?? new THREE.BufferGeometry();
  for (const bar of bars) bar.dispose();
  return merged;
}

function colourEdges(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const colours = new Float32Array(count * 4);
  for (let v = 0; v < count; v += 1) colours.set([1, 1, 1, EDGE_ALPHA], v * 4);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4));
  geometry.deleteAttribute('uv');
  return geometry;
}
