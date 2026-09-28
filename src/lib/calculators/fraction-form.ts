/**
 * Fraction form layer — ONE binding factory, six calculators.
 *
 * The reference is not one fraction calculator but six, each with its own fields, its own button
 * and its own result: the fraction calculator, mixed numbers, simplify, decimal to fraction,
 * fraction to decimal, and a big-number one for integers that do not fit anywhere else. They stay
 * six separate calculators here too — none of them is a mode of another.
 *
 * As with concrete, area and volume, six calculators do not need six bindings. A spec says which
 * fields a calculator has and how to read them; `makeFractionBinding` turns a spec into a binding
 * on the UNCHANGED standard-form runtime. There is no `isUsableResult` — the complete-result guard
 * lives in `resultValue` as a NaN sentinel, and it reconciles by re-solving from the raw values.
 *
 * No arithmetic happens in this file. Parsing and validation do; every sum, every reduction and
 * every step line comes from `./fraction`.
 */
import {
  frac,
  applyOp,
  reduce,
  decimalString,
  fractionText,
  mixedText,
  mixedParts,
  isImproper,
  combineSteps,
  simplifySteps,
  decimalSteps,
  tOf,
  tMixed,
  tText,
  tFrac,
  OP_SYMBOL,
  FRACTION_OPS,
  type Frac,
  type FractionOp,
  type FracToken,
  type StepLine,
} from './fraction';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type FractionKey =
  | 'fraction'
  | 'mixed'
  | 'simplify'
  | 'decimal2fraction'
  | 'fraction2decimal'
  | 'bignumber';

/** How the island draws a calculator's inputs. Each is a different arrangement, not a variant. */
export type FractionLayout = 'pair' | 'text-pair' | 'simplify' | 'decimal' | 'single-fraction';

export interface FractionSpec {
  key: FractionKey;
  title: string;
  /** One line under the heading, as the reference captions the big-number one. */
  lede?: string;
  layout: FractionLayout;
  /** Field names in DOM order — the island renders from these, so markup cannot drift. */
  fields: string[];
  hasOp: boolean;
  /** Arbitrarily long integers allowed, and the working shown compactly. */
  big: boolean;
  emptyMessage: string;
  invalidMessage: string;
  example: Record<string, string>;
}

export const DEFAULT_OP: FractionOp = 'add';

/** Above this many digits a plain calculator sends the visitor to the big-number one, as the
 *  reference's own split between the two implies. The big-number calculator has no limit. */
const PLAIN_DIGIT_LIMIT = 15;

export const MSG = {
  required: 'Enter a value.',
  numRequired: 'Enter a numerator.',
  denRequired: 'Enter a denominator.',
  integer: 'Enter a whole number.',
  denZero: 'The denominator cannot be zero.',
  divZero: 'Cannot divide by a fraction that equals zero.',
  opInvalid: 'Choose an operation.',
  mixedFormat: 'Enter a whole number, a fraction like 3/4, or a mixed number like 2 3/4.',
  decimalFormat: 'Enter a decimal number, like 1.375.',
  tooLong: `More than ${PLAIN_DIGIT_LIMIT} digits — use the Big Number Fraction Calculator.`,
} as const;

/* ------------------------------------------------------------------ */
/* The six specs, in the reference's order                             */
/* ------------------------------------------------------------------ */

