import { defineConfig } from 'vitest/config';

/**
 * The netcode soak (MK-73): 10 full 4-player races at `net-bad` over loopback. Minutes of CPU, so
 * it runs apart from `pnpm test`, where it starved other files' 20 s timeouts on CI's 2-core runner.
 */
export default defineConfig({
  test: {
    include: ['src/net/soak*.test.ts'],
    environment: 'node',
  },
});
