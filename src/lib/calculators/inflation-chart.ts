/**
 * The purchasing-power line: what one amount is worth, month by month, across a span.
 *
 * This is deliberately NOT `drawLoanLineChart`. That chart is anchored at zero, which is
 * right for a balance being paid down and wrong here: this series starts at the amount
 * entered and drifts up by tens of percent, so a zero baseline would squash a decade of
 * inflation into the top sliver of the box. The axis instead brackets the data on round
 * numbers, and the baseline is labelled like every other tick so it can never be mistaken
 * for zero.
 *
 * Points are placed by DATE, not by array position, so the month BLS never published
 * leaves a correctly-sized gap in the line instead of quietly shortening the decade.
 *
 * The scale is pure and unit-tested; only `drawPurchasingPowerChart` touches the DOM.
 */

export interface ChartPoint {
  year: number;
  month: number;
  value: number;
}

export interface ChartScale {
  /** Bottom and top of the value axis, both round. */
  lo: number;
  hi: number;
  /** Value-axis ticks, bottom to top, including `lo` and `hi`. */
  ticks: readonly number[];
  /** Whole years to mark along the time axis. */
  yearTicks: readonly number[];
}

const STEPS = [1, 2, 2.5, 5, 10] as const;
const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100] as const;

/** The smallest round step that splits `range` into about `target` intervals. */
export function niceStep(range: number, target: number): number {
  if (!(range > 0)) return 1;
  const raw = range / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const s of STEPS) {
    if (s * magnitude >= raw) return s * magnitude;
  }
  return 10 * magnitude;
}

/**
 * Bracket the series on round numbers and pick the years to label.
 *
 * Returns null when there is nothing plottable — fewer than two points, or a value that
 * is not a finite number.
 */
export function planPurchasingPowerChart(points: readonly ChartPoint[]): ChartScale | null {
  if (points.length < 2) return null;
  if (points.some((p) => !Number.isFinite(p.value))) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  // A flat series still needs a box with height to it.
  const spread = max - min || Math.max(Math.abs(max), 1) * 0.1;
  const step = niceStep(spread, 4);
  const lo = Math.floor(min / step) * step;
  // A series that never moves lands on lo === hi; give it one step of height so the
  // line has somewhere to sit instead of collapsing onto the frame.
  const hi = Math.max(Math.ceil(max / step) * step, lo + step);

  const ticks: number[] = [];
  // Accumulate by count, not by repeated addition, so a fractional step cannot drift.
  const count = Math.round((hi - lo) / step);
  for (let i = 0; i <= count; i += 1) ticks.push(Number((lo + i * step).toFixed(6)));

  // Mark whole years that actually fall inside the span. Counting years the span only
  // touches would let a mark off the end of the axis decide how dense the axis looks.
  const t0 = points[0].year * 12 + points[0].month;
  const last = points[points.length - 1];
  const t1 = last.year * 12 + last.month;
  let yearTicks: number[] = [];
  for (const ys of YEAR_STEPS) {
    const marks: number[] = [];
    for (let y = Math.ceil(points[0].year / ys) * ys; y <= last.year; y += ys) {
      const t = y * 12 + 1;
      if (t >= t0 && t <= t1) marks.push(y);
    }
    // Keep the axis readable: a few marks, never a picket fence.
    if (marks.length <= 4) {
      yearTicks = marks;
      break;
    }
  }

  return { lo, hi, ticks, yearTicks };
}

/** Months since year zero — the position of a point on the time axis. */
function months(p: { year: number; month: number }): number {
  return p.year * 12 + p.month;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export interface PurchasingPowerChartOptions {
  prefix: string;
  /** Description of the whole chart for readers who cannot see it. */
  label: string;
  /** Formats a value-axis tick. */
  formatTick: (value: number) => string;
}

/**
 * Draw the series. Returns false when there is nothing to plot so the caller can hide the
 * figure rather than leave an empty box.
 */
export function drawPurchasingPowerChart(
  host: HTMLElement | null,
  points: readonly ChartPoint[],
  o: PurchasingPowerChartOptions,
): boolean {
  if (!host) return false;
  host.replaceChildren();
  const scale = planPurchasingPowerChart(points);
  if (!scale) return false;

  const W = 480;
  const H = 240;
  const PAD = { top: 10, right: 12, bottom: 40, left: 54 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const t0 = months(points[0]);
  const t1 = months(points[points.length - 1]);
  const span = t1 - t0 || 1;
  const x = (p: { year: number; month: number }) => PAD.left + ((months(p) - t0) / span) * plotW;
  const y = (v: number) => PAD.top + plotH - ((v - scale.lo) / (scale.hi - scale.lo || 1)) * plotH;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: `${o.prefix}-chart__svg`,
    role: 'img',
    'aria-label': o.label,
  });

  for (const t of scale.ticks) {
    const gy = y(t);
    svg.append(
      svgEl('line', { x1: PAD.left, y1: gy, x2: W - PAD.right, y2: gy, class: `${o.prefix}-chart__grid` }),
    );
    const label = svgEl('text', {
      x: PAD.left - 7,
      y: gy + 3.5,
      class: `${o.prefix}-chart__tick`,
      'text-anchor': 'end',
    });
    label.textContent = o.formatTick(t);
    svg.append(label);
  }

  for (const yr of scale.yearTicks) {
    const gx = x({ year: yr, month: 1 });
    if (gx < PAD.left || gx > W - PAD.right) continue;
    svg.append(
      svgEl('line', { x1: gx, y1: PAD.top, x2: gx, y2: PAD.top + plotH, class: `${o.prefix}-chart__grid` }),
    );
    const label = svgEl('text', {
      x: gx,
      y: H - 22,
      class: `${o.prefix}-chart__tick`,
      'text-anchor': 'middle',
    });
    label.textContent = String(yr);
    svg.append(label);
  }

  // The plot frame, so the baseline reads as an axis rather than as zero.
  svg.append(
    svgEl('rect', {
      x: PAD.left,
      y: PAD.top,
      width: plotW,
      height: plotH,
      class: `${o.prefix}-chart__frame`,
    }),
  );

  svg.append(
    svgEl('polyline', {
      points: points.map((p) => `${x(p).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '),
      class: `${o.prefix}-chart__line`,
    }),
  );

  const axisTitle = svgEl('text', {
    x: PAD.left + plotW / 2,
    y: H - 5,
    class: `${o.prefix}-chart__axis-title`,
    'text-anchor': 'middle',
  });
  axisTitle.textContent = 'Year';
  svg.append(axisTitle);

  host.append(svg);
  return true;
}