export const FRACTION_SPECS: FractionSpec[] = [
  {
    key: 'fraction',
    title: 'Fraction Calculator',
    lede: 'Add, subtract, multiply or divide two fractions, and see the working.',
    layout: 'pair',
    fields: ['an', 'ad', 'bn', 'bd'],
    hasOp: true,
    big: false,
    emptyMessage: 'Enter two fractions, choose an operation, then calculate.',
    invalidMessage: 'Enter whole numbers, with a denominator that is not zero.',
    example: { an: '2', ad: '7', bn: '3', bd: '8', op: 'add' },
  },
  {
    key: 'mixed',
    title: 'Mixed Numbers Calculator',
    lede: 'Whole numbers and fractions together — type them as "2 3/4".',
    layout: 'text-pair',
    fields: ['a', 'b'],
    hasOp: true,
    big: false,
    emptyMessage: 'Enter two mixed numbers, choose an operation, then calculate.',
    invalidMessage: 'Enter each value as a whole number, a fraction, or a mixed number.',
    example: { a: '-2 3/4', b: '3 5/7', op: 'add' },
  },
  {
    key: 'simplify',
    title: 'Simplify Fractions Calculator',
    lede: 'Reduce a fraction — or a mixed number — to its lowest terms.',
    layout: 'simplify',
    fields: ['whole', 'num', 'den'],
    hasOp: false,
    big: false,
    emptyMessage: 'Enter a fraction, with a whole number in front of it if you have one.',
    invalidMessage: 'Enter whole numbers, with a denominator that is not zero.',
    example: { whole: '2', num: '21', den: '98' },
  },
  {
    key: 'decimal2fraction',
    title: 'Decimal to Fraction Calculator',
    lede: 'Turn a decimal into a fraction in lowest terms.',
    layout: 'decimal',
    fields: ['value'],
    hasOp: false,
    big: false,
    emptyMessage: 'Enter a decimal, then calculate the fraction it stands for.',
    invalidMessage: 'Enter a decimal number, like 1.375.',
    example: { value: '1.375' },
  },
  {
    key: 'fraction2decimal',
    title: 'Fraction to Decimal Calculator',
    lede: 'Divide a numerator by a denominator to fourteen significant figures.',
    layout: 'single-fraction',
    fields: ['num', 'den'],
    hasOp: false,
    big: false,
    emptyMessage: 'Enter a fraction, then calculate its decimal value.',
    invalidMessage: 'Enter whole numbers, with a denominator that is not zero.',
    example: { num: '2', den: '7' },
  },
  {
    key: 'bignumber',
    title: 'Big Number Fraction Calculator',
    lede: 'Use this calculator if the numerators or denominators are very big integers.',
    layout: 'pair',
    fields: ['an', 'ad', 'bn', 'bd'],
    hasOp: true,
    big: true,
    emptyMessage: 'Enter two fractions of any size, choose an operation, then calculate.',
    invalidMessage: 'Enter whole numbers, with a denominator that is not zero.',
    example: {
      an: '1234',
      ad: '748892928829',
      bn: '33434421132232234333',
      bd: '8877277388288288288',
      op: 'add',
    },
  },
];

export const getFractionSpec = (key: FractionKey): FractionSpec =>
  FRACTION_SPECS.find((s) => s.key === key) ?? FRACTION_SPECS[0];

/* ------------------------------------------------------------------ */
/* Parsing — strict, never Number(v) || 0                              */
/* ------------------------------------------------------------------ */

export type Parsed<T> = T | 'empty' | 'invalid' | 'toolong';

const INT = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const MIXED = /^([+-]?)\s*(?:(\d+)\s+(\d+)\s*\/\s*(\d+)|(\d+)\s*\/\s*(\d+)|(\d+))$/;

const digitCount = (s: string): number => s.replace(/[^\d]/g, '').length;

/** A whole number of any sign, as a BigInt. Length-capped unless the calculator is the big one. */
export function parseInteger(raw: string, big: boolean): Parsed<bigint> {
  const s = (raw ?? '').trim();
  if (s === '') return 'empty';
  if (!INT.test(s)) return 'invalid';
  if (!big && digitCount(s) > PLAIN_DIGIT_LIMIT) return 'toolong';
  return BigInt(s);
}

