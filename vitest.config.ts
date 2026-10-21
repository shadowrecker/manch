import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// One test suite for the whole product. Tests live per module:
//   tests/<core|post|reels|deals|check>/{unit,routes,components,ai-evals,integration}
// Component tests (any */components/* folder) run in jsdom; everything else in node.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/**/components/**', 'jsdom']],
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts', 'app/api/**/*.ts', 'components/**/*.tsx'],
      exclude: ['lib/db/types.ts', 'lib/types.ts', '**/types.ts', '**/jobs.ts', '**/*.d.ts', 'tests/**'],
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
});
