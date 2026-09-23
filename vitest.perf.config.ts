import { defineConfig } from 'vitest/config';

/** Perf budget tests: one file at a time so timings aren't skewed by parallel work. */
export default defineConfig({
  test: {
    include: ['src/**/*.perf.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
});
