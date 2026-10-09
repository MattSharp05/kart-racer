// The material-name guesses for a course's collision surfaces (MK-92/MK-93): what `pnpm mk8:build`
// uses for a material its course's `materials.ts` doesn't list. Shared by the pipeline
// (`tools/mk8/collisionFormat.ts` re-exports them) and, since MK-123's round 2, the client, which
// builds a course's collision from its model (`modelCollision.ts`) with the same rules. No runtime
// imports: Node runs the pipeline's copy directly.
import type { MeshMaterialSurface } from '../../../sim/meshCollision.ts';

/**
 * Material-name rules for the per-course material map stub, first match wins. MK-92 added
 * `antigrav` (and `deco`/`shadow`/`bg` decoration); the names are a proposal until a real course's
 * materials have been checked (see `src/mk8/spike/NOTES.md`).
 */
export const SURFACE_RULES: readonly [RegExp, MeshMaterialSurface][] = [
  [
    /sky|cloud|tree|leaf|leaves|crowd|audience|flag|banner|light|effect|fx|deco|shadow|^bg/,
    'ignore',
  ],
  [/water|sea|river|lake|pool/, 'water'],
  [/dash|boost/, 'boost'],
  [/wall|fence|rail|barrier|guard/, 'wall'],
  [/grass|dirt|sand|mud|gravel|offroad|rough/, 'offroad'],
  [/anti.?grav|zero.?g/, 'antigrav'],
  [/glide|jump/, 'glide'],
];

/** Guess a surface from a material name, for the per-course material map stub. */
export function guessSurface(material: string): MeshMaterialSurface {
  const name = material.toLowerCase();
  for (const [pattern, surface] of SURFACE_RULES) if (pattern.test(name)) return surface;
  return 'road';
}
