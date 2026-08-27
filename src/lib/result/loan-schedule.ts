/**
 * Shared presentation for loan calculators — the principal-against-interest ring
 * and the amortization schedule table that Amortization and Payment both need.
 *
 * Both answer the same shape of question: money is borrowed, it is repaid with
 * interest, and the reader wants to see where each payment goes and what the whole
 * thing costs. So both render the same ring (what the total splits into) and the
 * same table (period · interest · principal · extra · ending balance, with the
 * monthly view divided by year). Only the CSS class prefix differs, which is what
 * `prefix` is for.
 *
 * Everything here builds DOM with the DOM API rather than markup strings, so a
 * computed value can never become HTML. Any class named here must be styled with
 * `:global()` in the island: these elements are created at runtime and never carry
 * Astro's scoping attribute.
 */

/** One row of an amortization schedule. */
export interface LoanScheduleRow {
  period: number;
  interest: number;
  principal: number;
  /** Extra principal applied this period. 0 when the calculator has no extras. */
  extra: number;
  balance: number;
}

export interface LoanScheduleOptions {
  prefix: string;
  /** Formats a money cell. */
  format: (value: number) => string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const svgEl = <K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** Share of a whole, clamped to 0–1 so a rounding artefact can never overflow a slice. */
export const share = (part: number, whole: number): number =>
  whole > 0 ? Math.min(Math.max(part / whole, 0), 1) : 0;

export const percentLabel = (value: number): string => `${Math.round(value * 100)}%`;

/* ------------------------------------------------------------------ */
/* The schedule table                                                  */
/* ------------------------------------------------------------------ */

/** One row: the period as a row header, then interest, principal, extra and balance. */
function tableRow(row: LoanScheduleRow, o: LoanScheduleOptions): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = `${o.prefix}-row`;
  const head = document.createElement('th');
  head.scope = 'row';
  head.className = `${o.prefix}-cell ${o.prefix}-cell--period`;
  head.textContent = String(row.period);
  tr.append(head);
  for (const [value, isExtra] of [
    [row.interest, false],
    [row.principal, false],
    [row.extra, true],
    [row.balance, false],
  ] as const) {
    const td = document.createElement('td');
    td.className = `${o.prefix}-cell ${o.prefix}-num${isExtra ? ` ${o.prefix}-col-extra` : ''}`;
    td.textContent = o.format(value);
    tr.append(td);
  }
  return tr;
}

/** The "End of year N" divider that closes each full year in the monthly view. */
function yearEndRow(year: number, o: LoanScheduleOptions): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = `${o.prefix}-year-end`;
  const cell = document.createElement('th');
  cell.scope = 'rowgroup';
  cell.colSpan = 5;
  cell.className = `${o.prefix}-cell ${o.prefix}-cell--yearend`;
  cell.textContent = `End of year ${year}`;
  tr.append(cell);
  return tr;
}

/** Replace a tbody in one pass. `yearDividers` interleaves the yearly dividers. */
export function fillLoanSchedule(
  tbody: HTMLElement | null,
  rows: readonly LoanScheduleRow[],
  o: LoanScheduleOptions,
  yearDividers = false,
): void {
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  rows.forEach((row, i) => {
    frag.append(tableRow(row, o));
    // A divider closes a year only where a full twelve months have passed AND the
    // table continues past it; a divider on the last row would announce a year the
    // loan never reached.
    if (yearDividers && (i + 1) % 12 === 0 && i + 1 < rows.length) {
      frag.append(yearEndRow((i + 1) / 12, o));
    }
  });
  tbody.replaceChildren(frag);
}

/* ------------------------------------------------------------------ */
/* The ring                                                            */
/* ------------------------------------------------------------------ */

/** One slice: the CSS key that colours it, and its value. */
export interface DonutSlice {
  key: string;
  value: number;
}

export interface DonutOptions {
  prefix: string;
  /** Text description of the whole chart, for readers who cannot see it. */
  label: string;
}