/** "3", "3/4", "2 3/4", "-2 3/4" → a fraction. The sign applies to the whole value. */
export function parseMixed(raw: string): Parsed<Frac> {
  const s = (raw ?? '').trim();
  if (s === '') return 'empty';
  const m = MIXED.exec(s);
  if (!m) return 'invalid';
  if (digitCount(s) > PLAIN_DIGIT_LIMIT) return 'toolong';
  const negative = m[1] === '-';
  let value: Frac;
  if (m[2] !== undefined) {
    const den = BigInt(m[4]);
    if (den === 0n) return 'invalid';
    value = { n: BigInt(m[2]) * den + BigInt(m[3]), d: den };
  } else if (m[5] !== undefined) {
    const den = BigInt(m[6]);
    if (den === 0n) return 'invalid';
    value = { n: BigInt(m[5]), d: den };
  } else {
    value = { n: BigInt(m[7]), d: 1n };
  }
  // Not reduced: the working should quote back the fraction the visitor wrote, and only the
  // ANSWER is in lowest terms. "2 2/4" converts to 10/4, not to 5/2.
  return { n: negative ? -value.n : value.n, d: value.d };
}

export interface DecimalParts {
  text: string;
  integerDigits: string;
  decimalDigits: string;
  value: Frac;
}

/** "1.375" → 11/8, keeping the digits the working needs to quote back. */
export function parseDecimal(raw: string): Parsed<DecimalParts> {
  const s = (raw ?? '').trim();
  if (s === '') return 'empty';
  if (!DECIMAL.test(s)) return 'invalid';
  if (digitCount(s) > PLAIN_DIGIT_LIMIT) return 'toolong';
  const negative = s.startsWith('-');
  const body = s.replace(/^[+-]/, '');
  const [intPart = '', decPart = ''] = body.split('.');
  const magnitude = BigInt(`${intPart || '0'}${decPart}`);
  return {
    text: s,
    integerDigits: intPart,
    decimalDigits: decPart,
    value: reduce({ n: negative ? -magnitude : magnitude, d: 10n ** BigInt(decPart.length) }),
  };
}

export const asOp = (raw: string): FractionOp | null =>
  FRACTION_OPS.includes(raw as FractionOp) ? (raw as FractionOp) : null;

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

export type FractionValues = Record<string, string>;

const integerMessage = (p: 'empty' | 'invalid' | 'toolong', role: 'num' | 'den' | 'plain'): string => {
  if (p === 'toolong') return MSG.tooLong;
  if (p === 'invalid') return MSG.integer;
  return role === 'num' ? MSG.numRequired : role === 'den' ? MSG.denRequired : MSG.required;
};

