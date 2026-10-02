import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPRITES } from '../../src/mk8/ui/sprites.ts';
import { readManifest, sha256 } from './manifest.ts';
import { outDir } from './paths.ts';
import { loadSources } from './sources.ts';
import { SPRITE_SPECS } from './spriteSpecs.ts';
import { buildSprites, keyOutBackground, SPRITE_GROUP } from './sprites.ts';
import { BACKGROUND, INK, tempDir, writeFakeSheets } from './testUtils.ts';

async function alphaAt(bytes: Uint8Array, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3]!;
}

const dirs: string[] = [];
let raw = '';
beforeAll(async () => {
  raw = tempDir('sheets');
  dirs.push(raw);
  await writeFakeSheets(raw);
}, 120_000);
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('keyOutBackground', () => {
  it('clears the background connected to the corners and keeps enclosed pixels', () => {
    const w = 9;
    const rgba = new Uint8Array(w * w * 4);
    for (let p = 0; p < w * w; p++) rgba.set(BACKGROUND, p * 4);
    // A ring of ink with a background-coloured hole in the middle.
    for (let y = 2; y <= 6; y++)
      for (let x = 2; x <= 6; x++)
        if (x === 2 || x === 6 || y === 2 || y === 6) rgba.set(INK, (y * w + x) * 4);
    keyOutBackground(rgba, w, w);
    const alpha = (x: number, y: number) => rgba[(y * w + x) * 4 + 3];
    expect([alpha(0, 0), alpha(8, 0), alpha(0, 8), alpha(8, 8), alpha(4, 0)]).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(alpha(2, 2)).toBe(255);
    expect(alpha(4, 4)).toBe(255);
  });
});

describe('mk8 ui sprites from generated sheets', () => {
  it('builds every sprite at its listed size, transparent where listed, deterministically', async () => {
    const { sheets } = loadSources();
    const a = tempDir('ui-a');
    const b = tempDir('ui-b');
    dirs.push(a, b);
    const first = await buildSprites(sheets, raw, a);
    const second = await buildSprites(sheets, raw, b);
    expect(first.missing).toEqual([]);
    expect(first.mismatches).toEqual([]);
    expect(first.entries.map((e) => e.path).sort()).toEqual(
      Object.values(SPRITES)
        .map((s) => s.file)
        .sort(),
    );
    expect(first.entries.every((e) => e.group === SPRITE_GROUP)).toBe(true);
    expect(second.entries.map((e) => e.sha256)).toEqual(first.entries.map((e) => e.sha256));
    for (const [id, sprite] of Object.entries(SPRITES)) {
      const bytes = readFileSync(join(a, sprite.file));
      const meta = await sharp(bytes).metadata();
      expect([meta.format, meta.width, meta.height], id).toEqual([
        'webp',
        sprite.width,
        sprite.height,
      ]);
      if (sprite.transparent) {
        expect(await alphaAt(bytes, 0, 0), `${id} corner`).toBe(0);
        expect(await alphaAt(bytes, sprite.width >> 1, sprite.height >> 1), `${id} centre`).toBe(
          255,
        );
      }
    }
  }, 120_000);

  it('lists sprites whose sheet is missing instead of failing', async () => {
    const out = tempDir('ui');
    dirs.push(out);
    const result = await buildSprites(loadSources().sheets, tempDir('empty'), out);
    expect(result.entries).toEqual([]);
    expect(result.missing.sort()).toEqual(Object.keys(SPRITES).sort());
  });
});

// The real sprites, when $MK8_OUT has them (never in the repo or CI).
const realUi = (readManifest(outDir())?.files ?? []).filter((f) => f.group === SPRITE_GROUP);
describe.skipIf(realUi.length === 0)('mk8 ui sprites in $MK8_OUT', () => {
  it('every sprite exists at its size, transparent ones with a clear corner, ui ≤ 3 MB', async () => {
    let total = 0;
    for (const [id, sprite] of Object.entries(SPRITES)) {
      const bytes = readFileSync(join(outDir(), sprite.file));
      total += bytes.byteLength;
      const meta = await sharp(bytes).metadata();
      expect([meta.width, meta.height], id).toEqual([sprite.width, sprite.height]);
      if (sprite.transparent) expect(await alphaAt(bytes, 0, 0), id).toBe(0);
      expect(realUi.find((f) => f.path === sprite.file)?.sha256, id).toBe(sha256(bytes));
    }
    expect(total).toBeLessThanOrEqual(3 * 1024 * 1024);
  }, 120_000);
});

describe('sprite specs', () => {
  it('cover exactly the sprites in src/mk8/ui/sprites.ts, each on a known sheet', () => {
    const sheets = new Set(loadSources().sheets.map((s) => s.id));
    expect(SPRITE_SPECS.map((s) => s.id).sort()).toEqual(Object.keys(SPRITES).sort());
    for (const spec of SPRITE_SPECS) expect(sheets.has(spec.sheet), spec.id).toBe(true);
  });
});
