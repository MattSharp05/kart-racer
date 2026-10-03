// The fixture pack's files not made by a spec here (MK-97, MK-117): two solid-colour 64 px WebP
// tiles made with `sharp`, the synthesized sine from `../mk8-sine.m4a` (a menu sound and Mario's
// select voice line) and the voice index. Committed as they are; listed so the manifest has them.
import type { FixtureFile } from './gltf.ts';

const files: FixtureFile[] = [
  { path: 'ui/fixture-blue.webp', group: 'ui' },
  { path: 'ui/fixture-red.webp', group: 'ui' },
  { path: 'audio/ui/fixture-sine.m4a', group: 'audio/ui' },
  { path: 'audio/voices.json', group: 'audio/voice' },
  { path: 'audio/voice/mario/fixture-select.m4a', group: 'audio/voice/mario' },
];
export default files;
