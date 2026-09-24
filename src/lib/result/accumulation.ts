/**
 * Shared presentation for accumulation calculators — the schedule table and the
 * stacked year-by-year chart that Savings and Interest both need.
 *
 * Both answer the same shape of question: money is put in, it earns, and the reader
 * wants to see the balance build period by period and understand what the total is
 * made of. So both render the same table (period · deposit · interest · ending
 * balance, with the monthly view divided by year) and the same chart (one column per
 * year, split into the opening sum, the contributions so far and the interest so
 * far). Only the CSS class prefix differs, which is what `prefix` is for.
 *
 * Everything here builds DOM with the DOM API rather than markup strings, so a
 * computed value can never become HTML. Note that any class named here must be styled
 * with `:global()` in the island: these elements are created at runtime and never
 * carry Astro's scoping attribute.
 */

/** One year's cumulative composition. The three parts sum to that year's balance. */
export interface YearStack {
  year: number;
  initial: number;
  contributions: number;
  interest: number;
  total: number;
}

/** One row of a schedule table. */
export interface ScheduleRow {
  period: number;
  deposit: number;
  interest: number;
  balance: number;
}

export interface ScheduleOptions {
  prefix: string;
  /** Formats a money cell. */
  format: (value: number) => string;
  /**
   * Whether to render the deposit column. Simple interest has no deposits — nothing
   * is ever added to the balance — so its schedule is period · interest · balance,
   * and a column of zeroes would be noise rather than information. Defaults to true.
   */
  showDeposit?: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export const svgEl = <K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** Compact dollars for a chart axis: $1.2K, $340K, $2.1M. */
export function formatCompactUSD(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * The next "round" number at or above `value`.
 *
 * The steps are finer than the usual 1/2/5 ladder because a coarse ladder wastes
 * plot height: a peak of 54,535 rounds up to 100,000 on 1/2/5, leaving the tallest
 * column filling barely half the chart. Every step here still halves into a readable
 * mid-axis tick, which is the only other thing the axis asks of it.
 */
export function niceCeiling(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

/** Share of a whole, clamped to 0–1 so a rounding artefact can never overflow a bar. */
export const share = (part: number, whole: number): number =>
  whole > 0 ? Math.min(Math.max(part / whole, 0), 1) : 0;

export const percentLabel = (value: number): string => `${Math.round(value * 100)}%`;

/** One schedule row: the period as a row header, then deposit, interest and balance. */
function tableRow(row: ScheduleRow, o: ScheduleOptions): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = `${o.prefix}-row`;
  const head = document.createElement('th');
  head.scope = 'row';
  head.className = `${o.prefix}-cell ${o.prefix}-cell--period`;
  head.textContent = String(row.period);
  tr.append(head);
  const values = o.showDeposit === false ? [row.interest, row.balance] : [row.deposit, row.interest, row.balance];
  for (const value of values) {
    const td = document.createElement('td');
    td.className = `${o.prefix}-cell ${o.prefix}-num`;
    td.textContent = o.format(value);
    tr.append(td);
  }
  return tr;
}

/** The "End of year N" divider that closes each year in the monthly view. */
function yearEndRow(year: number, o: ScheduleOptions): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = `${o.prefix}-year-end`;
  const cell = document.createElement('th');
  cell.scope = 'rowgroup';
  cell.colSpan = o.showDeposit === false ? 3 : 4;
  cell.className = `${o.prefix}-cell ${o.prefix}-cell--yearend`;
  cell.textContent = `End of year ${year}`;
  tr.append(cell);
  return tr;
}

/** Replace a tbody in one pass. `yearDividers` interleaves the yearly dividers. */
export function fillSchedule(
  tbody: HTMLElement | null,
  rows: readonly ScheduleRow[],
  o: ScheduleOptions,
  yearDividers = false,
): void {
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  rows.forEach((row, i) => {
    frag.append(tableRow(row, o));
    // A divider closes a year only where a full twelve months have passed; a short
    // final year ends with the table, and labelling it "End of year N" would claim a
    // year the projection never ran.
    if (yearDividers && (i + 1) % 12 === 0) frag.append(yearEndRow((i + 1) / 12, o));
  });
  tbody.replaceChildren(frag);
}

export interface ChartOptions {
  prefix: string;
  /** Text description of the whole chart, for readers who cannot see it. */
  label: string;
  /** Formats a money value inside the per-column tooltip. */
  format: (value: number) => string;
}

/**
 * Accumulation by year: one column per year, split into the opening sum, the money
 * contributed so far and the interest earned so far. The three parts are the same
 * unit on ONE axis and sum to that year's ending balance, so the column height IS the
 * balance and the split explains it.
 *
 * Colours come from CSS custom properties, so light and dark are each their own
 * validated step rather than an automatic flip, and the caller's legend carries
 * identity — nothing here depends on colour alone. The schedule table below a chart
 * is always the accessible view of the same numbers.
 *
 * Returns false when the data cannot honestly be stacked (a negative part), so the
 * caller can hide the figure rather than draw something misleading.
 */
export function drawAccumulationChart(
  host: HTMLElement | null,
  stacks: readonly YearStack[],
  o: ChartOptions,
): boolean {
  if (!host) return false;
  host.replaceChildren();
  if (!stacks.length) return false;
  if (stacks.some((s) => s.initial < 0 || s.contributions < 0 || s.interest < 0)) return false;

  const W = 320;
  const H = 180;
  const PAD = { top: 8, right: 8, bottom: 22, left: 46 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const peak = niceCeiling(Math.max(...stacks.map((s) => s.total), 1));
  const slot = plotW / stacks.length;
  const barW = Math.max(1, Math.min(28, slot * 0.72));
  const radius = Math.min(3, barW / 2);
  const y = (v: number) => PAD.top + plotH - (v / peak) * plotH;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: `${o.prefix}-chart__svg`,
    role: 'img',
    'aria-label': o.label,
  });

