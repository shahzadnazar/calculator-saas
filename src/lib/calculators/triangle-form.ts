/**
 * Triangle form layer.
 *
 * Unlike the area and volume pages, this is ONE calculator: six fields around a diagram, of which
 * the visitor fills any three including at least one side. The interesting work is therefore not
 * layout but input — three of six, in any combination, with angles in degrees or radians, where a
 * radian may be written "pi/2".
 *
 * That expression is parsed by an explicit tokeniser, never evaluated. `eval` on a visitor's string
 * is the one thing a calculator must never do, and "pi/4" is not worth breaking that for.
 *
 * The solver may return TWO triangles: two sides and an angle that is not between them can describe
 * two different triangles, and both are real answers. As with the spherical cap, that is carried in
 * the data rather than resolved by picking one.
 */
import {
  solveTriangle,
  triangleMetrics,
  triangleKind,
  piFraction,
  formatTriangle,
  toDegrees,
  toRadians,
  type Triangle,
  type TriangleInput,
  type SolveFailure,
} from './triangle';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type TriangleAngleUnit = 'deg' | 'rad';
export const DEFAULT_ANGLE_UNIT: TriangleAngleUnit = 'deg';

/** The six fields, in the order the diagram places them. */
export const SIDE_FIELDS = ['a', 'b', 'c'] as const;
export const ANGLE_FIELDS = ['angleA', 'angleB', 'angleC'] as const;

export const MSG = {
  needThree: 'Enter exactly three values — you have {n}.',
  needASide: 'Enter at least one side. Three angles fix the shape but not the size.',
  sideInvalid: 'Enter a length greater than zero.',
  angleInvalidDeg: 'Enter an angle greater than 0° and less than 180°.',
  angleInvalidRad: 'Enter an angle greater than 0 and less than π. You can write pi/2 or pi/4.',
  anglesTooBig: 'Those angles cannot fit in a triangle — they must add up to less than 180°.',
  noSuchTriangle: 'No triangle has those measurements.',
  degenerate: 'Those measurements give a flat triangle with no area.',
} as const;

export interface TriangleValues {
  a: string;
  b: string;
  c: string;
  angleA: string;
  angleB: string;
  angleC: string;
  angleUnit: string;
}

