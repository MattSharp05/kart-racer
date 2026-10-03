// Our five unique items' MK8-style HUD icons (MK-115): renders each item's SVG
// (`src/mk8/content/items/<id>/icon.ts`) to a 128 × 128 WebP with a transparent background in
// `public/mk8/ui/items/<id>.webp`, the size and framing of the pack's item sprites (`i_*`, MK-95).
// They are ours, so they ship in `public/`. Run after changing an icon: `node tools/mk8/ourItemIcons.ts`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import bubbleShield from '../../src/mk8/content/items/bubble-shield/icon.ts';
import hornetSwarm from '../../src/mk8/content/items/hornet-swarm/icon.ts';
import magnet from '../../src/mk8/content/items/magnet/icon.ts';
import oilSlick from '../../src/mk8/content/items/oil-slick/icon.ts';
import phase from '../../src/mk8/content/items/phase/icon.ts';

/** The icons' size, px (the pack's item sprites'). */
export const ICON_SIZE = 128;

/** Each icon's SVG body (64 × 64 viewBox), by item id. */
export const OUR_ICONS: Readonly<Record<string, string>> = {
  'oil-slick': oilSlick,
  'hornet-swarm': hornetSwarm,
  'bubble-shield': bubbleShield,
  magnet,
  phase,
};

export const ICON_DIR = resolve(import.meta.dirname, '../../public/mk8/ui/items');

/** `body` drawn into a transparent `ICON_SIZE` square, as lossless WebP. */
export function renderIcon(body: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${ICON_SIZE}" height="${ICON_SIZE}">${body}</svg>`;
  return sharp(Buffer.from(svg)).webp({ lossless: true }).toBuffer();
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  mkdirSync(ICON_DIR, { recursive: true });
  for (const [id, body] of Object.entries(OUR_ICONS)) {
    writeFileSync(join(ICON_DIR, `${id}.webp`), await renderIcon(body));
    console.log(`public/mk8/ui/items/${id}.webp`);
  }
}
