/**
 * Conversion form binding (R18C3 — task-first Conversion migration; calculator-OWNED binding on the
 * UNCHANGED standard-form runtime).
 *
 * Wraps the UNCHANGED `convert` / `CATEGORIES` (frozen by conversion.test.ts) — factor-based across
 * six multiplicative categories plus the one AFFINE category (temperature, via Celsius). Everything
 * here is at the VALIDATION / PRESENTATION boundary; no conversion mathematics is reimplemented, and
 * there is NO generic converter runtime, units framework, dependent-dropdown runtime or shared
 * unit-selector abstraction — the category → From/To dependency stays calculator-owned (in the
 * island) and the binding just reads + guards the current selection.
 *
 * Product decisions (R18C3):
 *   • Task-first: the numeric value starts at the neutral converter value 1, the From/To units default
 *     deterministically to each category's first two distinct units (units[0] → units[1]), the result
 *     is EMPTY, and the visitor presses Convert for the first result (live-after-first thereafter). No
 *     calculation on load merely because Value = 1.
 *   • Strict numeric parsing — finite, decimals + scientific notation accepted, zero valid; empty /
 *     malformed / non-finite are field errors. NEVER `Number(value) || 0`. The source computes any
 *     finite value (temperature genuinely needs negatives, e.g. −40 °C), and the legacy public field
 *     imposed no minimum, so the visitor domain is ANY finite number for EVERY category — no invented
 *     per-category sign restriction, no arbitrary cap.
 *   • Category and units are constrained `<select>`s (the visitor cannot type an invalid one); the
 *     binding still DEFENSIVELY guards that the category is known and both units belong to it.
 *   • NO isUsableResult — the complete-result guard lives in resultValue (the converted output),
 *     reconciled via a fresh `convert` recompute; a legitimate 0 output (e.g. 0 km → mi) is a finite 0
 *     the runtime's default gate accepts.
 */
import { convert, convertToAll, formatConverted, CATEGORIES, type UnitDef } from './conversion';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.key, c]));

export const DEFAULT_CATEGORY = CATEGORIES[0].key; // 'length'

/**
 * The units a category opens on — the conversion people actually come for, declared on the category
 * itself. Falls back to the first two units if a category ever ships without a pair.
 */
export function defaultUnits(categoryKey: string): { from: string; to: string } {
  const cat = CATEGORY_MAP.get(categoryKey) ?? CATEGORIES[0];
  const known = new Set(cat.units.map((u) => u.key));
  const [from, to] = cat.defaults ?? [];
  if (from && to && known.has(from) && known.has(to)) return { from, to };
  return {
    from: cat.units[0]?.key ?? '',
    to: cat.units[Math.min(1, cat.units.length - 1)]?.key ?? cat.units[0]?.key ?? '',
  };
}

export interface ConversionValues {
  category: string;
  from: string;
  to: string;
  value: string;
}

export interface ConversionComputed {
  category: string;
  categoryLabel: string;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  input: number;
  output: number;
}

export const MSG = {
  valueRequired: 'Enter a value to convert.',
  valueInvalid: 'Enter a number to convert.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;
/** A finite number of any sign (decimals + scientific accepted; zero valid). Empty is distinct from
 *  invalid. Non-finite ('Infinity', garbage) is invalid. */
export function parseValue(raw: string): NumParse {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n)) return 'invalid';
  return n;
}

