/**
 * The "Other Units" converter panel — shared behaviour.
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
