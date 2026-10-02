// `pnpm mk8:build` (MK-93): converts the raw files in $MK8_RAW (default .mk8-raw/) into web-ready
// assets in $MK8_OUT (default .mk8-out/), updates its manifest.json and prints a size report.
// Never downloads anything and never writes into public/.
//   node tools/mk8/build.ts [--only id,id] [--strict]
// --only limits the build to those source ids; --strict fails when a source has no raw files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildModels } from './buildModels.ts';
import { sizeReport, updateManifest } from './manifest.ts';
import { outDir, rawDir } from './paths.ts';
import { loadSources } from './sources.ts';

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { only: { type: 'string' }, strict: { type: 'boolean', default: false } },
  });
  const only = values.only ? new Set(values.only.split(',')) : undefined;
  const raw = rawDir();
  const out = outDir();
  mkdirSync(out, { recursive: true });
  const models = loadSources().models.filter((m) => !only || only.has(m.id));

  console.log(`mk8:build: ${raw} → ${out}`);
  console.log(`models (${models.length}):`);
  const result = await buildModels(models, raw, out);
  mkdirSync(join(out, 'reports'), { recursive: true });
  writeFileSync(
    join(out, 'reports', 'models.json'),
    `${JSON.stringify(result.reports, null, 2)}\n`,
  );

  const manifest = updateManifest(out, result.entries);
  console.log(`\nsize report:\n${sizeReport(manifest)}`);
  if (result.missing.length) {
    console.log(
      `\nno raw files (expected in ${join(raw, 'models', '<id>')}/): ${result.missing.join(', ')}`,
    );
    if (values.strict) return 1;
  }
  return 0;
}

if (import.meta.main) process.exitCode = await main();
