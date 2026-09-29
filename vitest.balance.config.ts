import { defineConfig } from 'vitest/config';

/**
 * The racer balance smoke (MK-88): 20 full 8-AI races. Minutes of CPU, so it runs apart from
 * `pnpm test` (`pnpm test:balance`, its own CI job), like the netcode soak.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.smoke.test.ts'],
    environment: 'node',
  },
});
