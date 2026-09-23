import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Perf budgets run separately and alone: `pnpm test:perf`.
    exclude: ['src/**/*.perf.test.ts'],
    environment: 'node',
  },
});
