import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { OURS } from '../../src/mk8/content/items/odds';
import { ICON_DIR, ICON_SIZE, OUR_ICONS, renderIcon } from './ourItemIcons';

/** Largest gap allowed between the icon's drawing and each edge, px (MK8's icons nearly fill it). */
const MAX_MARGIN = 10;
/** How far its drawing's centre may sit off the middle, px. */
const MAX_OFF_CENTRE = 6;

/** The icon's RGBA pixels and the box round every pixel that isn't (nearly) see-through. */
async function pixels(file: Buffer) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width;
  let right = -1;
  let top = info.height;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3]! < 16) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { data, info, box: { left, right, top, bottom } };
}

describe('our items’ MK8-style icons (MK-115)', () => {
  it('has an icon for each of our five items', () => {
    expect(Object.keys(OUR_ICONS).sort()).toEqual(Object.keys(OURS).sort());
  });

  for (const id of Object.keys(OUR_ICONS)) {
    describe(id, () => {
      const file = () => readFileSync(join(ICON_DIR, `${id}.webp`));

      it('is a 128 px WebP with a transparent background', async () => {
        const meta = await sharp(file()).metadata();
        expect(meta).toMatchObject({ format: 'webp', width: ICON_SIZE, height: ICON_SIZE });
        expect(meta.hasAlpha).toBe(true);
        const { data, info } = await pixels(file());
        for (const [x, y] of [
          [0, 0],
          [info.width - 1, 0],
          [0, info.height - 1],
          [info.width - 1, info.height - 1],
        ] as const) {
          expect(data[(y * info.width + x) * 4 + 3], `corner ${x},${y}`).toBe(0);
        }
      });

      it('is framed like MK8’s item icons: its longer side filling the square, centred', async () => {
        const { box } = await pixels(file());
        const margins = {
          across: [box.left, ICON_SIZE - 1 - box.right],
          down: [box.top, ICON_SIZE - 1 - box.bottom],
        };
        const longer = box.right - box.left >= box.bottom - box.top ? margins.across : margins.down;
        for (const margin of longer)
          expect(margin, JSON.stringify(box)).toBeLessThanOrEqual(MAX_MARGIN);
        for (const [a, b] of Object.values(margins)) {
          expect(Math.abs(a! - b!) / 2, JSON.stringify(box)).toBeLessThan(MAX_OFF_CENTRE);
        }
      });

      it('is the current SVG (re-run `node tools/mk8/ourItemIcons.ts` after changing it)', async () => {
        const fresh = await pixels(await renderIcon(OUR_ICONS[id]!));
        const shipped = await pixels(file());
        expect(Buffer.compare(fresh.data, shipped.data)).toBe(0);
      });
    });
  }
});
