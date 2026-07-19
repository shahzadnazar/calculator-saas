/**
 * Prelaunch guard: fail the build if any internal /dev/ demo output leaked into
 * the production bundle. The physical-calculator demo lives at /dev/* during
 * development and MUST be removed before launch. Wired into CI on the production
 * branch only (feature branches legitimately carry /dev/ while building).
 *
 *   node scripts/assert-no-dev.mjs   # run after `astro build`
 */
import { existsSync, readdirSync } from 'node:fs';

const DEV_DIR = 'dist/dev';

if (existsSync(DEV_DIR)) {
  const leaked = readdirSync(DEV_DIR);
  console.error(`✗ Production build contains /dev/ output (${leaked.length} file(s)): ${leaked.join(', ')}`);
  console.error('  Remove the internal demo route(s) under src/pages/dev/ before launching.');
  process.exit(1);
}

console.log('✓ No /dev/ output in the production build.');
