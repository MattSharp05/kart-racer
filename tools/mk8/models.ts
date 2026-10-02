// OBJ → compressed GLB (MK-93, ADR 0009): obj2gltf, then glTF-Transform: dedup, weld, prune,
// simplify decoration (meshoptimizer), WebP textures (max 1024 px, and a 512 px `-low` set),
// meshopt compression. Same input → same bytes: nothing reads the clock or the file system
// order, and the writer is given everything in a fixed order.
import { Document, Logger, NodeIO, type Transform } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  meshopt,
  prune,
  simplifyPrimitive,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import obj2gltf from 'obj2gltf';
import sharp from 'sharp';

export interface ModelOptions {
  /** Longest texture edge for the full set (ADR 0009: 1024) and the `-low` set (512). */
  textureSize: number;
  lowTextureSize: number;
  /** WebP quality, 0–100. */
  webpQuality: number;
  /** Materials whose meshes are decoration and get simplified (regexes, case-insensitive). */
  decoration: string[];
  /** Fraction of decoration triangles kept, and the simplifier's error bound. */
  decorationRatio: number;
  decorationError: number;
}

export const MODEL_DEFAULTS: ModelOptions = {
  textureSize: 1024,
  lowTextureSize: 512,
  webpQuality: 80,
  decoration: [],
  decorationRatio: 0.5,
  decorationError: 0.01,
};

export interface ModelStats {
  triangles: number;
  materials: string[];
  textures: number;
}

let ioPromise: Promise<NodeIO> | undefined;

export function createIO(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
  })();
  return ioPromise;
}

/** Reads GLB bytes into a document that only logs warnings (transforms are chatty at info). */
async function readGlb(bytes: Uint8Array): Promise<Document> {
  const doc = await (await createIO()).readBinary(bytes);
  return doc.setLogger(new Logger(Logger.Verbosity.WARN));
}

/** Reads an OBJ (with its MTL and textures beside it) into a glTF-Transform document. */
export async function loadObj(objPath: string): Promise<Document> {
  const glb = await obj2gltf(objPath, { binary: true, secure: true, logger: () => {} });
  return readGlb(new Uint8Array(glb.buffer, glb.byteOffset, glb.byteLength));
}

/** Simplifies primitives whose material name matches one of `patterns`. */
function simplifyDecoration(patterns: string[], ratio: number, error: number): Transform {
  const regexes = patterns.map((p) => new RegExp(p, 'i'));
  return (doc: Document) => {
    if (regexes.length === 0) return;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const name = prim.getMaterial()?.getName() ?? '';
        if (!regexes.some((r) => r.test(name))) continue;
        simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error, lockBorder: true });
      }
    }
  };
}

export function modelStats(doc: Document): ModelStats {
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
      if (prim.getMode() === 4) triangles += count / 3;
    }
  return {
    triangles,
    materials: doc
      .getRoot()
      .listMaterials()
      .map((m) => m.getName())
      .sort(),
    textures: doc.getRoot().listTextures().length,
  };
}

/** Geometry clean-up shared by both texture sets. */
export async function optimiseGeometry(doc: Document, opts: ModelOptions): Promise<void> {
  await doc.transform(
    // Material names carry meaning (the collision surfaces), so equal materials stay apart.
    dedup({ keepUniqueNames: true }),
    weld(),
    simplifyDecoration(opts.decoration, opts.decorationRatio, opts.decorationError),
    prune(),
  );
}

/** Textures to WebP within `size`, meshopt compression; returns GLB bytes. Mutates `doc`. */
export async function encodeGlb(
  doc: Document,
  size: number,
  opts: ModelOptions,
): Promise<Uint8Array> {
  const io = await createIO();
  await doc.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [size, size],
      quality: opts.webpQuality,
      effort: 100,
      limitInputPixels: false,
    }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  return io.writeBinary(doc);
}

export interface ConvertedModel {
  glb: Uint8Array;
  glbLow: Uint8Array;
  stats: ModelStats;
  /** The cleaned (uncompressed) geometry, for the collision export. */
  geometry: Document;
}

export async function convertModel(
  objPath: string,
  opts: ModelOptions = MODEL_DEFAULTS,
): Promise<ConvertedModel> {
  const io = await createIO();
  const doc = await loadObj(objPath);
  await optimiseGeometry(doc, opts);
  const stats = modelStats(doc);
  // Each texture set encodes its own copy: the encoders mutate the document.
  const plain = await io.writeBinary(doc);
  const lowDoc = await readGlb(plain);
  const geometry = await readGlb(plain);
  const glb = await encodeGlb(doc, opts.textureSize, opts);
  const glbLow = await encodeGlb(lowDoc, opts.lowTextureSize, opts);
  return { glb, glbLow, stats, geometry };
}
