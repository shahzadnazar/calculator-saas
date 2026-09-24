/**
 * The compounding ladder — a table with a bar in it.
 *
 * Nine compounding periods whose effective annual rates differ by less than a fifth
 * of a percentage point. That shape rules out most chart forms: plotted from zero,
 * nine bars of 6.00% to 6.18% are nine identical bars, and the honest-looking fix —
 * cutting the axis so the differences fill the plot — is the oldest way to lie with
 * a chart.
 *
 * So the bar does not encode the rate. It encodes what each period earns ABOVE the
 * slowest one, which has a true zero at annual compounding and is the quantity a
 * reader actually wants: the spread IS the story. The exact rate is printed on every
 * row beside it, so nothing is hidden behind the encoding.
 *
 * Past about seven categories a chart wants to be a table, so this is one — real
 * rows, real row headers, real numbers. The bars are emphasis, not decoration: the
 * two periods being converted wear the accent, the other seven recede to gray.
 */

export interface RateChartRow {
  label: string;
  value: number;
  /** Wears the accent rather than the context gray. */
  highlight?: boolean;
}

export interface RateChartOptions {
  prefix: string;
  /** Formats a value for its row. */
  format: (value: number) => string;
  /** What the whole table says, for a reader who cannot see the bars. */
  label: string;
}

/**
 * Fill `host` with the ladder. Returns false when there is nothing to draw, so the
 * caller can hide the figure rather than show an empty frame.
 */
export function drawFrequencyChart(
  host: HTMLElement | null,
  rows: readonly RateChartRow[],
  o: RateChartOptions,
): boolean {
  if (!host) return false;
  host.replaceChildren();
  if (rows.length < 2) return false;
  if (rows.some((r) => !Number.isFinite(r.value))) return false;

  const values = rows.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;

  const table = document.createElement('table');
  table.className = `${o.prefix}-rate`;

  const caption = document.createElement('caption');
  caption.className = 'sr-only';
  caption.textContent = o.label;
  table.append(caption);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const [text, cls] of [
    ['Compounding', `${o.prefix}-rate__th`],
    ['Extra over annual', `${o.prefix}-rate__th ${o.prefix}-rate__th--track`],
    ['Effective annual rate', `${o.prefix}-rate__th ${o.prefix}-rate__th--value`],
  ] as const) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = cls;
    th.textContent = text;
    headRow.append(th);
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.className = `${o.prefix}-rate__row`;
    if (row.highlight) tr.dataset.highlight = '';

    const th = document.createElement('th');
    th.scope = 'row';
    th.className = `${o.prefix}-rate__label`;
    th.textContent = row.label;
    tr.append(th);

    const trackCell = document.createElement('td');
    trackCell.className = `${o.prefix}-rate__track`;
    const bar = document.createElement('span');
    bar.className = `${o.prefix}-rate__bar`;
    // A zero-spread ladder (a 0% rate) leaves every bar empty rather than dividing
    // by zero and painting nine full-width bars that mean nothing.
    const fraction = spread > 0 ? (row.value - min) / spread : 0;
    bar.style.width = `${(fraction * 100).toFixed(2)}%`;
    trackCell.append(bar);
    tr.append(trackCell);

    const valueCell = document.createElement('td');
    valueCell.className = `${o.prefix}-rate__value`;
    valueCell.textContent = o.format(row.value);
    tr.append(valueCell);

    tbody.append(tr);
  }
  table.append(tbody);
  host.append(table);
  return true;
}
