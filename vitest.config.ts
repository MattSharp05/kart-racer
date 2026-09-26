import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Perf budgets run separately and alone: `pnpm test:perf`. The netcode soak (minutes of CPU)
    // runs on its own too, `pnpm test:netsoak`, so it can't starve the timed tests here.
    exclude: ['src/**/*.perf.test.ts', 'src/net/soak*.test.ts'],
    environment: 'node',
    // Full-race simulations (AI, 3 laps) take a few seconds each.
    testTimeout: 20_000,
  },
});
