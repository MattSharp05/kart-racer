import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as groups from './groups';

describe('MK8 scenario groups (MK-142)', () => {
  it('groups.ts lists every group file in this folder', () => {
    const files = readdirSync(import.meta.dirname)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => f !== 'index.ts' && f !== 'groups.ts')
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    expect(Object.keys(groups).sort()).toEqual(files);
  });
});