export const EMPTY_VALUES: TriangleValues = {
  a: '',
  b: '',
  c: '',
  angleA: '',
  angleB: '',
  angleC: '',
  angleUnit: DEFAULT_ANGLE_UNIT,
};

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** A strictly positive finite decimal; empty and junk are told apart. */
export function parseSide(raw: string): number | 'empty' | 'invalid' {
  const s = (raw ?? '').trim();
  if (s === '') return 'empty';
  if (!/^\d+\.?\d*$|^\.\d+$/.test(s)) return 'invalid';
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/**
 * An angle, in the chosen unit, returned in RADIANS.
 *
 * In radian mode the reference accepts "pi/2" and "pi/4". This reads such an entry with an explicit
 * pattern — an optional multiplier, `pi`, an optional divisor — rather than evaluating it. Anything
 * that is not plainly one of those two shapes is rejected rather than guessed at.
 */
export function parseAngle(raw: string, unit: TriangleAngleUnit): number | 'empty' | 'invalid' {
  const s = (raw ?? '').trim();
  if (s === '') return 'empty';

  let radians: number;
  if (unit === 'rad') {
    const pi = /^(\d*\.?\d*)\s*(?:pi|π)\s*(?:\/\s*(\d+\.?\d*))?$/i.exec(s);
    if (pi) {
      const multiplier = pi[1] === '' || pi[1] === undefined ? 1 : Number(pi[1]);
      const divisor = pi[2] === undefined ? 1 : Number(pi[2]);
      if (!Number.isFinite(multiplier) || !Number.isFinite(divisor) || divisor === 0) return 'invalid';
      radians = (multiplier * Math.PI) / divisor;
    } else {
      if (!/^\d+\.?\d*$|^\.\d+$/.test(s)) return 'invalid';
      radians = Number(s);
    }
  } else {
    if (!/^\d+\.?\d*$|^\.\d+$/.test(s)) return 'invalid';
    radians = toRadians(Number(s));
  }

  if (!Number.isFinite(radians) || radians <= 0 || radians >= Math.PI) return 'invalid';
  return radians;
}

const asAngleUnit = (raw: string): TriangleAngleUnit => (raw === 'rad' ? 'rad' : 'deg');

/* ------------------------------------------------------------------ */
/* Validation and computation                                          */
/* ------------------------------------------------------------------ */

export interface TriangleComputed {
  values: TriangleValues;
  unit: TriangleAngleUnit;
  input: TriangleInput;
  triangles: Triangle[];
  failure?: SolveFailure;
  method?: string;
  ambiguous: boolean;
}

/** The six raw entries, parsed into the solver's input. */
export function readInput(v: TriangleValues): {
  input: TriangleInput;
  fieldErrors: Record<string, string>;
  filled: number;
} {
  const unit = asAngleUnit(v.angleUnit);
  const fieldErrors: Record<string, string> = {};
  let filled = 0;

  const sides = SIDE_FIELDS.map((name) => {
    const parsed = parseSide(v[name]);
    if (parsed === 'invalid') fieldErrors[name] = MSG.sideInvalid;
    else if (parsed !== 'empty') filled += 1;
    return typeof parsed === 'number' ? parsed : null;
  }) as [number | null, number | null, number | null];

  const angles = ANGLE_FIELDS.map((name) => {
    const parsed = parseAngle(v[name], unit);
    if (parsed === 'invalid') {
      fieldErrors[name] = unit === 'rad' ? MSG.angleInvalidRad : MSG.angleInvalidDeg;
    } else if (parsed !== 'empty') filled += 1;
    return typeof parsed === 'number' ? parsed : null;
  }) as [number | null, number | null, number | null];

  return { input: { sides, angles }, fieldErrors, filled };
}

const FAILURE_MESSAGE: Record<SolveFailure, string> = {
  'need-three': MSG.needThree,
  'need-a-side': MSG.needASide,
  'angles-too-big': MSG.anglesTooBig,
  'no-such-triangle': MSG.noSuchTriangle,
  degenerate: MSG.degenerate,
};

export function validateTriangle(v: TriangleValues): ValidationResult {
  const { input, fieldErrors, filled } = readInput(v);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  if (filled !== 3) {
    return { ok: false, formError: MSG.needThree.replace('{n}', String(filled)) };
  }
  const solved = solveTriangle(input);
  if (solved.failure) return { ok: false, formError: FAILURE_MESSAGE[solved.failure] };
  if (solved.triangles.length === 0) return { ok: false, formError: MSG.noSuchTriangle };
  return { ok: true };
}

export function computeTriangle(v: TriangleValues): TriangleComputed {
  const { input, fieldErrors, filled } = readInput(v);
  if (Object.keys(fieldErrors).length || filled !== 3) {
    return { values: v, unit: asAngleUnit(v.angleUnit), input, triangles: [], ambiguous: false };
  }
  const solved = solveTriangle(input);
  return {
    values: v,
    unit: asAngleUnit(v.angleUnit),
    input,
    triangles: solved.triangles,
    failure: solved.failure,
    method: solved.method,
    ambiguous: Boolean(solved.ambiguous),
  };
}

/** The first triangle's area, but only when everything reconciles with a recompute. */
export function completeTriangleValue(r: TriangleComputed): number {
  if (r.failure || r.triangles.length === 0) return Number.NaN;

  const re = solveTriangle(readInput(r.values).input);
  if (re.triangles.length !== r.triangles.length) return Number.NaN;
  for (let i = 0; i < re.triangles.length; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      if (re.triangles[i].sides[k] !== r.triangles[i].sides[k]) return Number.NaN;
      if (re.triangles[i].angles[k] !== r.triangles[i].angles[k]) return Number.NaN;
    }
  }

  for (const t of r.triangles) {
    if (!t.sides.every((x) => Number.isFinite(x) && x > 0)) return Number.NaN;
    if (!t.angles.every((x) => Number.isFinite(x) && x > 0 && x < Math.PI)) return Number.NaN;
    if (Math.abs(t.angles[0] + t.angles[1] + t.angles[2] - Math.PI) > 1e-7) return Number.NaN;
    const m = triangleMetrics(t);
    if (!Number.isFinite(m.area) || m.area <= 0) return Number.NaN;
    for (const value of [
      m.perimeter,
      m.semiperimeter,
      m.inradius,
      m.circumradius,
      ...m.heights,
      ...m.medians,
      ...m.vertices.flat(),
      ...m.centroid,
      ...m.incenter,
      ...m.circumcenter,
    ]) {
      if (!Number.isFinite(value)) return Number.NaN;
    }
  }
  return triangleMetrics(r.triangles[0]).area;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface LabelledValue {
  label: string;
  value: string;
}

export interface AngleView {
  label: string;
  /** "60°". */
  degrees: string;
  /** "1.0472 rad". */
  radians: string;
  /** "π/3", or an empty string when the angle is not a neat fraction. */
  pi: string;
}

export interface SolutionView {
  kind: string;
  sides: LabelledValue[];
  angles: AngleView[];
  area: string;
  perimeter: string;
  semiperimeter: string;
  heights: LabelledValue[];
  medians: LabelledValue[];
  inradius: string;
  circumradius: string;
  vertices: string;
  centroid: string;
  incenter: string;
  circumcenter: string;
  /** The three corners, for drawing. */
  points: [number, number][];
}

export interface TrianglePresentation {
  solutions: SolutionView[];
  ambiguous: boolean;
  a11y: string;
}

const point = (p: [number, number]) => `[${formatTriangle(p[0])}, ${formatTriangle(p[1])}]`;

export function presentSolution(t: Triangle): SolutionView {
  const m = triangleMetrics(t);
  const names = ['a', 'b', 'c'];
  const angleNames = ['A', 'B', 'C'];

  return {
    kind: triangleKind(t),
    sides: t.sides.map((s, i) => ({ label: `Side ${names[i]}`, value: formatTriangle(s) })),
    angles: t.angles.map((rad, i) => ({
      label: `Angle ∠${angleNames[i]}`,
      degrees: `${formatTriangle(toDegrees(rad))}°`,
      radians: `${formatTriangle(rad)} rad`,
      pi: piFraction(rad) ?? '',
    })),
    area: formatTriangle(m.area),
    perimeter: formatTriangle(m.perimeter),
    semiperimeter: formatTriangle(m.semiperimeter),
    heights: m.heights.map((h, i) => ({ label: `Height h${names[i]}`, value: formatTriangle(h) })),
    medians: m.medians.map((x, i) => ({ label: `Median m${names[i]}`, value: formatTriangle(x) })),
    inradius: formatTriangle(m.inradius),
    circumradius: formatTriangle(m.circumradius),
    vertices: `A${point(m.vertices[0])} B${point(m.vertices[1])} C${point(m.vertices[2])}`,
    centroid: point(m.centroid),
    incenter: point(m.incenter),
    circumcenter: point(m.circumcenter),
    points: m.vertices,
  };
}

export function presentTriangle(r: TriangleComputed): TrianglePresentation {
  const solutions = r.triangles.map(presentSolution);
  return {
    solutions,
    ambiguous: r.ambiguous,
    a11y:
      solutions.length > 1
        ? `Two possible triangles. First: ${solutions[0].kind}, area ${solutions[0].area}. Second: ${solutions[1].kind}, area ${solutions[1].area}.`
        : solutions.length === 1
          ? `${solutions[0].kind}, area ${solutions[0].area}.`
          : '',
  };
}

export function describeTriangle(r: TriangleComputed): string {
  return presentTriangle(r).a11y || 'No triangle has those measurements.';
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const value = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';

export function readTriangleValues(root: HTMLElement): TriangleValues {
  return {
    a: value(root, 'a'),
    b: value(root, 'b'),
    c: value(root, 'c'),
    angleA: value(root, 'angleA'),
    angleB: value(root, 'angleB'),
    angleC: value(root, 'angleC'),
    angleUnit: value(root, 'angleUnit') || DEFAULT_ANGLE_UNIT,
  };
}

/** The example the page shows on load — the reference's own worked case. */
export const TRIANGLE_EXAMPLE_VALUES: TriangleValues = {
  ...EMPTY_VALUES,
  a: '1',
  b: '1',
  angleC: '60',
};

export const triangleBinding: FormCalculatorBinding<TriangleValues, TriangleComputed> = {
  readValues: readTriangleValues,
  validate: validateTriangle,
  compute: computeTriangle,
  resultValue: completeTriangleValue,
  describeResult: describeTriangle,
  renderResult(result, context: FormRenderContext) {
    const p = presentTriangle(result);
    const host = context.result.querySelector<HTMLElement>('[data-tri-solutions]');
    if (host) renderSolutions(host, p);

    const a11y = context.result.querySelector<HTMLElement>(
      '[data-result-when~="valid"] [data-result-value-a11y]',
    );
    if (a11y) a11y.textContent = p.a11y;

    const value = context.result.querySelector<HTMLElement>(
      '[data-result-when~="valid"] [data-result-value]',
    );
    if (value) value.textContent = p.solutions[0]?.area ?? '';
  },
  resetValues(root, _mode: ResetMode) {
    for (const name of [...SIDE_FIELDS, ...ANGLE_FIELDS]) {
      const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (el) el.value = '';
    }
    const unit = root.querySelector<HTMLSelectElement>('[name="angleUnit"]');
    if (unit) unit.value = DEFAULT_ANGLE_UNIT;
  },
};

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** A labelled line: "Side a = 1". */
const line = (label: string, value: string, extra = ''): HTMLElement => {
  const row = el('p', 'tri-line');
  row.appendChild(el('span', 'tri-line__label', label));
  row.appendChild(el('span', 'tri-line__eq', ' = '));
  row.appendChild(el('span', 'tri-line__value', value));
  if (extra) row.appendChild(el('span', 'tri-line__extra', extra));
  return row;
};

/**
 * The solved triangle, drawn to scale.
 *
 * Built here rather than in the island because the shape is data, not markup: the corners come
 * straight from the metrics, so the drawing and the printed coordinates can never disagree.
 */
function drawTriangle(points: [number, number][]): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const W = 260;
  const H = 170;
  const pad = 30;

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1));
  // y is flipped: the maths has y rising, the screen has it falling.
  const px = (p: [number, number]): [number, number] => [
    pad + (p[0] - minX) * scale,
    H - pad - (p[1] - minY) * scale,
  ];

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'tri-figure');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'The solved triangle, drawn to scale');

  const poly = document.createElementNS(NS, 'polygon');
  poly.setAttribute('points', points.map((p) => px(p).join(',')).join(' '));
  poly.setAttribute('class', 'tri-figure__shape');
  svg.appendChild(poly);

  ['A', 'B', 'C'].forEach((name, i) => {
    const [x, y] = px(points[i]);
    const centre = px([
      (points[0][0] + points[1][0] + points[2][0]) / 3,
      (points[0][1] + points[1][1] + points[2][1]) / 3,
    ]);
    const text = document.createElementNS(NS, 'text');
    // Nudge each label away from the centre so it sits outside the shape.
    text.setAttribute('x', String(x + (x - centre[0]) * 0.16));
    text.setAttribute('y', String(y + (y - centre[1]) * 0.16 + 4));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'tri-figure__label');
    text.textContent = name;
    svg.appendChild(text);
  });

  return svg;
}

