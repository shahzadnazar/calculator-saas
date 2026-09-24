/**
 * Pack `dist/` into an upload-ready zip for static shared hosting.
 *
 * Two things this does that a plain `zip -r` does not:
 *
 *   - Leaves `dist/` untouched. The internal /dev routes are excluded from the
 *     ARCHIVE rather than deleted from the build, because four e2e specs load
 *     them; deleting them would silently break the next `npm run test:e2e`.
 *   - Refuses to finish if /dev, or a source map, made it in anyway. The check
 *     runs against the archive's own listing, not against what we meant to do.
 *
 * Run AFTER `astro build`:  npm run deploy:pack
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, rmSync } from 'node:fs';

const DIST = 'dist';
const OUT = 'bestcalculate-dist.zip';
/** Never ship: the internal demo routes, and anything that maps back to source. */
const EXCLUDE = ['dev/*', '*.map', '.DS_Store'];

if (!existsSync(`${DIST}/index.html`)) {
  console.error(`✗ No build found at ${DIST}/index.html — run \`npm run build\` first.`);
  process.exit(1);
}

rmSync(OUT, { force: true });
execFileSync('zip', ['-qr', `../${OUT}`, '.', '-x', ...EXCLUDE], { cwd: DIST, stdio: 'inherit' });

const listing = execFileSync('unzip', ['-Z1', OUT], { encoding: 'utf8' }).split('\n').filter(Boolean);
const leaked = listing.filter((f) => f.startsWith('dev/') || f.endsWith('.map'));
if (leaked.length) {
  console.error(`✗ ${leaked.length} file(s) that must never ship are in the archive: ${leaked.slice(0, 5).join(', ')}`);
  process.exit(1);
}

// The one file the whole deployment depends on, and the easiest to lose: it is a
// dotfile, so a File Manager upload or a careless copy can drop it without a word.
if (!listing.includes('.htaccess')) {
  console.error('✗ .htaccess is missing from the archive — every clean URL would 404. Check public/.htaccess.');
  process.exit(1);
}

const mb = (statSync(OUT).size / 1024 / 1024).toFixed(1);
console.log(`✓ ${OUT} — ${listing.length} files, ${mb} MB. Upload the CONTENTS to public_html.`);
