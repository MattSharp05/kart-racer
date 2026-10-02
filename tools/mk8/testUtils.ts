// Fixtures and helpers for the MK8 pipeline tests: everything is generated or hand-written here,
// no real game files.
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import type { Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { loadSources } from './sources.ts';
import { SPRITE_SPECS, type Rect } from './spriteSpecs.ts';

export const FIXTURES = join(import.meta.dirname, 'fixtures');

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `mk8-${prefix}-`));
}

/** A 64 px checker PNG (deterministic bytes). */
export async function checkerPng(size = 64): Promise<Buffer> {
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      pixels.set(on ? [230, 40, 40] : [250, 250, 250], (y * size + x) * 3);
    }
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
}

/** `<raw>/models/<id>/` with the hand-written cube OBJ, its MTL and a generated texture. */
export async function writeCubeModel(raw: string, id: string): Promise<void> {
  const dir = join(raw, 'models', id);
  mkdirSync(dir, { recursive: true });
  for (const name of ['cube.obj', 'cube.mtl'])
    copyFileSync(join(FIXTURES, 'cube', name), join(dir, name));
  writeFileSync(join(dir, 'checker.png'), await checkerPng());
}

/** A flat `n × n` grid OBJ (2n² triangles) in one material: for the collision simplifier. */
export function writeGridModel(raw: string, id: string, n: number): void {
  const dir = join(raw, 'models', id);
  mkdirSync(dir, { recursive: true });
  const lines = ['o grid', 'usemtl road'];
  for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) lines.push(`v ${x} 0 ${z}`);
  const v = (x: number, z: number) => z * (n + 1) + x + 1;
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      lines.push(`f ${v(x, z)} ${v(x, z + 1)} ${v(x + 1, z + 1)}`);
      lines.push(`f ${v(x, z)} ${v(x + 1, z + 1)} ${v(x + 1, z)}`);
    }
  writeFileSync(join(dir, 'grid.obj'), `${lines.join('\n')}\n`);
}

/** Every file under `dir`, relative path → bytes. */
export function readTree(dir: string, prefix = ''): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) for (const [k, v] of readTree(dir, rel)) out.set(k, v);
    else out.set(rel, readFileSync(join(dir, rel)));
  }
  return out;
}

export interface ParsedGlb {
  meshes: number;
  triangles: number;
  textures: number;
}

/**
 * Parses a GLB the way the game will: three's GLTFLoader with MeshoptDecoder. Node has no
 * `self` or createImageBitmap, so the caller stubs them (decoding the image with sharp to prove it's valid).
 */
export async function parseGlb(bytes: Uint8Array): Promise<ParsedGlb> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const gltf = await loader.parseAsync(buffer, '');
  let meshes = 0;
  let triangles = 0;
  const textures = new Set<unknown>();
  gltf.scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const geometry = mesh.geometry;
    triangles +=
      (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
    const material = mesh.material as { map?: { image?: unknown } | null };
    if (material.map?.image) textures.add(material.map.image);
  });
  return { meshes, triangles, textures: textures.size };
}

/** A createImageBitmap stand-in that really decodes the image (sharp) and fails on bad data. */
export async function decodeImageBitmap(
  blob: Blob,
): Promise<{ width: number; height: number; close(): void }> {
  const meta = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
  if (!meta.width || !meta.height) throw new Error('image did not decode');
  return { width: meta.width, height: meta.height, close() {} };
}

export const BACKGROUND = [40, 200, 60, 255];
export const INK = [220, 30, 120, 255];

/** RGBA canvas helpers for the generated sheets. */
function canvas(width: number, height: number, colour: number[]) {
  const data = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set(colour, p * 4);
  const fill = (r: Rect, c: number[]) => {
    for (let y = r.top; y < r.top + r.height; y++)
      for (let x = r.left; x < r.left + r.width; x++) data.set(c, (y * width + x) * 4);
  };
  const png = () =>
    sharp(data, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
  return { fill, png };
}

/**
 * A fake of every sheet, laid out on the ticket's grids: background colour everywhere and an
 * "icon" (a block inset 16 px) in each sprite's cell; course previews get the black band.
 */
export async function writeFakeSheets(raw: string) {
  const { sheets } = loadSources();
  for (const sheet of sheets) {
    const specs = SPRITE_SPECS.filter((s) => s.sheet === sheet.id);
    if (sheet.raw.endsWith('/')) {
      for (const spec of specs) {
        const [w, h] = spec.id.startsWith('bg_')
          ? [1920, 1080]
          : spec.id === 'font_digital'
            ? [510, 75]
            : [510, 73];
        const file = join(raw, sheet.raw, `${spec.file}.png`);
        mkdirSync(dirname(file), { recursive: true });
        const img = canvas(w, h, BACKGROUND);
        img.fill({ left: 10, top: 10, width: 40, height: 40 }, INK);
        writeFileSync(file, await img.png());
      }
      continue;
    }
    const rects = specs.flatMap((s) => (s.rect ? [s.rect] : []));
    const width = Math.max(...rects.map((r) => r.left + r.width)) + 2;
    const height = Math.max(...rects.map((r) => r.top + r.height)) + 2;
    const img = canvas(width, height, BACKGROUND);
    for (const r of rects) {
      if (sheet.id === 'course-previews') {
        // Cell = preview (304×162) + black band below and right.
        img.fill({ left: r.left, top: r.top, width: 306, height: 258 }, [0, 0, 0, 255]);
        img.fill({ left: r.left, top: r.top, width: 304, height: 162 }, INK);
      } else
        img.fill(
          { left: r.left + 16, top: r.top + 16, width: r.width - 32, height: r.height - 32 },
          INK,
        );
    }
    const file = join(raw, sheet.raw);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, await img.png());
  }
}
