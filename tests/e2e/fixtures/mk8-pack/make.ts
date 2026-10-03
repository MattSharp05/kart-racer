// Writes the fixture pack (MK-142): every file the spec files in `specs/` make, and
// `manifest.json` from all of them (never edited by hand). Each spec file default-exports its
// `FixtureFile[]`; a new model family is a new spec file, found here by its name (README.md).
// Run from the repo root:
//   node tests/e2e/fixtures/mk8-pack/make.ts          (writes)
//   node tests/e2e/fixtures/mk8-pack/make.ts --check  (fails if anything committed is stale)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FixtureFile } from './specs/gltf.ts';

const PACK = import.meta.dirname;
const SPECS = join(PACK, 'specs');
/** Spec-folder modules that aren't spec files. */
const NOT_SPECS = new Set(['gltf.ts']);

interface Entry {
  path: string;
  bytes: number;
  sha256: string;
  group: string;
}

/** The pack as the specs make it: each file's bytes and the manifest's text. */
export async function buildPack(): Promise<{ files: Map<string, Uint8Array>; manifest: string }> {
  const specs = readdirSync(SPECS)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !NOT_SPECS.has(name))
    .sort();
  const listed: FixtureFile[] = [];
  for (const name of specs) {
    const spec = (await import(pathToFileURL(join(SPECS, name)).href)) as {
      default: FixtureFile[];
    };
    listed.push(...spec.default);
  }
  const files = new Map<string, Uint8Array>();
  const entries: Entry[] = [];
  for (const file of listed) {
    if (files.has(file.path)) throw new Error(`Two specs make ${file.path}`);
    const bytes = file.make
      ? await file.make()
      : new Uint8Array(readFileSync(join(PACK, file.path)));
    files.set(file.path, bytes);
    entries.push({
      path: file.path,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      group: file.group,
    });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, manifest: `${JSON.stringify({ version: 1, files: entries }, null, 2)}\n` };
}

/** What differs between the committed pack and what the specs make (empty when up to date). */
export async function stalePaths(): Promise<string[]> {
  const { files, manifest } = await buildPack();
  const stale = [...files]
    .filter(([path, bytes]) => {
      const file = join(PACK, path);
      return !existsSync(file) || !Buffer.from(bytes).equals(readFileSync(file));
    })
    .map(([path]) => path);
  if (readFileSync(join(PACK, 'manifest.json'), 'utf8') !== manifest) stale.push('manifest.json');
  return stale;
}

if (import.meta.main) {
  if (process.argv.includes('--check')) {
    const stale = await stalePaths();
    if (stale.length) {
      console.error(
        `Fixture pack out of date (run node ${join('tests/e2e/fixtures/mk8-pack/make.ts')}):`,
      );
      for (const path of stale) console.error(`  ${path}`);
      process.exit(1);
    }
    console.log('Fixture pack up to date');
  } else {
    const { files, manifest } = await buildPack();
    for (const [path, bytes] of files) {
      mkdirSync(dirname(join(PACK, path)), { recursive: true });
      writeFileSync(join(PACK, path), bytes);
    }
    writeFileSync(join(PACK, 'manifest.json'), manifest);
    console.log(`Wrote ${files.size} files and manifest.json`);
  }
}
