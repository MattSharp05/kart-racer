// MK8 Mode's tunables (v3): `tuning.mk8` in `../../tuning.ts`. Each feature keeps its numbers in
// its own module here, an object of `tuning.mk8` keys, listed in `blocks.ts`; they merge into one
// object, so every key path (`tuning.mk8.goldenTime`, `tuning.mk8.statMap.neutral`, …) and
// `?tune=1` work as if written inline. A new block: a new file plus one line in `blocks.ts`
// (README.md). `index.test.ts` fails if two blocks define the same key.
import * as blocks from './blocks';

type Blocks = typeof blocks;
/** Every block's keys in one type (`A | B` → `A & B`). */
type Merged<U> = (U extends unknown ? (u: U) => void : never) extends (m: infer M) => void
  ? M
  : never;

export type Mk8Tuning = Merged<Blocks[keyof Blocks]>;

export const mk8Tuning = Object.assign({}, ...Object.values(blocks)) as Mk8Tuning;