export function validateFraction(spec: FractionSpec, v: FractionValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const integer = (name: string, role: 'num' | 'den' | 'plain', optional = false) => {
    const parsed = parseInteger(v[name] ?? '', spec.big);
    if (parsed === 'empty' && optional) return 0n;
    if (typeof parsed !== 'bigint') {
      fieldErrors[name] = integerMessage(parsed, role);
      return null;
    }
    if (role === 'den' && parsed === 0n) {
      fieldErrors[name] = MSG.denZero;
      return null;
    }
    return parsed;
  };

  if (spec.layout === 'pair') {
    integer('an', 'num');
    integer('ad', 'den');
    const bn = integer('bn', 'num');
    integer('bd', 'den');
    const op = asOp(v.op ?? '');
    if (op === null) fieldErrors.op = MSG.opInvalid;
    if (op === 'divide' && bn === 0n && !fieldErrors.bn) fieldErrors.bn = MSG.divZero;
  } else if (spec.layout === 'text-pair') {
    const parsedA = parseMixed(v.a ?? '');
    if (typeof parsedA === 'string') {
      fieldErrors.a = parsedA === 'empty' ? MSG.required : parsedA === 'toolong' ? MSG.tooLong : MSG.mixedFormat;
    }
    const parsedB = parseMixed(v.b ?? '');
    if (typeof parsedB === 'string') {
      fieldErrors.b = parsedB === 'empty' ? MSG.required : parsedB === 'toolong' ? MSG.tooLong : MSG.mixedFormat;
    }
    const op = asOp(v.op ?? '');
    if (op === null) fieldErrors.op = MSG.opInvalid;
    if (op === 'divide' && typeof parsedB !== 'string' && parsedB.n === 0n && !fieldErrors.b) {
      fieldErrors.b = MSG.divZero;
    }
  } else if (spec.layout === 'simplify') {
    integer('whole', 'plain', true);
    integer('num', 'num');
    integer('den', 'den');
  } else if (spec.layout === 'single-fraction') {
    integer('num', 'num');
    integer('den', 'den');
  } else {
    const parsed = parseDecimal(v.value ?? '');
    if (typeof parsed === 'string') {
      fieldErrors.value =
        parsed === 'empty' ? MSG.required : parsed === 'toolong' ? MSG.tooLong : MSG.decimalFormat;
    }
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Solving — every figure comes from ./fraction                        */
/* ------------------------------------------------------------------ */

/** One pie group: the circles standing for one fraction, with the symbol that precedes them. */
export interface PieGroup {
  lead?: string;
  circles: { slices: number; filled: number }[];
}

export interface FractionSolution {
  key: FractionKey;
  ok: boolean;
  /** The headline line — inputs, "=", answer. Null where the working IS the headline. */
  equation: StepLine | null;
  /** "Result in decimals:" — '' where the calculator does not print one. */
  decimal: string;
  steps: StepLine[];
  pies: PieGroup[];
  /** The answer in plain text, for the announcement and the sr-only result value. */
  answer: string;
  a11y: string;
}

const FAILED: FractionSolution = {
  key: 'fraction',
  ok: false,
  equation: null,
  decimal: '',
  steps: [],
  pies: [],
  answer: '',
  a11y: '',
};

/** The circles standing for one fraction: full ones, then the remainder. */
function piesFor(f: Frac): { slices: number; filled: number }[] | null {
  if (f.n < 0n || f.d > 60n) return null;
  const m = mixedParts(f);
  if (m.whole > 4n) return null;
  const den = Number(f.d);
  const circles = Array.from({ length: Number(m.whole) }, () => ({ slices: den, filled: den }));
  if (m.n > 0n || circles.length === 0) circles.push({ slices: den, filled: Number(m.n) });
  return circles;
}

/**
 * The equation drawn as pies, the way the reference illustrates it.
 *
 * Dropped entirely rather than approximated when it would not read: a negative quantity has no
 * pie, and neither does 1/997. A wrong picture is worse than no picture.
 */
function pieGroups(a: Frac, op: FractionOp, b: Frac, result: Frac): PieGroup[] {
  const parts = [piesFor(a), piesFor(b), piesFor(result)];
  if (parts.some((p) => p === null)) return [];
  const total = parts.reduce((sum, p) => sum + p!.length, 0);
  if (total > 9) return [];
  return [
    { circles: parts[0]! },
    { lead: OP_SYMBOL[op], circles: parts[1]! },
    { lead: '=', circles: parts[2]! },
  ];
}

const answerText = (f: Frac): string => {
  const mixed = mixedText(f);
  return mixed ? `${fractionText(f)} = ${mixed}` : fractionText(f);
};

/** The headline: the inputs, "=", the reduced answer, and its mixed reading when it has one. */
function equationLine(inputs: FracToken[], result: Frac): StepLine {
  const tokens = [...inputs, tText('='), tOf(result)];
  if (mixedText(result)) tokens.push(tText('='), tMixed(result));
  return { tokens };
}

export function solveFraction(spec: FractionSpec, v: FractionValues): FractionSolution {
  if (!validateFraction(spec, v).ok) return { ...FAILED, key: spec.key };

  const int = (name: string, fallback: bigint = 0n): bigint => {
    const parsed = parseInteger(v[name] ?? '', spec.big);
    return typeof parsed === 'bigint' ? parsed : fallback;
  };

  if (spec.layout === 'pair') {
    // As entered, not reduced — 2/4 + 1/2 must read back as 2/4 + 1/2, and 0/3 as 0/3.
    const a: Frac = { n: int('an'), d: int('ad', 1n) };
    const b: Frac = { n: int('bn'), d: int('bd', 1n) };
    const op = asOp(v.op ?? '') ?? DEFAULT_OP;
    const result = applyOp(a, op, b);
    const steps = combineSteps(a, op, b, spec.big);
    return {
      key: spec.key,
      ok: true,
      equation: spec.big ? null : equationLine([tOf(a), tText(OP_SYMBOL[op]), tOf(b)], result),
      decimal: spec.big ? '' : decimalString(result),
      steps,
      pies: spec.big ? [] : pieGroups(a, op, b, result),
      answer: answerText(result),
      a11y: `${fractionText(a)} ${OP_SYMBOL[op]} ${fractionText(b)} = ${answerText(result)}`,
    };
  }

  if (spec.layout === 'text-pair') {
    const pa = parseMixed(v.a ?? '');
    const pb = parseMixed(v.b ?? '');
    if (typeof pa === 'string' || typeof pb === 'string') return { ...FAILED, key: spec.key };
    const op = asOp(v.op ?? '') ?? DEFAULT_OP;
    const result = applyOp(pa, op, pb);
    // The written form is the mixed one the visitor typed; the working converts it first.
    const written: StepLine = { tokens: [tMixed(pa), tText(OP_SYMBOL[op]), tMixed(pb)] };
    const converted = combineSteps(pa, op, pb);
    const steps = isImproper(pa) || isImproper(pb) ? [written, ...converted.map(withEquals)] : converted;
    return {
      key: spec.key,
      ok: true,
      equation: equationLine([tMixed(pa), tText(OP_SYMBOL[op]), tMixed(pb)], result),
      decimal: decimalString(result),
      steps,
      pies: [],
      answer: answerText(result),
      a11y: `${v.a} ${OP_SYMBOL[op]} ${v.b} = ${answerText(result)}`,
    };
  }

  if (spec.layout === 'simplify') {
    const whole = int('whole');
    const num = int('num');
    const den = int('den', 1n);
    const negative = whole < 0n || (whole === 0n && num < 0n);
    const magnitude = (whole < 0n ? -whole : whole) * den + (num < 0n ? -num : num);
    const result = reduce({ n: negative ? -magnitude : magnitude, d: den });
    const input: FracToken =
      whole === 0n
        ? tFrac(num, den)
        : { t: 'mixed', w: String(whole), n: String(num < 0n ? -num : num), d: String(den) };
    return {
      key: spec.key,
      ok: true,
      equation: equationLine([input], result),
      decimal: decimalString(result),
      steps: simplifySteps(whole, num, den),
      pies: [],
      answer: answerText(result),
      a11y: `Simplified: ${answerText(result)}`,
    };
  }

  if (spec.layout === 'single-fraction') {
    const num = int('num');
    const den = int('den', 1n);
    const value = frac(num, den);
    const decimal = decimalString(value);
    return {
      key: spec.key,
      ok: true,
      equation: { tokens: [tFrac(num, den), tText('='), tText(decimal)] },
      decimal: '',
      steps: [],
      pies: [],
      answer: decimal,
      a11y: `${num}/${den} = ${decimal}`,
    };
  }

  const parsed = parseDecimal(v.value ?? '');
  if (typeof parsed === 'string') return { ...FAILED, key: spec.key };
  return {
    key: spec.key,
    ok: true,
    equation: equationLine([tText(parsed.text)], parsed.value),
    decimal: '',
    steps: decimalSteps(parsed.text, parsed.integerDigits, parsed.decimalDigits),
    pies: [],
    answer: answerText(parsed.value),
    a11y: `${parsed.text} = ${answerText(parsed.value)}`,
  };
}

/** The first line of a working becomes a continuation once something precedes it. */
const withEquals = (line: StepLine, i: number): StepLine => (i === 0 ? { ...line, lead: '=' } : line);

/* ------------------------------------------------------------------ */
/* Computed + the complete-result guard                                */
/* ------------------------------------------------------------------ */

export interface FractionComputed {
  key: FractionKey;
  values: FractionValues;
  solution: FractionSolution;
}

export function computeFraction(spec: FractionSpec, v: FractionValues): FractionComputed {
  return { key: spec.key, values: { ...v }, solution: solveFraction(spec, v) };
}

const serialize = (s: FractionSolution): string =>
  JSON.stringify([s.ok, s.equation, s.decimal, s.steps, s.pies, s.answer]);

/**
 * A finite number only when the whole result reconciles with a fresh solve.
 *
 * The answer here is a pair of BigInts, not a number, so there is no meaningful numeric result to
 * gate on — a fraction whose decimal overflows to Infinity is still an exact, correct answer. The
 * sentinel is therefore 1 for a reconciled result and NaN for anything else, which is exactly what
 * the runtime's default finite gate needs.
 */
export function completeFractionValue(spec: FractionSpec, r: FractionComputed): number {
  if (r.key !== spec.key) return Number.NaN;
  if (!r.solution.ok) return Number.NaN;
  if (!validateFraction(spec, r.values).ok) return Number.NaN;
  if (serialize(solveFraction(spec, r.values)) !== serialize(r.solution)) return Number.NaN;
  if (r.solution.answer === '' || /NaN|Infinity|undefined|—/.test(r.solution.answer)) return Number.NaN;
  return 1;
}

export function describeFraction(spec: FractionSpec, r: FractionComputed): string {
  return r.solution.ok ? `${spec.title}: ${r.solution.a11y}` : '';
}

/* ------------------------------------------------------------------ */
/* Rendering (DOM) — tokens in, elements out                           */
/* ------------------------------------------------------------------ */

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

/** One token. A fraction is stacked over a rule, which is the whole point of drawing it. */
export function renderToken(token: FracToken): HTMLElement {
  if (token.t === 'text') {
    const span = el('span', 'fx-text');
    span.textContent = token.v;
    return span;
  }
  const wrap = el('span', 'fx-group');
  if (token.t === 'mixed') {
    const whole = el('span', 'fx-whole');
    whole.textContent = token.w;
    wrap.appendChild(whole);
  }
  const stack = el('span', 'fx-frac');
  const num = el('span', 'fx-num');
  num.textContent = token.n;
  const den = el('span', 'fx-den');
  den.textContent = token.d;
  stack.append(num, den);
  wrap.appendChild(stack);
  return wrap;
}

export function renderLine(line: StepLine): HTMLElement {
  const row = el('div', 'fx-line');
  const lead = el('span', 'fx-lead');
  lead.textContent = line.lead ?? '';
  row.appendChild(lead);
  for (const token of line.tokens) row.appendChild(renderToken(token));
  return row;
}

/** A pie: `slices` equal sectors with the first `filled` of them shaded. */
export function renderPie(slices: number, filled: number): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'fx-pie');
  svg.setAttribute('aria-hidden', 'true');
  const r = 46;
  const point = (i: number) => {
    const angle = (i / slices) * Math.PI * 2 - Math.PI / 2;
    return `${(50 + r * Math.cos(angle)).toFixed(3)} ${(50 + r * Math.sin(angle)).toFixed(3)}`;
  };
  // Thin the dividing lines as the slices multiply: at fifty-six slices a two-pixel stroke on each
  // one leaves a solid disc of outline and no readable fraction at all.
  const stroke = slices <= 12 ? 2 : slices <= 30 ? 1.1 : 0.6;
  for (let i = 0; i < slices; i += 1) {
    const path = document.createElementNS(NS, 'path');
    const large = 1 / slices > 0.5 ? 1 : 0;
    path.setAttribute('d', `M50 50 L${point(i)} A${r} ${r} 0 ${large} 1 ${point(i + 1)} Z`);
    path.setAttribute('class', i < filled ? 'fx-slice fx-slice--on' : 'fx-slice');
    path.setAttribute('stroke-width', String(stroke));
    svg.appendChild(path);
  }
  return svg;
}

