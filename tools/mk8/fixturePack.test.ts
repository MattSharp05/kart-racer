// The e2e fixture pack (`tests/e2e/fixtures/mk8-pack/`, MK-142) is generated from its spec files:
// this fails when a spec changed and `make.ts` wasn't run, or the manifest was edited by hand.
// (Here, not next to the pack: Playwright runs every `*.test.ts` under `tests/e2e/`.)
import { describe, expect, it } from 'vitest';
import { stalePaths } from '../../tests/e2e/fixtures/mk8-pack/make.ts';

describe('MK8 fixture pack (MK-142)', () => {
  it('is what its specs make: run `node tests/e2e/fixtures/mk8-pack/make.ts` if not', async () => {
    expect(await stalePaths()).toEqual([]);
  });
});
