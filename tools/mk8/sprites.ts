// The UI sprites part of `pnpm mk8:build` (MK-95): crops each sprite in `spriteSpecs.ts` from
// its sheet in $MK8_RAW, keys out backgrounds, resizes and writes WebP to $MK8_OUT/ui/.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, parse } from 'node:path';
import sharp from 'sharp';
import { SPRITES } from '../../src/mk8/ui/sprites.ts';
import { entryFor, type ManifestEntry } from './manifest.ts';
import type { SheetSource } from './sources.ts';
import { SPRITE_SPECS, type SpriteSpec } from './spriteSpecs.ts';

export const SPRITE_GROUP = 'ui';
/** Max channel difference from the corner colour that still counts as background. */
export const KEY_TOLERANCE = 24;
const IMAGE_EXTENSIONS = ['.png', '.webp', '.jpg', '.jpeg', '.tga', '.bmp'];

/**
 * Makes the background transparent: a 4-neighbour flood fill from each corner over pixels
 * within `tolerance` of that corner's colour. `rgba` is modified in place.
 */
export function keyOutBackground(
  rgba: Uint8Array,
  width: number,
  height: number,
  tolerance = KEY_TOLERANCE,
): void {
  const seen = new Uint8Array(width * height);
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  for (const corner of corners) {
    if (seen[corner]) continue;
    const seed = rgba.slice(corner * 4, corner * 4 + 4);
    const close = (p: number) =>
      Math.abs((rgba[p * 4] ?? 0) - (seed[0] ?? 0)) <= tolerance &&
      Math.abs((rgba[p * 4 + 1] ?? 0) - (seed[1] ?? 0)) <= tolerance &&
      Math.abs((rgba[p * 4 + 2] ?? 0) - (seed[2] ?? 0)) <= tolerance &&
      Math.abs((rgba[p * 4 + 3] ?? 0) - (seed[3] ?? 0)) <= tolerance;
    const stack = [corner];
    seen[corner] = 1;
    while (stack.length) {
      const p = stack.pop() ?? 0;
      const x = p % width;
      for (const [q, ok] of [
        [p - 1, x > 0],
        [p + 1, x < width - 1],
        [p - width, p >= width],
        [p + width, p < width * (height - 1)],
      ] as const) {
        if (ok && !seen[q] && close(q)) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
  }
  for (let p = 0; p < seen.length; p++) if (seen[p]) rgba[p * 4 + 3] = 0;
}

/** The sheet image for a spec: the sheet file, or the named file in a folder sheet. */
export function sheetImage(
  rawRoot: string,
  sheet: SheetSource,
  spec: SpriteSpec,
): string | undefined {
  const path = join(rawRoot, sheet.raw);
  if (!sheet.raw.endsWith('/')) return existsSync(path) ? path : undefined;
  if (!existsSync(path) || !spec.file) return undefined;
  const match = readdirSync(path, { recursive: true, encoding: 'utf8' })
    .sort()
    .find(
      (f) => parse(f).name === spec.file && IMAGE_EXTENSIONS.includes(extname(f).toLowerCase()),
    );
  return match ? join(path, match) : undefined;
}

export async function renderSprite(
  image: string,
  spec: SpriteSpec,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  let img = sharp(image, { limitInputPixels: false }).ensureAlpha();
  if (spec.rect) img = img.extract(spec.rect);
  // Materialise each step so later steps see the cropped pixels, not the sheet.
  let { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const fromRaw = () =>
    sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  if (spec.trimBlack)
    ({ data, info } = await fromRaw()
      .trim({ background: '#000000', threshold: 16 })
      .raw()
      .toBuffer({ resolveWithObject: true }));
  if (spec.keyOut) keyOutBackground(data, info.width, info.height);
  if (spec.resize) {
    const [width, height] = spec.resize;
    ({ data, info } = await fromRaw()
      .resize({ width, height, fit: 'cover', kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true }));
  }
  const bytes = await fromRaw()
    .webp(
      spec.lossless ? { lossless: true, effort: 6 } : { quality: 88, alphaQuality: 100, effort: 6 },
    )
    .toBuffer();
  return { bytes: new Uint8Array(bytes), width: info.width, height: info.height };
}

export interface SpritesResult {
  entries: ManifestEntry[];
  /** Sprite ids whose sheet (or file in a folder sheet) isn't in $MK8_RAW. */
  missing: string[];
  /** Built sprites whose size differs from `src/mk8/ui/sprites.ts`. */
  mismatches: string[];
}

export async function buildSprites(
  sheets: SheetSource[],
  rawRoot: string,
  outRoot: string,
  specs: SpriteSpec[] = SPRITE_SPECS,
): Promise<SpritesResult> {
  const result: SpritesResult = { entries: [], missing: [], mismatches: [] };
  const byId = new Map(sheets.map((s) => [s.id, s]));
  for (const spec of specs) {
    const sheet = byId.get(spec.sheet);
    if (!sheet) throw new Error(`sprite ${spec.id}: unknown sheet ${spec.sheet}`);
    const sprite = SPRITES[spec.id];
    if (!sprite) throw new Error(`sprite ${spec.id}: not in src/mk8/ui/sprites.ts`);
    const image = sheetImage(rawRoot, sheet, spec);
    if (!image) {
      result.missing.push(spec.id);
      continue;
    }
    const { bytes, width, height } = await renderSprite(image, spec);
    if (width !== sprite.width || height !== sprite.height)
      result.mismatches.push(
        `${spec.id}: ${width}×${height}, expected ${sprite.width}×${sprite.height}`,
      );
    const file = join(outRoot, sprite.file);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    result.entries.push(entryFor(sprite.file, bytes, SPRITE_GROUP));
  }
  return result;
}
