import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Browser globals the pure simulation must never touch (ADR 0001).
const SIM_FORBIDDEN_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'performance',
].map((name) => ({ name, message: 'src/sim must stay pure: no DOM or browser APIs (ADR 0001).' }));

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Content (ADR 0007) follows the sim rules too, except each piece's `render.ts`.
    files: ['src/sim/**/*.ts', 'src/content/**/*.ts'],
    // Tests may time themselves (perf budgets); only runtime sim code must stay pure.
    ignores: ['src/sim/**/*.test.ts', 'src/content/**/*.test.ts', 'src/content/**/render.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/sim must not import three (ADR 0001).' },
            {
              group: [
                '**/render/**',
                '**/render',
                '**/input/**',
                '**/ui/**',
                '**/audio/**',
                '**/game/**',
              ],
              message: 'src/sim must not depend on render/input/ui/audio/game (ADR 0001).',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...SIM_FORBIDDEN_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use sim/rng.ts (seeded) instead.' },
        { object: 'Date', property: 'now', message: 'The sim must not read wall-clock time.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'The sim must not read wall-clock time.',
        },
      ],
    },
  },
  {
    // The netcode may use sim types and logic, never the presentation (CLAUDE.md, ADR 0005).
    files: ['src/net/**/*.ts'],
    // The MK-36 spike page wires itself into the game loop; it's a prototype, not netcode.
    ignores: ['src/net/spike/main.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/net must not import three.' },
            {
              group: ['**/render/**', '**/ui/**', '**/input/**', '**/audio/**', '**/game/**'],
              message: 'src/net must not depend on render/ui/input/audio/game (ADR 0005).',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests assert on array entries they just created, so `!` is safe there.
    files: ['tests/**/*.ts', 'src/**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  prettier,
);
