import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Mirror the tsconfig `paths` aliases so tests resolve imports like the app does.
export default defineConfig({
  resolve: {
    alias: {
      '@config': r('./src/config'),
      '@components': r('./src/components'),
      '@layouts': r('./src/layouts'),
      '@lib': r('./src/lib'),
      '@data': r('./src/data'),
      '@styles': r('./src/styles'),
      '@': r('./src'),
    },
  },
  test: {
    // `scripts/` is included so the asset generators' output-ownership guard runs in CI with
    // the rest of the suite; everything else under scripts/ is untested build tooling.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
