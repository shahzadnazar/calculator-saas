/**
 * The "Other Units" converters — shared behaviour.
 *
 * Two shapes, because the reference product uses two. `mountUnitConverterPanel` drives the
 * five-category panel (body fat, ideal weight); `mountFieldConverters` drives the small
 * per-field converters some calculators use instead — one row per quantity the calculator
 * asks for, each with its own From and To unit and its own answer line.
 *
 *
 * Several reference calculators put a small unit converter above the tool rather than
 * inside it: a third tab that is not a third unit system, but a helper for someone whose
 * scales read in stones or whose tape reads in feet. The calculator keeps whatever system
 * it was on; the panel just hands them a number to type into the boxes.
 *
 * It reuses the site's own tested CATEGORIES/convert, so there is exactly one table of
 * conversion factors on this site and the panel can never drift away from the conversion
 * calculator.
 *
 * Pairs with `@components/calc/UnitConverterPanel.astro`, which owns the markup this
 * function looks for. Both halves are addressed through `data-conv-*` hooks so the
 * markup can be restyled per calculator without touching the behaviour.
 */
import { CATEGORIES, convert } from './conversion';

/** The panel's categories, in the reference's order. `mass` is labelled "Weight". */
export const CONVERTER_ORDER = ['length', 'temperature', 'area', 'volume', 'mass'];

export const CONVERTER_CATEGORIES = CONVERTER_ORDER.map(
  (key) => CATEGORIES.find((c) => c.key === key)!,
).filter(Boolean);

/** The panel's own label for a category — "Weight / Mass" is too long for a tab. */
export function converterCategoryLabel(key: string, label: string): string {
  return key === 'mass' ? 'Weight' : label;
}

/**
 * Wire the converter inside `root`: the toggle that opens it, the category tabs, both
 * value boxes (either one may be typed into) and the sentence that says what happened.
 *
 * A no-op when the panel is absent, so a calculator can adopt it by adding the markup.
 */
export function mountUnitConverterPanel(root: HTMLElement): void {
  const panel = root.querySelector<HTMLElement>('[data-converter]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-converter-toggle]');
  const fromValue = root.querySelector<HTMLInputElement>('[data-conv-from-value]');
  const toValue = root.querySelector<HTMLInputElement>('[data-conv-to-value]');
  const fromUnit = root.querySelector<HTMLSelectElement>('[data-conv-from-unit]');
  const toUnit = root.querySelector<HTMLSelectElement>('[data-conv-to-unit]');
  const sentence = root.querySelector<HTMLElement>('[data-conv-sentence]');
  if (!panel || !toggle || !fromValue || !toValue || !fromUnit || !toUnit) return;

  let category = 'length';

  const fillUnits = () => {
    const cat = CATEGORIES.find((c) => c.key === category);
    if (!cat) return;
    for (const select of [fromUnit, toUnit]) {
      select.replaceChildren();
      for (const u of cat.units) {
        const opt = document.createElement('option');
        opt.value = u.key;
        opt.textContent = u.label;
        select.append(opt);
      }
    }
    fromUnit.selectedIndex = 0;
    toUnit.selectedIndex = Math.min(1, cat.units.length - 1);
  };

  const label = (select: HTMLSelectElement) => select.selectedOptions[0]?.textContent ?? '';

  /** Convert in the direction the visitor last typed. */
  const run = (direction: 'forward' | 'back') => {
    const source = direction === 'forward' ? fromValue : toValue;
    const target = direction === 'forward' ? toValue : fromValue;
    const a = direction === 'forward' ? fromUnit : toUnit;
    const b = direction === 'forward' ? toUnit : fromUnit;
    const raw = source.value.trim();
    if (raw === '') {
      target.value = '';
      if (sentence) sentence.textContent = '';
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      target.value = '';
      if (sentence) sentence.textContent = 'Enter a number to convert.';
      return;
    }
    const out = convert(n, a.value, b.value, category);
    if (!Number.isFinite(out)) {
      target.value = '';
      if (sentence) sentence.textContent = 'Those two units cannot be converted.';
      return;
    }
    const rounded = Math.round(out * 1e6) / 1e6;
    target.value = String(rounded);
    if (sentence) sentence.textContent = `${n} ${label(a)} = ${rounded} ${label(b)}`;
  };

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) fromValue.focus();
  });

  root.querySelectorAll<HTMLButtonElement>('[data-conv-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      category = btn.dataset.convCat ?? 'length';
      root
        .querySelectorAll<HTMLElement>('[data-conv-cat]')
        .forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      fillUnits();
      run('forward');
    });
  });

  fromValue.addEventListener('input', () => run('forward'));
  toValue.addEventListener('input', () => run('back'));
  fromUnit.addEventListener('change', () => run('forward'));
  toUnit.addEventListener('change', () => run('forward'));
  fillUnits();
}

/* ------------------------------------------------------------------ */
/* The per-field converters ("Height Converter" / "Weight Converter")  */
/* ------------------------------------------------------------------ */

/**
 * Wire the per-field converters inside `root`: the toggle that opens the panel, the close
 * button, and one row per `[data-fieldconv]` — a value box, a From unit, a To unit, a
 * convert button and the line that answers.
 *
 * Each row names its own conversion category through `data-fieldconv-category`, so a height
 * row offers lengths and a weight row offers masses; both read the same shared CATEGORIES.
 * Unlike the five-category panel this one answers only when ASKED — the reference's rows
 * have a convert button and the answer stays put until you press it again.
 *
 * A no-op when the panel is absent.
 */
export function mountFieldConverters(root: HTMLElement): void {
  const panel = root.querySelector<HTMLElement>('[data-converter]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-converter-toggle]');
  if (!panel || !toggle) return;

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    setOpen(open);
    if (open) panel.querySelector<HTMLInputElement>('[data-fieldconv-value]')?.focus();
  });

  root.querySelector<HTMLButtonElement>('[data-converter-close]')?.addEventListener('click', () => {
    setOpen(false);
    toggle.focus();
  });

  for (const rowEl of root.querySelectorAll<HTMLElement>('[data-fieldconv]')) {
    const category = rowEl.dataset.fieldconvCategory ?? 'length';
    const value = rowEl.querySelector<HTMLInputElement>('[data-fieldconv-value]');
    const from = rowEl.querySelector<HTMLSelectElement>('[data-fieldconv-from]');
    const to = rowEl.querySelector<HTMLSelectElement>('[data-fieldconv-to]');
    const go = rowEl.querySelector<HTMLButtonElement>('[data-fieldconv-go]');
    const out = rowEl.querySelector<HTMLElement>('[data-fieldconv-out]');
    if (!value || !from || !to || !go || !out) continue;

    const label = (select: HTMLSelectElement) => select.selectedOptions[0]?.textContent ?? '';

    const run = () => {
      const raw = value.value.trim();
      if (raw === '') {
        out.textContent = '';
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        out.textContent = 'Enter a number to convert.';
        return;
      }
      const converted = convert(n, from.value, to.value, category);
      if (!Number.isFinite(converted)) {
        out.textContent = 'Those two units cannot be converted.';
        return;
      }
      out.textContent = `${n} ${label(from)} = ${Math.round(converted * 1e6) / 1e6} ${label(to)}`;
    };

    go.addEventListener('click', run);
    // Enter inside the box is the same request as pressing the button, and must not
    // submit the calculator's form.
    value.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      run();
    });
    // A changed unit invalidates the answer on screen; blank it rather than leave a stale one.
    for (const select of [from, to]) select.addEventListener('change', () => (out.textContent = ''));
  }
}