  // Recessive chrome: solid hairlines one step off the surface, never dashed.
  for (const t of [0, 0.5, 1]) {
    const gy = PAD.top + plotH * t;
    svg.append(
      svgEl('line', {
        x1: PAD.left,
        y1: gy,
        x2: W - PAD.right,
        y2: gy,
        class: `${o.prefix}-chart__grid`,
      }),
    );
    const label = svgEl('text', {
      x: PAD.left - 6,
      y: gy + 3.5,
      class: `${o.prefix}-chart__tick`,
      'text-anchor': 'end',
    });
    label.textContent = formatCompactUSD(peak * (1 - t));
    svg.append(label);
  }

  stacks.forEach((s, i) => {
    const x = PAD.left + slot * i + (slot - barW) / 2;
    const group = svgEl('g', { class: `${o.prefix}-chart__bar` });

    // A native tooltip on the whole column — the hover layer, with no runtime cost.
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent =
      `Year ${s.year}: ${o.format(s.total)} — ${o.format(s.initial)} initial, ` +
      `${o.format(s.contributions)} contributions, ${o.format(s.interest)} interest`;
    group.append(title);

    // Clip the stack to a rounded column so the free end reads as one bar.
    const clipId = `${o.prefix}-bar-${i}`;
    const clip = svgEl('clipPath', { id: clipId });
    clip.append(
      svgEl('rect', {
        x,
        y: y(s.total),
        width: barW,
        height: Math.max(0.5, y(0) - y(s.total)),
        rx: radius,
      }),
    );
    group.append(clip);

    const segments: [number, number, string][] = [];
    let base = 0;
    for (const [value, key] of [
      [s.initial, 'initial'],
      [s.contributions, 'contrib'],
      [s.interest, 'interest'],
    ] as const) {
      if (value > 0) segments.push([base, base + value, key]);
      base += value;
    }
    for (const [from, to, key] of segments) {
      const top = y(to);
      const height = y(from) - top;
      // A 2px surface gap between segments, but only where one can spare it.
      const gap = height > 5 && from > 0 ? 2 : 0;
      group.append(
        svgEl('rect', {
          x,
          y: top,
          width: barW,
          height: Math.max(0.5, height - gap),
          class: `${o.prefix}-chart__seg ${o.prefix}-chart__seg--${key}`,
          'clip-path': `url(#${clipId})`,
        }),
      );
    }
    svg.append(group);
  });

  // Only the first and last year are labelled — an axis, not a number on every point.
  for (const [i, s] of [stacks[0], stacks[stacks.length - 1]].entries()) {
    const tx = svgEl('text', {
      x: PAD.left + (i === 0 ? 0 : plotW),
      y: H - 6,
      class: `${o.prefix}-chart__tick`,
      'text-anchor': i === 0 ? 'start' : 'end',
    });
    tx.textContent = `Year ${s.year}`;
    svg.append(tx);
  }

  host.append(svg);
  return true;
}
