import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { REFERENCES, referencePath } from './reference';
import { getReferenceTable } from '@lib/referenceTables';
import { datasetSchema } from '@lib/schema';
import { SITE } from '@config/site';

/**
 * The reference tables are the site's citable assets: a writer who can quote a
 * figure is a writer who links to it, and a citation asks nothing of them — no
 * iframe, no HTML access, no permission. These tests hold the three things that
 * make a figure quotable: a stated date, a machine-readable copy, and a Dataset
 * declaration that agrees with both.
 */
describe('reference assets as citable data', () => {
  it('every table states when its figures were verified', () => {
    for (const r of REFERENCES) {
      expect(r.reviewed, r.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(r.reviewed)), r.slug).toBe(false);
      expect(r.reviewed <= new Date().toISOString().slice(0, 10), `${r.slug} is dated in the future`).toBe(true);
    }
  });

  it('every table actually has data behind it', () => {
    for (const r of REFERENCES) {
      const table = getReferenceTable(r.slug);
      expect(table, `${r.slug} has no computed table`).not.toBeNull();
      expect(table!.headers.length, r.slug).toBeGreaterThan(1);
      expect(table!.rows.length, r.slug).toBeGreaterThan(1);
      for (const row of table!.rows) expect(row, r.slug).toHaveLength(table!.headers.length);
    }
  });

  it('declares a Dataset whose download and date match the page', () => {
    for (const r of REFERENCES) {
      const path = referencePath(r);
      const schema = datasetSchema({
        name: r.title,
        description: r.description,
        path,
        dateModified: `${r.reviewed}T00:00:00Z`,
        csvPath: `${path}.csv`,
        variables: getReferenceTable(r.slug)!.headers,
      }) as Record<string, unknown>;

      expect(schema['@type']).toBe('Dataset');
      expect(schema.url).toBe(`${SITE.url}${path}`);
      expect(schema.dateModified).toBe(`${r.reviewed}T00:00:00Z`);
      const download = (schema.distribution as Array<Record<string, string>>)[0];
      expect(download.encodingFormat).toBe('text/csv');
      expect(download.contentUrl).toBe(`${SITE.url}${path}.csv`);
    }
  });
});

/**
 * Post-build, and skipped when there is no build to look at, so `npm test` on a
 * clean checkout is not a false failure.
 */
describe.skipIf(!existsSync('dist/reference'))('the built CSVs', () => {
  it('exist for every table, with a header row and one row per table row', () => {
    for (const r of REFERENCES) {
      const file = `dist/reference/${r.slug}.csv`;
      expect(existsSync(file), `${file} was not built`).toBe(true);
      const lines = readFileSync(file, 'utf8').trim().split(/\r\n/);
      const table = getReferenceTable(r.slug)!;
      expect(lines.length, r.slug).toBe(table.rows.length + 1);
      expect(lines[0], r.slug).toBe(table.headers.join(','));
    }
  });

  it('quotes cells containing commas, so a thousands separator cannot split a column', () => {
    // "$20,000" must survive as one cell — the salary table would otherwise be
    // silently misaligned for anyone who opened it.
    const csv = readFileSync('dist/reference/salary-conversion-table.csv', 'utf8');
    expect(csv).toContain('"$20,000"');
    const header = csv.split(/\r\n/)[0].split(',').length;
    for (const line of csv.trim().split(/\r\n/).slice(1)) {
      const cells = line.match(/(".*?"|[^,]*)(,|$)/g)!.filter((c) => c !== '');
      expect(cells.length, line).toBe(header);
    }
  });
});