export function validateConversion(v: ConversionValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const value = parseValue(v.value);
  if (value === 'empty') fieldErrors.value = MSG.valueRequired;
  else if (value === 'invalid') fieldErrors.value = MSG.valueInvalid;
  // Category + units are constrained selects; the complete-result guard defends against a malformed
  // pairing rather than surfacing a field error the visitor cannot cause.
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — pass-through to the frozen source              */
/* ------------------------------------------------------------------ */

const unitLabel = (categoryKey: string, unitKey: string): string =>
  CATEGORY_MAP.get(categoryKey)?.units.find((u) => u.key === unitKey)?.label ?? unitKey;

export function computeConversion(v: ConversionValues): ConversionComputed {
  const input = Number(v.value);
  return {
    category: v.category,
    categoryLabel: CATEGORY_MAP.get(v.category)?.label ?? v.category,
    from: v.from,
    to: v.to,
    fromLabel: unitLabel(v.category, v.from),
    toLabel: unitLabel(v.category, v.to),
    input,
    output: convert(input, v.from, v.to, v.category),
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result

/** The converted output — but ONLY when the whole conversion is coherent: a known category, both
 *  units belonging to it, a finite input, a finite output, and a fresh `convert` recompute
 *  reproducing that output. A same-unit identity and a legitimate 0 output are valid finite results.
 *  The conversion math is never rebuilt here. */
export function completeConversionValue(r: ConversionComputed): number {
  const cat = CATEGORY_MAP.get(r.category);
  if (!cat) return FAIL;
  const known = new Set(cat.units.map((u) => u.key));
  if (!known.has(r.from) || !known.has(r.to)) return FAIL;
  if (!Number.isFinite(r.input) || !Number.isFinite(r.output)) return FAIL;

  const recomputed = convert(r.input, r.from, r.to, r.category);
  if (!Number.isFinite(recomputed) || recomputed !== r.output) return FAIL;
  return r.output; // finite; a 0 output (e.g. 0 km → mi) is a valid result the default gate accepts
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/**
 * The converted value, in significant figures rather than fixed decimals.
 *
 * Six fractional digits used to turn one byte in gigabytes into "0" — not a rounding error but a
 * wrong answer to a question the tool exists to answer. See `formatConverted`.
 */
export const formatValue = (n: number): string => formatConverted(n);

/** One row of the same quantity expressed in every unit of its category. */
export interface AllUnitRow {
  key: string;
  label: string;
  note?: string;
  value: string;
  /** True for the unit the visitor is converting TO, so a view can mark it. */
  isTarget: boolean;
  /** True for the unit they are converting FROM. */
  isSource: boolean;
}

/**
 * The same quantity in every unit of its category.
 *
 * One conversion answers all of them, and the extra rows cost nothing to compute — so showing only
 * the requested pair throws away the most useful part of the answer. A visitor converting a recipe
 * wants tablespoons AND millilitres, not one of them and a second trip through the form.
 */
export function allUnitRows(r: ConversionComputed): AllUnitRow[] {
  return convertToAll(r.input, r.from, r.category).map(({ unit, value }: { unit: UnitDef; value: number }) => ({
    key: unit.key,
    label: unit.label,
    note: unit.note,
    value: formatConverted(value),
    isTarget: unit.key === r.to,
    isSource: unit.key === r.from,
  }));
}

/** The full equation, e.g. "1 Kilometres = 0.621371 Miles" (mirrors the legacy summary format). */
export function conversionEquation(r: ConversionComputed): string {
  return `${formatValue(r.input)} ${r.fromLabel} = ${formatValue(r.output)} ${r.toLabel}`;
}

/** Concise announcement — the dominant converted value only (§15). A 0 result announces normally. */
export function describeConversionResult(r: ConversionComputed): string {
  return `Converted value: ${formatValue(r.output)} ${r.toLabel}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

export const conversionBinding: FormCalculatorBinding<ConversionValues, ConversionComputed> = {
  readValues(root) {
    return {
      category: control(root, 'category')?.value ?? DEFAULT_CATEGORY,
      from: control(root, 'from')?.value ?? '',
      to: control(root, 'to')?.value ?? '',
      value: control(root, 'value')?.value ?? '',
    };
  },

  validate: validateConversion,

  compute: computeConversion,

  /** Complete-result guard as the ordinary result value — no isUsableResult. */
  resultValue: completeConversionValue,

  describeResult: describeConversionResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    const out = formatValue(result.output);
    // Dominant: the converted value (shown + spoken with the target-unit label).
    set('[data-result-when~="valid"] [data-result-value]', out);
    set('[data-result-when~="valid"] [data-result-value-a11y]', `${out} ${result.toLabel}`);
    // Target-unit caption beneath the dominant value.
    set('[data-cv-unit]', result.toLabel);
    // Supporting: the full equation (the primary answer, both sides).
    set('[data-cv-equation]', conversionEquation(result));
    set('[data-cv-category]', result.categoryLabel.toLowerCase());

    // The whole category, built with text APIs only — never markup from a string.
    const all = scope.querySelector<HTMLElement>('[data-cv-all]');
    if (all) {
      all.textContent = '';
      for (const row of allUnitRows(result)) {
        const line = document.createElement('div');
        line.className = 'cv-row';
        if (row.isTarget) line.classList.add('cv-row--target');
        if (row.isSource) line.classList.add('cv-row--source');

        const dt = document.createElement('dt');
        dt.textContent = row.label;
        if (row.note) {
          const note = document.createElement('span');
          note.className = 'cv-row__note';
          note.textContent = ` (${row.note})`;
          dt.appendChild(note);
        }
        const dd = document.createElement('dd');
        dd.textContent = row.value;

        line.append(dt, dd);
        all.appendChild(line);
      }
    }
  },

  resetValues(root, _mode: ResetMode) {
    // Restore the default category + the neutral value 1; the island rebuilds the dependent From/To
    // options for the default category and re-selects its deterministic defaults.
    const catSel = control(root, 'category');
    if (catSel) catSel.value = DEFAULT_CATEGORY;
    const valEl = control(root, 'value');
    if (valEl) valEl.value = '1';
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * Example inputs for the labelled worked result shown on first load.
 *
 * These are OURS, not the visitor's. The shared runtime computes them and calls
 * this binding's own `renderResult`, so the example reuses the calculator's real
 * result markup and can never drift from the engine. The visitor's fields are
 * never written to — they load and stay empty behind it.
 */
export const CONVERSION_EXAMPLE_VALUES: ConversionValues = { category: 'length', from: 'm', to: 'ft', value: '1' };