/** Where a slice's label sits: the midpoint of its arc, just outside the ring. */
function labelPoint(cx: number, cy: number, radius: number, fraction: number): [number, number] {
  const angle = (fraction * 2 - 0.5) * Math.PI; // start at 12 o'clock, clockwise
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

/**
 * A ring of what a total is made of.
 *
 * A ring is a weak form for comparing quantities, so this one is built to be read
 * rather than measured: each slice is labelled with its own percentage outside the
 * ring, and the caller's legend names every slice and gives its amount. Nothing here
 * depends on judging an angle, and nothing depends on colour alone.
 *
 * Returns false when there is no positive whole to divide, so the caller can hide
 * the figure rather than draw an empty one.
 */
export function drawDonut(
  host: HTMLElement | null,
  slices: readonly DonutSlice[],
  o: DonutOptions,
): boolean {
  if (!host) return false;
  host.replaceChildren();
  const whole = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (!(whole > 0)) return false;
  if (slices.some((x) => x.value < 0)) return false;

  // The box is wider than the ring because the labels sit OUTSIDE it: a label at the
  // far left needs its own width of room beyond the ring, or it clips at the edge.
  const W = 200;
  // Tall enough for a label ABOVE the ring as well as below it: a slice ending at 12
  // o'clock puts its label at the very top, and at 130 the glyph ascenders clipped.
  const H = 138;
  const CX = 100;
  const CY = 69;
  const R = 40;
  const STROKE = 20;
  const C = 2 * Math.PI * R;
  const GAP = 2; // a surface gap so neighbouring arcs never appear to merge

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: `${o.prefix}-donut__svg`,
    role: 'img',
    'aria-label': o.label,
  });

  // Every arc starts at 12 o'clock and runs clockwise, which is where a reader
  // expects a proportion to start.
  const ring = svgEl('g', { transform: `rotate(-90 ${CX} ${CY})` });
  let offset = 0;
  const placed: { fraction: number; mid: number }[] = [];
  for (const slice of slices) {
    const fraction = share(slice.value, whole);
    if (fraction > 0) {
      const length = Math.max(0, fraction * C - GAP);
      ring.append(
        svgEl('circle', {
          cx: CX,
          cy: CY,
          r: R,
          class: `${o.prefix}-donut__arc ${o.prefix}-donut__arc--${slice.key}`,
          fill: 'none',
          'stroke-width': STROKE,
          'stroke-dasharray': `${length} ${C - length}`,
          'stroke-dashoffset': `${-offset * C}`,
        }),
      );
      placed.push({ fraction, mid: offset + fraction / 2 });
    }
    offset += fraction;
  }
  svg.append(ring);

  // Direct labels, outside the ring in text ink rather than the series colour. A
  // sliver's label is dropped rather than allowed to collide with its neighbour's.
  for (const { fraction, mid } of placed) {
    if (fraction < 0.05) continue;
    const [x, y] = labelPoint(CX, CY, R + STROKE / 2 + 11, mid);
    const text = svgEl('text', {
      x,
      y: y + 3.5,
      class: `${o.prefix}-donut__label`,
      'text-anchor': x < CX - 4 ? 'end' : x > CX + 4 ? 'start' : 'middle',
    });
    text.textContent = percentLabel(fraction);
    svg.append(text);
  }

  host.append(svg);
  return true;
}

/* ------------------------------------------------------------------ */
/* The amortization line chart                                         */
/* ------------------------------------------------------------------ */

/** One line: the CSS key that colours it, and its value at each period. */
export interface LineSeries {
  key: string;
  values: readonly number[];
}

export interface LineChartOptions {
  prefix: string;
  /** Text description of the whole chart, for readers who cannot see it. */
  label: string;
  /** The two axis labels — only the ends are labelled, never every point. */
  xStart: string;
  xEnd: string;
}

/** The next "round" number at or above `value` — an axis is only useful if it reads round. */
export function niceCeiling(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

/** Compact dollars for a chart axis: $1.2K, $340K, $2.1M. */
export function formatCompactUSD(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * How a loan runs its course: the balance falling, and interest and total paid
 * rising, across the term.
 *
 * Every series is in the SAME unit on ONE axis, which is what makes them directly
 * comparable — the point where the rising paid line crosses the falling balance is
 * a real fact about the loan, not an artefact of two scales. Drawn as plain
 * polylines with no dashes and no per-point labels; the caller's legend carries
 * identity, and the schedule table below is the accessible view of the same numbers.
 *
 * Returns false when there is nothing to plot, so the caller can hide the figure.
 */
export function drawLoanLineChart(
  host: HTMLElement | null,
  series: readonly LineSeries[],
  o: LineChartOptions,
): boolean {
  if (!host) return false;
  host.replaceChildren();
  const length = series[0]?.values.length ?? 0;
  if (length < 2 || series.some((s) => s.values.length !== length)) return false;
  if (series.some((s) => s.values.some((v) => !Number.isFinite(v)))) return false;

  const W = 320;
  const H = 180;
  const PAD = { top: 8, right: 8, bottom: 22, left: 46 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Round the top of the scale up so the ticks read 0 / 25K / 50K rather than
  // 0 / 22.5K / 45K.
  const peak = niceCeiling(Math.max(...series.flatMap((s) => s.values.map(Math.abs)), 1));
  const x = (i: number) => PAD.left + (i / (length - 1)) * plotW;
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

  for (const [i, text] of [o.xStart, o.xEnd].entries()) {
    const tx = svgEl('text', {
      x: PAD.left + (i === 0 ? 0 : plotW),
      y: H - 6,
      class: `${o.prefix}-chart__tick`,
      'text-anchor': i === 0 ? 'start' : 'end',
    });
    tx.textContent = text;
    svg.append(tx);
  }

  for (const s of series) {
    svg.append(
      svgEl('polyline', {
        points: s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
        class: `${o.prefix}-chart__line ${o.prefix}-chart__line--${s.key}`,
      }),
    );
  }

  host.append(svg);
  return true;
}
