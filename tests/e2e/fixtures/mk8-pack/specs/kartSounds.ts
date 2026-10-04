// The fixture pack's kart sounds (MK-111): every engine, terrain, wall and drift sound of the bank,
// each the synthesized sine from `../mk8-sine.m4a` (no Nintendo audio), so MK8 races in CI play
// their kart sounds from the pack instead of our synth.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SOUND_IDS, soundGroup, soundPath } from '../../../../../src/mk8/audio/soundIds.ts';
import type { FixtureFile } from './gltf.ts';

const SINE = join(import.meta.dirname, '../../mk8-sine.m4a');

const files: FixtureFile[] = SOUND_IDS.filter(
  (id) => id.startsWith('kart/') || id.startsWith('terrain/') || id.startsWith('drift/'),
).map((id) => ({
  path: soundPath(id),
  group: soundGroup(id),
  make: async () => new Uint8Array(await readFile(SINE)),
}));
export default files;