export function renderSolutions(host: HTMLElement, p: TrianglePresentation): void {
  host.textContent = '';

  if (p.ambiguous) {
    host.appendChild(
      el(
        'p',
        'tri-ambiguous',
        'Two sides and an angle that is not between them can describe two different triangles. Both are shown.',
      ),
    );
  }

  p.solutions.forEach((s, i) => {
    const box = el('div', 'tri-solution');

    if (p.solutions.length > 1) {
      box.appendChild(el('p', 'tri-solution__index', i === 0 ? 'First triangle' : 'Second triangle'));
    }
    box.appendChild(el('h3', 'tri-kind', s.kind));

    const body = el('div', 'tri-body');
    const columns = el('div', 'tri-columns');

    const group = (rows: HTMLElement[]) => {
      const g = el('div', 'tri-group');
      for (const r of rows) g.appendChild(r);
      return g;
    };

    columns.appendChild(group(s.sides.map((x) => line(x.label, x.value))));
    columns.appendChild(
      group(
        s.angles.map((x) =>
          line(x.label, x.degrees, ` = ${x.radians}${x.pi ? ` = ${x.pi}` : ''}`),
        ),
      ),
    );
    columns.appendChild(
      group([
        line('Area', s.area),
        line('Perimeter p', s.perimeter),
        line('Semiperimeter s', s.semiperimeter),
      ]),
    );
    columns.appendChild(group(s.heights.map((x) => line(x.label, x.value))));
    columns.appendChild(group(s.medians.map((x) => line(x.label, x.value))));
    columns.appendChild(
      group([line('Inradius r', s.inradius), line('Circumradius R', s.circumradius)]),
    );
    columns.appendChild(
      group([
        line('Vertex coordinates', s.vertices),
        line('Centroid', s.centroid),
        line('Inscribed circle center', s.incenter),
        line('Circumscribed circle center', s.circumcenter),
      ]),
    );

    body.appendChild(columns);
    const figure = el('div', 'tri-figure-wrap');
    figure.appendChild(drawTriangle(s.points));
    body.appendChild(figure);
    box.appendChild(body);
    host.appendChild(box);
  });
}
