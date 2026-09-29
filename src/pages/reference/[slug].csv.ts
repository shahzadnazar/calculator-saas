import type { APIRoute, GetStaticPaths } from 'astro';
import { REFERENCES } from '@data/reference';
import { getReferenceTable } from '@lib/referenceTables';

/**
 * The machine-readable copy of each reference table, at
 * `/reference/<slug>.csv`.
 *
 * It exists for the same reason the tables do: a writer, analyst or teacher who
 * can use the numbers is a writer who cites them, and a citation needs nothing
 * from us but usefulness. It is also what makes the page's Dataset schema
 * truthful — `distribution` points here, and a dataset nobody can download is a
 * claim rather than a dataset.
 *
 * Built from getReferenceTable(), the same source the rendered table uses, so
 * the file and the page can never disagree.
 */
const escape = (cell: string): string =>
  /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

const toCsv = (headers: readonly string[], rows: readonly (readonly string[])[]): string =>
  [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n') + '\r\n';

export const getStaticPaths: GetStaticPaths = () =>
  REFERENCES.filter((r) => getReferenceTable(r.slug)).map((r) => ({ params: { slug: r.slug } }));

export const GET: APIRoute = ({ params }) => {
  const slug = params.slug!;
  const table = getReferenceTable(slug);
  if (!table) return new Response('Not found', { status: 404 });

  return new Response(toCsv(table.headers, table.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `inline; filename="${slug}.csv"`,
    },
  });
};
