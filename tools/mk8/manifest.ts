// `manifest.json` in the output folder (MK-93, ADR 0009): every converted file with its size,
// sha256 and group. A build replaces the entries it wrote and keeps the rest, so the parts
// (models, audio, ui) and single assets can be rebuilt separately.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ManifestEntry {
  /** Relative to the output folder, forward slashes. */
  path: string;
  bytes: number;
  sha256: string;
  /** e.g. `course/mario-kart-stadium`, `racer/mario`, `items`. Budgets are per group. */
  group: string;
}

export interface Manifest {
  version: 1;
  files: ManifestEntry[];
}

export const MANIFEST_FILE = 'manifest.json';

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function entryFor(path: string, bytes: Uint8Array, group: string): ManifestEntry {
  return { path, bytes: bytes.byteLength, sha256: sha256(bytes), group };
}

export function readManifest(root: string): Manifest | undefined {
  const file = join(root, MANIFEST_FILE);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest;
}

/** Adds or replaces `entries`; keeps other entries whose file still exists. */
export function updateManifest(root: string, entries: ManifestEntry[]): Manifest {
  const written = new Set(entries.map((e) => e.path));
  const kept = (readManifest(root)?.files ?? []).filter(
    (e) => !written.has(e.path) && existsSync(join(root, e.path)),
  );
  const files = [...kept, ...entries].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const manifest: Manifest = { version: 1, files };
  writeFileSync(join(root, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Bytes and file count per group, sorted by group, plus the total: the build's size report. */
export function sizeReport(manifest: Manifest): string {
  const groups = new Map<string, { bytes: number; files: number }>();
  for (const e of manifest.files) {
    const g = groups.get(e.group) ?? { bytes: 0, files: 0 };
    g.bytes += e.bytes;
    g.files += 1;
    groups.set(e.group, g);
  }
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  const rows = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const width = Math.max(5, ...rows.map(([g]) => g.length));
  const total = manifest.files.reduce((sum, e) => sum + e.bytes, 0);
  return [
    ...rows.map(([g, s]) => `${g.padEnd(width)}  ${mb(s.bytes).padStart(10)}  ${s.files} files`),
    `${'total'.padEnd(width)}  ${mb(total).padStart(10)}  ${manifest.files.length} files`,
  ].join('\n');
}
