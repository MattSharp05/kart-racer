// Course materials (MK-105 revisit, B1): the pack's course models mark almost every material as
// glTF `BLEND` (the conversion writes it whether or not the texture has any see-through texels), and
// three's GLTFLoader turns `BLEND` into `transparent` with no depth write. Nothing then hides what's
// behind the road or a wall: whichever batch draws last wins, and the batches (MK-133) all sit at
// the origin, so the order flips with the camera's angle. At load each transparent material is
// sorted by its texture's alpha: opaque (drawn solid), cut-out (solid, transparent texels dropped)
// or really see-through (left blended: water lines, glass, fire).
import * as THREE from 'three';

/** How a course material's texture uses its alpha. */
export type AlphaUse = 'opaque' | 'cutout' | 'blend';

/** Alpha at or below this is a clear texel, at or above `SOLID_ALPHA` a solid one (0–255). */
const CLEAR_ALPHA = 8;
const SOLID_ALPHA = 247;
/** Below this share of clear texels, and of in-between ones under `OPAQUE_PARTIAL`, it's opaque. */
const OPAQUE_CLEAR = 0.02;
const OPAQUE_PARTIAL = 0.25;
/** Under this share of in-between texels the alpha is a mask: cut out, not blended. */
const CUTOUT_PARTIAL = 0.1;
/** Texels below this alpha are dropped from a cut-out material (0–1). */
const CUTOUT_ALPHA = 0.5;
/** A material below this opacity stays see-through, whatever its texture. */
const OPAQUE_OPACITY = 0.99;
/** The texture is read at most this many texels a side (nearest, so masks stay sharp). */
const SAMPLE_SIZE = 128;

/** Sorts RGBA texels (4 bytes each) by how they use alpha. */
export function classifyAlpha(rgba: ArrayLike<number>): AlphaUse {
  const texels = Math.floor(rgba.length / 4);
  if (texels === 0) return 'opaque';
  let clear = 0;
  let partial = 0;
  for (let i = 3; i < texels * 4; i += 4) {
    const a = rgba[i] ?? 255;
    if (a <= CLEAR_ALPHA) clear += 1;
    else if (a < SOLID_ALPHA) partial += 1;
  }
  const clearShare = clear / texels;
  const partialShare = partial / texels;
  if (clearShare < OPAQUE_CLEAR && partialShare < OPAQUE_PARTIAL) return 'opaque';
  return partialShare < CUTOUT_PARTIAL ? 'cutout' : 'blend';
}

/** Reads an image's RGBA texels (downsampled); null where the page can't (no canvas). */
export type AlphaReader = (image: unknown) => ArrayLike<number> | null;

/** Draws the image into a small canvas and reads it back. */
export const readTextureAlpha: AlphaReader = (image) => {
  const source = image as { width?: number; height?: number } | null;
  if (!source?.width || !source.height) return null;
  const width = Math.min(SAMPLE_SIZE, source.width);
  const height = Math.min(SAMPLE_SIZE, source.height);
  let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  try {
    if (typeof OffscreenCanvas !== 'undefined')
      context = new OffscreenCanvas(width, height).getContext('2d');
    else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      context = canvas.getContext('2d');
    }
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(image as CanvasImageSource, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }
};

/** How many materials ended up which way. */
export type MaterialStats = Record<AlphaUse, number>;

/**
 * Makes `root`'s transparent materials solid unless their texture really is see-through (see the
 * file comment). A texture that can't be read is cut out: solid and depth-correct, its clear
 * texels still dropped. Each material is looked at once, however many meshes share it.
 */
export function fixCourseMaterials(
  root: THREE.Object3D,
  readAlpha: AlphaReader = readTextureAlpha,
): MaterialStats {
  const stats: MaterialStats = { opaque: 0, cutout: 0, blend: 0 };
  const seen = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (seen.has(material) || !material.transparent) continue;
      seen.add(material);
      const use = alphaUse(material, readAlpha);
      stats[use] += 1;
      if (use === 'blend') continue;
      material.transparent = false;
      material.depthWrite = true;
      if (use === 'cutout') material.alphaTest = CUTOUT_ALPHA;
      material.needsUpdate = true;
    }
  });
  return stats;
}

function alphaUse(material: THREE.Material, readAlpha: AlphaReader): AlphaUse {
  if (material.opacity < OPAQUE_OPACITY) return 'blend';
  const map = (material as THREE.Material & { map?: THREE.Texture | null }).map;
  if (!map) return 'opaque';
  const texels = readAlpha(map.image);
  return texels ? classifyAlpha(texels) : 'cutout';
}
