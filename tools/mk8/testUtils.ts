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
import { join } from 'node:path';
import sharp from 'sharp';
import type { Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

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

/**
 * A 16-bit PCM WAV: `silence` s of silence, a `seconds`-long sine at `hz`, then `silence` s of
 * silence again (stereo by default, like the packs' files).
 */
export function sineWav({
  seconds = 1,
  silence = 0.5,
  hz = 440,
  sampleRate = 44100,
  channels = 2,
} = {}): Buffer {
  const pad = Math.round(silence * sampleRate);
  const tone = Math.round(seconds * sampleRate);
  const frames = pad * 2 + tone;
  const data = Buffer.alloc(frames * channels * 2);
  for (let i = 0; i < tone; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * hz * i) / sampleRate) * 0.5 * 32767);
    for (let c = 0; c < channels; c++) data.writeInt16LE(sample, ((pad + i) * channels + c) * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.byteLength, 40);
  return Buffer.concat([header, data]);
}
