// The fixture pack's voice lines (MK-110) and voice index: Mario's select line (MK-117, committed
// in `static.ts`) plus Mario's and Luigi's race lines that `mk8-voices` says (boost, hit, fall),
// each the synthesized sine from `../mk8-sine.m4a` (no Nintendo audio).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FixtureFile } from './gltf.ts';

const SINE = join(import.meta.dirname, '../../mk8-sine.m4a');
const RACE_LINES = { mario: ['boost', 'hit', 'fall'], luigi: ['boost', 'hit', 'fall'] };

const clipPath = (racer: string, line: string) => `audio/voice/${racer}/fixture-${line}.m4a`;

const index: Record<string, Record<string, string[]>> = {
  mario: { select: ['audio/voice/mario/fixture-select.m4a'] },
};
for (const [racer, lines] of Object.entries(RACE_LINES)) {
  for (const line of lines) (index[racer] ??= {})[line] = [clipPath(racer, line)];
}

/** The index as Prettier writes it (`pnpm format` runs over the fixtures): each clip list on a line. */
function indexJson(): string {
  const racers = Object.entries(index).map(([racer, lines]) => {
    const rows = Object.entries(lines).map(
      ([line, clips]) =>
        `    ${JSON.stringify(line)}: [${clips.map((c) => JSON.stringify(c)).join(', ')}]`,
    );
    return `  ${JSON.stringify(racer)}: {\n${rows.join(',\n')}\n  }`;
  });
  return `{\n${racers.join(',\n')}\n}\n`;
}

const files: FixtureFile[] = [
  {
    path: 'audio/voices.json',
    group: 'audio/voice',
    make: async () => new TextEncoder().encode(indexJson()),
  },
  ...Object.entries(RACE_LINES).flatMap(([racer, lines]) =>
    lines.map((line): FixtureFile => ({
      path: clipPath(racer, line),
      group: `audio/voice/${racer}`,
      make: async () => new Uint8Array(await readFile(SINE)),
    })),
  ),
];
export default files;
