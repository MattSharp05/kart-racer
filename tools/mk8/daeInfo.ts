// `pnpm mk8:dae-info` (MK-93): does a racer's DAE carry a skeleton? Skins, joints and animations
// per COLLADA file under $MK8_RAW/models/<racer>/, to decide whether animating racers is possible.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rawDir } from './paths.ts';
import { loadSources } from './sources.ts';

export interface DaeInfo {
  skins: number;
  joints: number;
  animations: number;
}

export function daeInfo(xml: string): DaeInfo {
  const count = (pattern: RegExp) => xml.match(pattern)?.length ?? 0;
  return {
    skins: count(/<skin\b/g),
    joints: count(/<node\b[^>]*\btype\s*=\s*"JOINT"/g),
    animations: count(/<animation\b/g),
  };
}

function daeFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.toLowerCase().endsWith('.dae'))
    .sort()
    .map((f) => join(dir, f));
}

function main(): void {
  const raw = rawDir();
  for (const racer of loadSources().models.filter((m) => m.kind === 'racer')) {
    const dir = join(raw, 'models', racer.id);
    const files = existsSync(dir) ? daeFiles(dir) : [];
    if (files.length === 0) {
      console.log(`${racer.id}: no .dae in ${dir}`);
      continue;
    }
    for (const file of files) {
      const info = daeInfo(readFileSync(file, 'utf8'));
      const verdict = info.skins > 0 && info.joints > 0 ? 'skeleton' : 'no skeleton';
      console.log(
        `${racer.id}: ${verdict} (${info.skins} skins, ${info.joints} joints, ${info.animations} animations) ${file}`,
      );
    }
  }
}

if (import.meta.main) main();
