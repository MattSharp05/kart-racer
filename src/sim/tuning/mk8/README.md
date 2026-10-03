# MK8 tunables (`tuning.mk8`, MK-142)

MK8 Mode's numbers live here, one module per feature, instead of inline in `src/sim/tuning.ts`.
Each module exports an object whose keys become `tuning.mk8.<key>`; `blocks.ts` lists them and
`index.ts` merges them, so key paths and `?tune=1` work exactly as if they were inline.

To add a block (e.g. a ticket's glider numbers):

1. Create `src/sim/tuning/mk8/<feature>.ts`:
   ```ts
   // Gliding (MK-xxx): part of `tuning.mk8` (`./index.ts`).
   export const mk8GlideTuning = {
     /** Glide fall speed, m/s. */
     glideFall: 2,
   };
   ```
2. Add one line to `blocks.ts`: `export { mk8GlideTuning } from './glide';`

Code reads it as `tuning.mk8.glideFall`. Keys must be unique across blocks (`index.test.ts`).
These files are under `src/sim/`, so the sim lint rules apply (no `three`, DOM, `Math.random`, `Date`).