export function renderFractionResult(
  spec: FractionSpec,
  result: FractionComputed,
  context: FormRenderContext,
): void {
  const scope = context.result;
  const s = result.solution;
  const find = (sel: string) => scope.querySelector<HTMLElement>(sel);

  const equation = find('[data-fr-equation]');
  if (equation) {
    equation.textContent = '';
    equation.hidden = !s.equation;
    if (s.equation) equation.appendChild(renderLine(s.equation));
  }

  const decimalRow = find('[data-fr-decimal-row]');
  if (decimalRow) decimalRow.hidden = s.decimal === '';
  const decimal = find('[data-fr-decimal]');
  if (decimal) decimal.textContent = s.decimal;

  const pies = find('[data-fr-pies]');
  if (pies) {
    pies.textContent = '';
    pies.hidden = s.pies.length === 0;
    for (const group of s.pies) {
      if (group.lead) {
        const lead = el('span', 'fx-pie-op');
        lead.textContent = group.lead;
        pies.appendChild(lead);
      }
      const set = el('span', 'fx-pie-set');
      for (const circle of group.circles) set.appendChild(renderPie(circle.slices, circle.filled));
      pies.appendChild(set);
    }
  }

  const stepsRow = find('[data-fr-steps-row]');
  if (stepsRow) stepsRow.hidden = s.steps.length === 0;
  const steps = find('[data-fr-steps]');
  if (steps) {
    steps.textContent = '';
    for (const line of s.steps) steps.appendChild(renderLine(line));
  }

  const value = find('[data-result-when~="valid"] [data-result-value]');
  if (value) value.textContent = s.answer;
  const a11y = find('[data-result-when~="valid"] [data-result-value-a11y]');
  if (a11y) a11y.textContent = s.a11y;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const fieldValue = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';

export function readFractionValues(root: HTMLElement, spec: FractionSpec): FractionValues {
  const values: FractionValues = {};
  for (const name of spec.fields) values[name] = fieldValue(root, name);
  if (spec.hasOp) values.op = fieldValue(root, 'op');
  return values;
}

/** One binding per calculator, built from its spec — never six hand-written bindings. */
export function makeFractionBinding(
  spec: FractionSpec,
): FormCalculatorBinding<FractionValues, FractionComputed> {
  return {
    readValues: (root) => readFractionValues(root, spec),
    validate: (v) => validateFraction(spec, v),
    compute: (v) => computeFraction(spec, v),
    resultValue: (r) => completeFractionValue(spec, r),
    describeResult: (r) => describeFraction(spec, r),
    renderResult: (r, context) => renderFractionResult(spec, r, context),
    resetValues(root, _mode: ResetMode) {
      for (const name of spec.fields) {
        const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
        if (input) input.value = '';
      }
      if (spec.hasOp) {
        const op = root.querySelector<HTMLSelectElement>('[name="op"]');
        if (op) op.value = DEFAULT_OP;
      }
    },
  };
}

/**
 * Example values for the labelled worked result each calculator shows on load.
 *
 * These are OURS, not the visitor's: the runtime computes them and calls the binding's own
 * renderResult, so the example reuses the real result markup and can never drift from the engine.
 */
export const fractionExampleValues = (spec: FractionSpec): FractionValues => ({ ...spec.example });

/** The first calculator's binding and example, for the fleet-wide contracts. */
export const fractionBinding = makeFractionBinding(FRACTION_SPECS[0]);
export const FRACTION_EXAMPLE_VALUES = fractionExampleValues(FRACTION_SPECS[0]);
