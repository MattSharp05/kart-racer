// The fixture pack's item sounds (MK-129): every item sound of the bank and MK8's star music, each
// the synthesized sine from `../mk8-sine.m4a` (no Nintendo audio), so MK8 races in CI play their
// item sounds from the pack instead of our synth.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SOUND_IDS, soundGroup, soundPath } from '../../../../../src/mk8/audio/soundIds.ts';
import type { FixtureFile } from './gltf.ts';

const SINE = join(import.meta.dirname, '../../mk8-sine.m4a');

const files: FixtureFile[] = SOUND_IDS.filter(
  (id) => id.startsWith('items/') || id === 'star/music',
).map((id) => ({
  path: soundPath(id),
  group: soundGroup(id),
  make: async () => new Uint8Array(await readFile(SINE)),
}));
export default files;
