import { defineConfig } from 'vitest/config';

/** Netcode lab runs (MK-73, `pnpm net:sweep`): minutes of CPU, never part of `pnpm test`. */
export default defineConfig({
  test: {
    include: ['scripts/**/*.lab.ts'],
    environment: 'node',
  },
});
